import { createObjectCsvWriter as createCsvWriter } from "csv-writer";
import { promises as fs } from "fs";
import { join } from "path";
import { config, exportPath } from "./config.js";
import { DatabaseCommon } from "./database-common.js";

class DatabaseExporter extends DatabaseCommon {
  async ensureOutputDirectory() {
    const outputDirectory = config.isMySQL
      ? exportPath.mysql
      : exportPath.sqlite;
    try {
      await fs.access(outputDirectory);
    } catch (error) {
      await fs.mkdir(outputDirectory, {
        recursive: true,
      });
      console.log(
        `[replicator kuma] [exporter] Created output directory: ${outputDirectory}`
      );
    }
  }

  async getTableColumns(tableName) {
    try {
      if (config.isMySQL) {
        const [rows] = await this.mysqlConnection.execute(
          `DESCRIBE \`${tableName}\``
        );
        return rows.map((row) => row.Field);
      } else {
        return new Promise((resolve, reject) => {
          this.sqliteConnection.all(
            `PRAGMA table_info('${tableName}')`,
            (err, rows) => {
              if (err) {
                reject(err);
              } else {
                resolve(rows.map((row) => row.name));
              }
            }
          );
        });
      }
    } catch (error) {
      console.error(
        `[replicator kuma] [exporter] Error getting columns for table ${tableName}:`,
        error.message
      );
      return [];
    }
  }

  async exportTableToCSV(tableName) {
    try {
      console.log(
        `[replicator kuma] [exporter] Exporting table \`${tableName}\``
      );

      // Get table columns
      const columns = await this.getTableColumns(tableName, config.isMySQL);
      if (columns.length === 0) {
        console.error(
          `[replicator kuma] [exporter] Skipping table ${tableName} - no columns found or table doesn't exist`
        );
        return;
      }

      // Fetch data
      let data;
      if (config.isMySQL) {
        try {
          const [rows] = await this.mysqlConnection.execute(
            `SELECT * FROM \`${tableName}\``
          );
          data = rows;
        } catch (queryError) {
          console.error(
            `❌ Query error for table ${tableName}:`,
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

      // Empty tables will not be exported as CSV but the retore will still truncate the tables -
      // Which will make sure if for ex all incidents have been ended / deleted, they are purged from the followers
      if (data.length === 0) {
        console.log(
          `[replicator kuma] [exporter] Table \`${tableName}\` is empty`
        );
        return;
      }

      const outputDirectory = config.isMySQL
        ? exportPath.mysql
        : exportPath.sqlite;
      const csvWriter = createCsvWriter({
        path: join(outputDirectory, `${tableName}.csv`),
        header: columns.map((column) => ({
          id: column,
          title: column,
        })),
      });

      // CSV does not distinguish between null values and empty strings. We replace null values with "null" so they may be distinguished
      // This makes the CSV to SQL conversion far easier as nullable values can be identified and omitted from the insert stamenets
      // Without it, the conversion layer would need to be schema aware, making it far more complicated
      for (const obj of data) {
        for (const key in obj) {
          if (obj[key] === null) {
            obj[key] = "null";
          }
        }
      }

      await csvWriter.writeRecords(data);
      console.log(
        `[replicator kuma] [exporter] Exported ${data.length} rows from \`${tableName}\` to CSV`
      );
    } catch (error) {
      console.error(
        `[replicator kuma] [exporter] Error exporting table \`${tableName}\`:`,
        error.message
      );
    }
  }

  async exportAllTables() {
    try {
      for (const tableName of config.tables) {
        await this.exportTableToCSV(tableName);
      }
    } catch (error) {
      console.error(
        `[replicator kuma] [exporter] Error during export:`,
        error.message
      );
    }
  }

  async exportMySQL() {
    try {
      await this.connectMySQL();
      await this.ensureOutputDirectory();
      await this.exportAllTables();
    } finally {
      await this.disconnectMySQL();
    }
  }

  async exportSQLite() {
    try {
      await this.connectSQLite();
      await this.ensureOutputDirectory();
      await this.exportAllTables();
    } finally {
      await this.disconnectSQLite();
    }
  }
}

async function main() {
  const dbExporter = new DatabaseExporter();
  if (config.isMySQL) {
    dbExporter.exportMySQL();
  } else {
    dbExporter.exportSQLite();
  }
}

main();
