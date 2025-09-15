import { promises as fs } from "fs";
import { join } from "path";
import { config, exportPath } from "./config.js";
import { DatabaseCommon } from "./database-common.js";

class DatabaseImporter extends DatabaseCommon {
  async runSQLFile(filePath, tableName) {
    try {
      const sql = await fs.readFile(filePath, "utf-8");
      // Split the SQL file into individual statements.
      // This regex splits by semicolons at the end of a line, which handles multi-line statements and variations in whitespace.
      // Generated Status Page SQL if often multi-line
      const statements = sql.split(/;\s*$/m).filter((s) => s.trim().length > 0);
      if (this.mysqlConnection && tableName == "monitor") {
        // The monitor table references itself and the specific statements are not ordered
        // So we Disable FK constraint checks while importing this table
        // Alternative implementations are possible but this is the easiest
        await this.mysqlConnection.execute(
          "SET SESSION FOREIGN_KEY_CHECKS = 0;"
        );
        console.log("[replicator kuma] [importer] Disabled foreign key checks");
      }
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
      console.log(
        `[replicator kuma] [importer] Successfully executed ${filePath}`
      );
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log(
          `[replicator kuma] [importer] SQL file not found, skipping: ${filePath}`
        );
      } else {
        console.error(
          `[replicator kuma] [importer] Error executing SQL file ${filePath}:`,
          error.message
        );
        throw error;
      }
    } finally {
      if (this.mysqlConnection && tableName == "monitor") {
        await this.mysqlConnection.execute(
          "SET SESSION FOREIGN_KEY_CHECKS = 1;"
        );
        console.log(
          "[replicator kuma] [importer] Foreign key checks re-enabled"
        );
      }
    }
  }

  async importAllTables() {
    const sqlPathPrefix = exportPath.sqlStatements;

    // Run truncates first
    const truncateSQLPath = join(sqlPathPrefix, `replicatorkuma_truncates.sql`);
    await this.runSQLFile(truncateSQLPath, "dummy");

    // Run imports
    for (const tableName of config.tables) {
      const sqlPath = join(sqlPathPrefix, `${tableName}.sql`);
      await this.runSQLFile(sqlPath, tableName);
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
