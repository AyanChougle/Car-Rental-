// server/config/database.js
"use strict";

const mysql = require("mysql2/promise");
require("dotenv").config();

const poolConfig = {
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE || "kruizly_db",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 15),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  charset: "utf8mb4",
  timezone: "+00:00",
  dateStrings: true
};

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool(poolConfig);
  }
  return pool;
}

/**
 * Execute parameterized query
 * @param {string} sql - SQL statement with ? placeholders
 * @param {Array} [params] - parameters
 * @returns {Promise<Array>} rows or result object
 */
async function query(sql, params = []) {
  const p = getPool();
  try {
    const [results] = await p.query(sql, params);
    return results;
  } catch (error) {
    console.error("[MySQL Query Error]", {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sql: sql.slice(0, 200)
    });
    throw error;
  }
}

/**
 * Execute parameterized prepared statement (optimized for inserts/updates)
 * @param {string} sql 
 * @param {Array} [params] 
 * @returns {Promise<Array>}
 */
async function execute(sql, params = []) {
  const p = getPool();
  try {
    const [results] = await p.execute(sql, params);
    return results;
  } catch (error) {
    console.error("[MySQL Execute Error]", {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      sql: sql.slice(0, 200)
    });
    throw error;
  }
}

/**
 * Execute work inside a managed transaction
 * @param {function(connection): Promise<any>} callback
 * @returns {Promise<any>}
 */
async function transaction(callback) {
  const p = getPool();
  const connection = await p.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackErr) {
      console.error("[MySQL Rollback Error]", rollbackErr.message);
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Test database connection for health check and startup validation
 * @returns {Promise<{connected: boolean, message: string}>}
 */
async function testConnection() {
  try {
    const p = getPool();
    const [rows] = await p.query("SELECT 1 AS alive, NOW() AS serverTime");
    return {
      connected: true,
      serverTime: rows[0]?.serverTime || new Date().toISOString()
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      code: error.code
    };
  }
}

/**
 * Gracefully close database pool
 */
async function closePool() {
  if (pool) {
    try {
      await pool.end();
      pool = null;
      console.log("[MySQL] Connection pool closed.");
    } catch (err) {
      console.error("[MySQL] Error closing pool:", err.message);
    }
  }
}

module.exports = {
  getPool,
  query,
  execute,
  transaction,
  testConnection,
  closePool
};
