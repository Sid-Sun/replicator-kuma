import { existsSync, promises as fs } from "fs";
import { join } from "path";
import { config, exportPath } from "./config.js";
import { DatabaseCommon } from "./database-common.js";
import { generateInsertStatement } from "./csv2sql.js";

class DatabaseImporter extends DatabaseCommon {
  async runStatements(statements) {
    for (const statement of statements) {
      if (this.mysqlConnection) {
        await this.mysqlConnection.execute(statement);
      } else {
        await new Promise((resolve, reject) => {
          this.sqliteConnection.exec(statement, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }
    }
  }

  async importLocalEntityTable(filePath, tableName) {
    // create leader table and run import
    const sql = await fs.readFile(filePath, "utf-8");
    const statements = sql.split(/;\s*$/m).filter((s) => s.trim().length > 0);
    if (this.mysqlConnection) {
      statements.unshift(
        `CREATE TABLE IF NOT EXISTS \`leader_${tableName}\` LIKE \`${tableName}\`;`
      );
    } else {
      statements.unshift(
        `CREATE TABLE IF NOT EXISTS \`leader_${tableName}\` AS SELECT * FROM \`${tableName}\`WHERE 0;`
      );
    }
    statements.push(`DELETE FROM \`leader_${tableName}\`;`);
    await this.runStatements(statements);
    // imported, query local and instance tables to do conflict resolution
    const instanceRows = await this.getAllRows(tableName);
    const instanceMap = new Map();
    const leaderRows = await this.getAllRows(`leader_${tableName}`);
    const leaderMap = new Map();
    leaderRows.forEach((row) => {
      leaderMap.set(row["id"], row);
    });
    instanceRows.forEach((row) => {
      instanceMap.set(row["id"], row);
    });
    const reconsileStatements = [];
    // compare & drop local table
    leaderRows.forEach((row) => {
      if (!instanceMap.has(row["id"])) {
        const headers = [];
        const values = [];
        for (const key in row) {
          headers.push(key);
          if (row[key] === null) {
            row[key] = "null";
          }
          values.push(String(row[key]));
        }
        reconsileStatements.push(
          generateInsertStatement(tableName, headers, values)
        );
      }
      // If instance has an entry with id X, don't change it even if leader changes
      // The idea is to let the user update this entity locally & set at instance level
    });
    instanceRows.forEach((row) => {
      if (!leaderMap.has(row["id"])) {
        if (this.mysqlConnection) {
          reconsileStatements.push(
            `SET SESSION FOREIGN_KEY_CHECKS = 0;`,
            `DELETE FROM \`${tableName}\` WHERE id=${row["id"]};`,
            `SET SESSION FOREIGN_KEY_CHECKS = 1;`
          );
        } else {
          reconsileStatements.push(
            `DELETE FROM \`${tableName}\` WHERE id=${row["id"]};`
          );
        }
      }
      // If the leader does not have an entry with id X, delete it
      // If the leader doesn't use a proxy/remote browser for a monitor, so wouldn't the follower
      // The monitor table specifies the proxy / remote browser ID to use,
      // it can't be unset on the leader and set on the follower as monitor is not treated as a local entity
    });
    // Drop the leader table we just created as we are done with it for now
    reconsileStatements.push(`DROP TABLE \`leader_${tableName}\`;`);
    await this.runStatements(reconsileStatements);
    console.log(
      `[replicator kuma] [importer] [local entity] Successfully reconsiled local entity table ${tableName}`
    );
  }

  async getAllRows(tableName) {
    let data;
    if (this.mysqlConnection) {
      try {
        const [rows] = await this.mysqlConnection.execute(
          `SELECT * FROM \`${tableName}\``
        );
        data = rows;
      } catch (queryError) {
        console.error(
          `[replicator kuma] [importer] [local entity] Query error for table ${tableName}:`,
          queryError.message
        );
        return;
      }
    } else {
      data = await new Promise((resolve, reject) => {
        this.sqliteConnection.all(
          `SELECT * FROM \`${tableName}\``,
          (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          }
        );
      });
    }
    return data;
  }

  async disableFKChecks() {
    if (this.mysqlConnection) {
      // The monitor table references itself and the specific statements are not ordered
      // So we Disable FK constraint checks while importing this table
      // Alternative implementations are possible but this is the easiest
      await this.mysqlConnection.execute("SET SESSION FOREIGN_KEY_CHECKS = 0;");
      console.log("[replicator kuma] [importer] Disabled foreign key checks");
    }
  }

  async enableFKChecks() {
    if (this.mysqlConnection) {
      // The monitor table references itself and the specific statements are not ordered
      // So we Disable FK constraint checks while importing this table
      // Alternative implementations are possible but this is the easiest
      await this.mysqlConnection.execute("SET SESSION FOREIGN_KEY_CHECKS = 1;");
      console.log("[replicator kuma] [importer] Enabled foreign key checks");
    }
  }

  async runSQLFile(filePath, tableName) {
    try {
      const sql = await fs.readFile(filePath, "utf-8");
      // Split the SQL file into individual statements.
      // This regex splits by semicolons at the end of a line, which handles multi-line statements and variations in whitespace.
      // Generated Status Page SQL if often multi-line
      const statements = sql.split(/;\s*$/m).filter((s) => s.trim().length > 0);
      if (tableName == "monitor") {
        // The monitor table references itself and the specific statements are not ordered
        // So we Disable FK constraint checks while importing this table
        // Alternative implementations are possible but this is the easiest
        await this.disableFKChecks();
      }
      await this.runStatements(statements);
      console.log(
        `[replicator kuma] [importer] Successfully executed ${filePath}`
      );
    } catch (error) {
      console.error(
        `[replicator kuma] [importer] Error executing SQL file ${filePath}:`,
        error.message
      );
      throw error;
    } finally {
      if (tableName == "monitor") {
        await this.enableFKChecks();
      }
    }
  }

  async importAllTables() {
    const sqlPathPrefix = exportPath.sqlStatements;

    // Run truncates first
    await this.disableFKChecks();
    const truncateSQLPath = join(sqlPathPrefix, `replicatorkuma_truncates.sql`);
    await this.runSQLFile(truncateSQLPath, "dummy");
    await this.enableFKChecks();

    // Run imports
    for (const tableName of config.tables) {
      const sqlPath = join(sqlPathPrefix, `${tableName}.sql`);
      const tableDataExists = existsSync(sqlPath);
      if (!tableDataExists) {
        console.log(
          `[replicator kuma] [importer] SQL file not found, skipping: ${sqlPath}`
        );
        continue;
      }

      if (config.localEntities.has(tableName) && tableDataExists) {
        // implement local entities import logic
        await this.importLocalEntityTable(sqlPath, tableName);
      } else {
        await this.runSQLFile(sqlPath, tableName);
      }
    }
  }

  async importMySQL() {
    try {
      await this.connectMySQL();
      await this.importAllTables();
    } finally {
      await this.disconnectMySQL();
    }
  }

  async importSQLite() {
    try {
      await this.connectSQLite();
      await this.importAllTables();
    } finally {
      await this.disconnectSQLite();
    }
  }
}

async function main() {
  const dbImporter = new DatabaseImporter();
  if (config.isMySQL) {
    await dbImporter.importMySQL();
  } else {
    await dbImporter.importSQLite();
  }
}

main();
