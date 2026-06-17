'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { createLogger } = require('../logger');
const logger = createLogger('db/index');

const DEFAULT_DB_FLUSH_INTERVAL_MS = 30000;

const DB_PATH = process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.resolve(process.cwd(), 'data', 'sqlite.index');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

const FLUSH_INTERVAL_MS = resolveFlushIntervalMs(process.env.DB_FLUSH_INTERVAL_MS);
const checkpointStmt = db.prepare('PRAGMA wal_checkpoint(FULL);');

function flushToDisk(reason) {
    try {
        // In WAL mode this forces a checkpoint so recent writes are persisted to the DB file.
        const result = checkpointStmt.get();
        logger.trace('Database checkpoint completed.', {
            reason,
            busy: result && result.busy,
            log: result && result.log,
            checkpointed: result && result.checkpointed
        });
    } catch (error) {
        logger.error('Database checkpoint failed.', {
            reason,
            error: error && error.message ? error.message : String(error)
        });
    }
}

if (FLUSH_INTERVAL_MS > 0) {
    const flushTimer = setInterval(() => {
        flushToDisk('interval');
    }, FLUSH_INTERVAL_MS);

    if (typeof flushTimer.unref === 'function') {
        flushTimer.unref();
    }

    logger.info('Configured periodic database flush.', {
        intervalMs: FLUSH_INTERVAL_MS,
        dbPath: DB_PATH
    });
}

process.once('beforeExit', () => flushToDisk('beforeExit'));
process.once('SIGINT', () => flushToDisk('sigint'));
process.once('SIGTERM', () => flushToDisk('sigterm'));

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

db.exec(`
    CREATE TABLE IF NOT EXISTS user_inboxes (
        inboxId TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        userName TEXT,
        email TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL
    );
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS fairfx_logins (
        userId TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        password TEXT
    );
`);

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_inboxes_user_created
    ON user_inboxes (userId, createdAt DESC);
`);

module.exports = db;

function resolveFlushIntervalMs(rawValue) {
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
        return DEFAULT_DB_FLUSH_INTERVAL_MS;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
        logger.warn('Invalid DB_FLUSH_INTERVAL_MS. Falling back to default.', {
            rawValue,
            fallbackMs: DEFAULT_DB_FLUSH_INTERVAL_MS
        });
        return DEFAULT_DB_FLUSH_INTERVAL_MS;
    }

    return Math.floor(parsed);
}