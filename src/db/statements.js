const db = require('../db');

const insertOrder = db.prepare(`
    INSERT INTO orders (
        orderId,
        userId,
        userName,
        serviceId,
        price,
        createdAt
    )
    VALUES (
        @orderId,
        @userId,
        @userName,
        @serviceId,
        @price,
        @createdAt
    )
    ON CONFLICT(orderId) DO UPDATE SET
        userId = excluded.userId,
        userName = excluded.userName,
        serviceId = excluded.serviceId,
        price = excluded.price,
        createdAt = excluded.createdAt;
`);

const deleteOrder = db.prepare(`
    DELETE FROM orders
    WHERE orderId = ?;
`);

const listStmt = db.prepare(`
    SELECT
        orderId,
        userId,
        userName,
        serviceId,
        price,
        createdAt
    FROM orders
    ORDER BY createdAt;
`);

module.exports = {
    insertOrder,
    deleteOrder,
    listStmt
}