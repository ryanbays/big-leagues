const {
    insertUserInbox,
    listUserInboxesByUserStmt,
    getUserInboxByIdStmt,
    deleteUserInboxByUserStmt
} = require('./statements');

const { createLogger } = require('../logger');
const logger = createLogger('db/inboxes');

function addUserInbox({ inboxId, userId, userName, email, createdAt }) {
    if (!inboxId) {
        throw new Error('addUserInbox: inboxId required');
    }

    if (!userId) {
        throw new Error('addUserInbox: userId required');
    }

    if (!email) {
        throw new Error('addUserInbox: email required');
    }

    insertUserInbox.run({
        inboxId: String(inboxId),
        userId: String(userId),
        userName: userName ? String(userName) : null,
        email: String(email),
        createdAt: createdAt || Date.now()
    });

    logger.debug('Inbox saved.', {
        inboxId: String(inboxId),
        userId: String(userId)
    });
}

function listUserInboxes(userId) {
    if (!userId) {
        return [];
    }

    const inboxes = listUserInboxesByUserStmt.all(String(userId));

    logger.trace('Listing user inboxes.', {
        userId: String(userId),
        count: inboxes.length
    });

    return inboxes;
}

function getUserInboxById(inboxId) {
    if (!inboxId) {
        return null;
    }

    return getUserInboxByIdStmt.get(String(inboxId)) || null;
}

function removeUserInbox({ userId, inboxId }) {
    if (!userId || !inboxId) {
        return false;
    }

    const result = deleteUserInboxByUserStmt.run(String(inboxId), String(userId));
    const removed = Boolean(result && result.changes > 0);

    logger.debug('Inbox delete attempted.', {
        userId: String(userId),
        inboxId: String(inboxId),
        removed
    });

    return removed;
}

module.exports = {
    addUserInbox,
    listUserInboxes,
    getUserInboxById,
    removeUserInbox
};
