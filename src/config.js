import { readFileSync } from "fs";
import { userInfo } from "os";

// ordered_replication_tables defines all the tables to backup and restore
// It is necessary to restore in this order due to foreign key constrains in mariadb
const ordered_replication_tables = [
  "group",
  "user",
  "tag",
  "notification",
  "status_page",
  "monitor",
  "monitor_notification",
  "monitor_group",
  "monitor_tag",
  "maintenance",
  "monitor_maintenance",
  "maintenance_status_page",
  "incident",
];

export const exportPath = {
  sqlite: "/replicator_kuma/current/sqlite_exports",
  mysql: "/replicator_kuma/current/mysql_exports",
  sqlStatements: "/replicator_kuma/current/sql_statements",
};

const getDbConfig = () => {
  let dbConfigString = readFileSync("/app/data/db-config.json").toString(
    "utf-8"
  );
  let dbConfig = JSON.parse(dbConfigString);

  if (typeof dbConfig !== "object") {
    throw new Error(
      "[replicator kuma] [config] Invalid db-config.json, it must be an object"
    );
  }

  if (typeof dbConfig.type !== "string") {
    throw new Error(
      "[replicator kuma] [config] Invalid db-config.json, type must be a string"
    );
  }
  return dbConfig;
};

const getConfig = () => {
  const baseConfig = {
    isMySQL: true,
    tables: ordered_replication_tables,
    sqlite: {
      database: process.env.SQLITE_DATABASE || "./data/kuma.db",
      csv_export_directory: exportPath.sqlite,
    },
  };

  let config = baseConfig;
  // load uptime kuma db config to figure out the db used
  const dbConfig = getDbConfig();
  switch (dbConfig.type) {
    case "sqlite":
      config.dbType = dbConfig.type;
      config.isMySQL = false;
      break;
    case "mariadb":
      config.dbType = dbConfig.type;
      config.mysql = {
        host: dbConfig.hostname,
        port: dbConfig.port,
        user: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.dbName || "kuma",
        timezone: "Z",
      };
      break;
    case "embedded-mariadb":
      config.dbType = dbConfig.type;
      config.mysql = {
        socketPath: "/app/data/run/mariadb.sock",
        username: userInfo().username,
        database: "kuma",
        timezone: "Z",
      };
      break;
    default:
      console.log(
        `[replicator kuma] [config] Unsupported database configuration: ${dbConfig.type}`
      );
  }

  return config;
};

export const config = getConfig();
