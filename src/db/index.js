'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { createLogger } = require('../logger');
const logger = createLogger('db/index');

const DB_PATH = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(process.cwd(), 'data', 'sqlite.index');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        orderId TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        userName TEXT,
        serviceId TEXT,
        price REAL,
        createdAt INTEGER NOT NULL
    );
`);

module.exports = db;