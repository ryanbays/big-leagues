const db = require('../db');

// Order tracking
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

// OTP Emails
const insertUserInbox = db.prepare(`
    INSERT INTO user_inboxes (
        inboxId,
        userId,
        userName,
        email,
        createdAt
    )
    VALUES (
        @inboxId,
        @userId,
        @userName,
        @email,
        @createdAt
    )
    ON CONFLICT(inboxId) DO UPDATE SET
        userId = excluded.userId,
        userName = excluded.userName,
        email = excluded.email,
        createdAt = excluded.createdAt;
`);

const listUserInboxesByUserStmt = db.prepare(`
    SELECT
        inboxId,
        userId,
        userName,
        email,
        createdAt
    FROM user_inboxes
    WHERE userId = ?
    ORDER BY createdAt DESC;
`);

const getUserInboxByIdStmt = db.prepare(`
    SELECT
        inboxId,
        userId,
        userName,
        email,
        createdAt
    FROM user_inboxes
    WHERE inboxId = ?
    LIMIT 1;
`);

const deleteUserInboxByUserStmt = db.prepare(`
    DELETE FROM user_inboxes
    WHERE inboxId = ?
      AND userId = ?;
`);

// FairFX logins
const insertFairFXLogin = db.prepare(`
    INSERT INTO fairfx_logins (
        userId, 
        email, 
        password
    ) 
    VALUES (
        @userId, 
        @email, 
        @password)
    ON CONFLICT(userId) DO UPDATE SET
        email = excluded.email,
        password = excluded.password;
`);

const getFairFXLogin = db.prepare(`
    SELECT email, password
    FROM fairfx_logins
    WHERE userId = ?
    LIMIT 1;
`)

const deleteFairFXLogin = db.prepare(`
    DELETE FROM fairfx_logins
    WHERE userId = ?;
`)

module.exports = {
    insertOrder,
    deleteOrder,
    listStmt,
    insertUserInbox,
    listUserInboxesByUserStmt,
    getUserInboxByIdStmt,
    deleteUserInboxByUserStmt,
    insertFairFXLogin,
    getFairFXLogin,
    deleteFairFXLogin,
}