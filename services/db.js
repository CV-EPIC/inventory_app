import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL belum di-set. API database akan gagal sampai env tersedia.");
}

const globalPool = globalThis.__epicWarehousePool;

const pool = globalPool || new Pool({
  connectionString,
  ssl: connectionString
    ? { rejectUnauthorized: false }
    : false,
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

if (!globalPool) {
  globalThis.__epicWarehousePool = pool;
}

export default pool;
