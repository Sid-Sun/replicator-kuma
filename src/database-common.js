import { createConnection } from "mysql2/promise";
import sqlite3 from "sqlite3";
import { config } from "./config.js";

// Importer and Exporter both need to connect to the DB, this class dedupes this functionality
export class DatabaseCommon {
  constructor() {
    this.mysqlConnection = null;
    this.sqliteConnection = null;
  }

  async connectMySQL() {
    try {
      const mysqlConfig = { ...config.mysql };
      this.mysqlConnection = await createConnection({
        ...mysqlConfig,
        // Force dates to be returned as strings - we don't wait JS parsing date into local format
        // Or doing something weird messing up date
        dateStrings: true,
      });
      console.log(
        "[replicator kuma] [database utils] Connected to MySQL database"
      );
    } catch (error) {
      console.error(
        "[replicator kuma] [database utils] Failed to connect to MySQL:",
        error.message
      );
      throw error;
    }
  }

  async connectSQLite() {
    return new Promise((resolve, reject) => {
      this.sqliteConnection = new sqlite3.Database(
        config.sqlite.database,
        (err) => {
          if (err) {
            console.error(
              "[replicator kuma] [database utils] Failed to connect to SQLite:",
              err.message
            );
            reject(err);
          } else {
            console.log(
              "[replicator kuma] [database utils] Connected to SQLite database"
            );
            resolve();
          }
        }
      );
    });
  }

  async disconnectMySQL() {
    if (this.mysqlConnection) {
      await this.mysqlConnection.end();
    }
  }

  async disconnectSQLite() {
    return new Promise((resolve) => {
      if (this.sqliteConnection) {
        this.sqliteConnection.close((err) => {
          if (err) {
            console.error(
              "[replicator kuma] [database utils] Error closing SQLite connection:",
              err.message
            );
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
