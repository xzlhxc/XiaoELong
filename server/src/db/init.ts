import { readFile } from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";
import { dbEnv } from "../config/db-env.js";

function assertSafeIdentifier(identifier: string): void {
  if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
    throw new Error("DB_NAME must only contain letters, numbers, and underscore.");
  }
}

async function run(): Promise<void> {
  assertSafeIdentifier(dbEnv.DB_NAME);

  const sqlFilePath = path.resolve(process.cwd(), "src", "db", "init.sql");
  const sql = await readFile(sqlFilePath, "utf8");

  const connection = await createConnection({
    host: dbEnv.DB_HOST,
    port: dbEnv.DB_PORT,
    user: dbEnv.DB_USER,
    password: dbEnv.DB_PASSWORD,
    multipleStatements: true
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbEnv.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await connection.query(`USE \`${dbEnv.DB_NAME}\`;`);
    await connection.query(sql);
    console.log("Database initialized successfully.");
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error("Database initialization failed:", error);
  process.exitCode = 1;
});
