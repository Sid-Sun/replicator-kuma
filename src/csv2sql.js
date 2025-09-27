import { existsSync, mkdirSync, writeFileSync, createReadStream } from "fs";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import { join } from "path";
import { config, exportPath } from "./config.js";

const main = async () => {
  const csvPathPrefix = config.isMySQL ? exportPath.mysql : exportPath.sqlite;
  const sqlPathPrefix = exportPath.sqlStatements; // New directory for SQL files

  // Ensure the output directory exists
  if (!existsSync(sqlPathPrefix)) {
    mkdirSync(sqlPathPrefix);
  }

  const deleteStatements = [];

  for (const tableName of config.tables) {
    const csvPath = join(csvPathPrefix, `${tableName}.csv`);
    const sqlPath = join(sqlPathPrefix, `${tableName}.sql`);
    const tableDataExists = existsSync(csvPath);
    let deleteStatementCreated = false;

    // if the leader's local entity table has data, don't create a drop statement
    if (!config.localEntities.has(tableName) || !tableDataExists) {
      deleteStatements.unshift(`DELETE FROM \`${tableName}\`;`); // delete in reverse order of insert
      deleteStatementCreated = true;
    }

    if (tableDataExists) {
      try {
        const tableResults = await csv2sql(tableName, csvPath);
        writeFileSync(sqlPath, tableResults.join("\n"));
        console.log(
          `[replicator kuma] [csv2sql] Table ${tableName} had ${tableResults.length} entries. Wrote to ${sqlPath}`
        );
      } catch (err) {
        console.error(
          `[replicator kuma] [csv2sql] An error occurred processing table ${tableName}:`,
          err
        );
      }
    } else {
      console.log(
        `[replicator kuma] [csv2sql] Table ${tableName} was empty, delete statement will be generated anyway`
      );
    }
  }

  const truncateSQLPath = join(sqlPathPrefix, `replicatorkuma_truncates.sql`);
  writeFileSync(truncateSQLPath, deleteStatements.join("\n"));
  console.log(
    `[replicator kuma] [csv2sql] Delete statements written to ${truncateSQLPath}`
  );
};

const csv2sql = (tableName, csvFile) => {
  return new Promise((resolve, reject) => {
    const results = [];
    let headers;

    createReadStream(csvFile)
      .pipe(csv())
      .on("headers", (headerList) => {
        headers = headerList.map((header) => header.trim());
      })
      .on("data", (data) => {
        const records = headers.map((header) => data[header] || "");
        const insertTableName = config.localEntities.has(tableName)
          ? `leader_${tableName}`
          : tableName;
        const sqlStatement = generateInsertStatement(
          insertTableName,
          headers,
          records
        );
        results.push(sqlStatement);
      })
      .on("end", () => {
        resolve(results); // Resolve the promise with the count
      })
      .on("error", (err) => {
        console.error(
          "[replicator kuma] [csv2sql] Error reading CSV file:",
          err
        );
        reject(err); // Reject the promise on error
      });
  });
};

export const generateInsertStatement = (tableName, headers, values) => {
  const columns = [];
  const sqlValues = [];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    // Skip if value is empty or if we don't have a corresponding header
    // Value being empty here means the CSV value is "null" string - check exporter as to why
    if (i >= headers.length || isEmpty(value)) {
      continue;
    }

    columns.push(`\`${headers[i]}\``);
    sqlValues.push(formatSQLValue(value));
  }

  // If no non-empty values, return empty statement
  if (columns.length === 0) {
    return "-- No non-empty values found for this row";
  }

  const sql = `INSERT INTO \`${tableName}\` (${columns.join(
    ", "
  )}) VALUES (${sqlValues.join(", ")});`;

  return sql;
};

const isEmpty = (value) => {
  const trimmed = value.trim();
  return trimmed === "null" || trimmed === "NULL";
};

const formatSQLValue = (value) => {
  const trimmed = value.trim();

  if (trimmed === "") {
    return "''";
  }

  const intValue = parseInt(trimmed, 10);
  if (!isNaN(intValue) && intValue.toString() === trimmed) {
    return trimmed;
  }

  const floatValue = parseFloat(trimmed);
  if (!isNaN(floatValue) && floatValue.toString() === trimmed) {
    return trimmed;
  }

  // Default: treat as string and escape single quotes
  const escaped = trimmed.replace(/'/g, "''");
  return "'" + escaped + "'";
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
