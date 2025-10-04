import { existsSync, mkdirSync, writeFileSync, createReadStream } from "fs";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import { join } from "path";
import { config, exportPath } from "./config.js";

const main = async () => {
  const csvPathPrefix = config.isMySQL ? exportPath.mysql : exportPath.sqlite;
  const sqlPathPrefix = exportPath.sqlStatements; // New directory for SQL files
  const leSqlPathPrefix = exportPath.localEntitySqlStatements; // New directory for SQL files

  // Ensure the output directory exists
  if (!existsSync(sqlPathPrefix)) {
    mkdirSync(sqlPathPrefix);
  }
  if (!existsSync(leSqlPathPrefix)) {
    mkdirSync(leSqlPathPrefix);
  }

  const deleteStatements = [];
  const leDeleteStatements = [];

  for (const tableName of config.tables) {
    const csvPath = join(csvPathPrefix, `${tableName}.csv`);
    const sqlPath = join(sqlPathPrefix, `${tableName}.sql`);
    const leSqlPath = join(leSqlPathPrefix, `${tableName}.sql`);
    const tableDataExists = existsSync(csvPath);
    const tableIsLE = config.localEntities.has(tableName);

    // For LE tables, generate a seperate statement which imports to le_<table> as well
    // So follower can choose if LE should be treated like all other tables or reconciled
    // while preserving changes
    if (tableIsLE) {
      // special case for local entity table handling
      if (tableDataExists) {
        const leTableResults = await csv2sql(tableName, csvPath, true);
        writeFileSync(leSqlPath, leTableResults.join("\n"));
      } else {
        // if the leader's LE table is empty, there is nothing to reconcile, delete all data from follower
        leDeleteStatements.unshift(`DELETE FROM \`${tableName}\`;`);
      }
    }

    // delete in reverse order of insert
    deleteStatements.unshift(`DELETE FROM \`${tableName}\`;`);
    if (!tableIsLE) {
      // for delete statements of LE tables, don't generate delete as it is handled by the above logic
      // ex: if table is user, this will still add delete but for proxy, it will let the other logic decide
      leDeleteStatements.unshift(`DELETE FROM \`${tableName}\`;`);
    }

    if (tableDataExists) {
      try {
        const tableResults = await csv2sql(tableName, csvPath, false);
        writeFileSync(sqlPath, tableResults.join("\n"));
        if (!tableIsLE) {
          writeFileSync(leSqlPath, tableResults.join("\n"));
          console.log(
            `[replicator kuma] [csv2sql] Table ${tableName} had ${tableResults.length} entries. Wrote to ${sqlPath} & ${leSqlPath}`
          );
        } else {
          // if not a local entity table, output the same data to le sql folder
          console.log(
            `[replicator kuma] [csv2sql] Table ${tableName} had ${tableResults.length} entries. Wrote to ${sqlPath}`
          );
        }
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

  const leTruncateSQLPath = join(
    leSqlPathPrefix,
    `replicatorkuma_truncates.sql`
  );
  writeFileSync(leTruncateSQLPath, leDeleteStatements.join("\n"));
  console.log(
    `[replicator kuma] [csv2sql] LE Delete statements written to ${leTruncateSQLPath}`
  );
};

const csv2sql = (tableName, csvFile, treatAsLE) => {
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
        const insertTableName = treatAsLE ? `leader_${tableName}` : tableName;
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
