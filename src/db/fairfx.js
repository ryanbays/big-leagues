const db = require('../db');

const {
    insertFairFXLogin,
    getFairFXLogin,
    deleteFairFXLogin,
} = require('./statements');

const { createLogger } = require('../logger');

const logger = createLogger('db/fairfx');

function addLogin({ userId, email, password }) {
    if (!userId || !email) {
        throw new Error('addOrder: orderId required');
    }

    logger.trace('Saving login', {
        userId: String(userId),
        email: String(email),
        password: password !== undefined,
    });

    insertFairFXLogin.run({
        userId: String(userId),
        email: String(email),
        password: String(password),
    });

    logger.debug('Login saved', {
        orderId: String(userId)
    });
}

function removeLogin(userId) {
    if (!userId) {
        throw new Error('removeLogin: userId required');
    }
    logger.trace('Removing login', { userId: String(userId) });

    deleteFairFXLogin.run(String(userId))

    logger.trace('Login removed', { userId: String(userId) });
}

function getLogin(userId) {
    if (!userId) {
        throw new Error('getLogin: userId required');
    }
    logger.trace('Retrieving login', { userId: String(userId) });

    return getFairFXLogin.get(String(userId)) || null;
}


module.exports = {
    addLogin,
    removeLogin,
    getLogin,
};
