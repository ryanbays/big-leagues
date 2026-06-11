'use strict';

const fs = require('fs/promises');
const path = require('path');

const { createLogger } = require('../logger');

const DB_PATH = process.env.ORDER_DB_PATH
    ? path.resolve(process.env.ORDER_DB_PATH)
    : path.resolve(process.cwd(), 'data', 'orders.json');

const logger = createLogger('discord/orderDb');

let writeQueue = Promise.resolve();

async function ensureDir() {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
}

async function readDb() {
    try {
        const raw = await fs.readFile(DB_PATH, 'utf8');

        // Treat empty/whitespace-only files as an uninitialized DB.
        if (!raw || !raw.trim()) return { orders: {} };

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { orders: {} };
        if (!parsed.orders || typeof parsed.orders !== 'object') parsed.orders = {};
        logger.trace('Order database loaded.', { dbPath: DB_PATH });
        return parsed;
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            logger.debug('Order database not found; starting empty.', { dbPath: DB_PATH });
            return { orders: {} };
        }
        logger.error('Failed to read order database.', { dbPath: DB_PATH, error: err && err.message ? err.message : String(err) });
        throw err;
    }
}

async function writeDb(db) {
    await ensureDir();
    const tmp = `${DB_PATH}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
    await fs.rename(tmp, DB_PATH);
    logger.debug('Order database written.', { dbPath: DB_PATH });
}

function enqueueWrite(mutator) {
    writeQueue = writeQueue.then(async () => {
        const db = await readDb();
        const updated = (await mutator(db)) || db;
        await writeDb(updated);
    });
    return writeQueue;
}

/**
 * Record/overwrite an order entry.
 * Stored by orderId, includes userId/serviceId/price and timestamps.
 */
function addOrder({ orderId, userId, userName, serviceId, price, createdAt }) {
    if (!orderId) throw new Error('addOrder: orderId required');
    logger.trace('Queueing order write.', { orderId: String(orderId), userId: String(userId), userName: String(userName), serviceId: String(serviceId) });
    return enqueueWrite((db) => {
        db.orders[String(orderId)] = {
            orderId: String(orderId),
            userId: String(userId),
            userName: String(userName),
            serviceId: String(serviceId),
            price: price ?? null,
            createdAt: createdAt || Date.now()
        };
        return db;
    });
}

/**
 * Remove an order entry (e.g. after refund/cancel).
 */
function removeOrder(orderId) {
    if (!orderId) return Promise.resolve();
    logger.trace('Queueing order removal.', { orderId: String(orderId) });
    return enqueueWrite((db) => {
        delete db.orders[String(orderId)];
        return db;
    });
}
/**
 * List all orders as an array.
 * Returns objects like: { orderId, userId, userName, serviceId, price, createdAt }
 */
async function listOrders() {
    const db = await readDb();
    const ordersObj = db && db.orders && typeof db.orders === 'object' ? db.orders : {};
    logger.trace('Listing orders.', { count: Object.keys(ordersObj).length });
    return Object.values(ordersObj);
}

module.exports = {
    addOrder,
    removeOrder,
    listOrders
};
