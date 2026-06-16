const db = require('../db');

const {
    insertOrder,
    deleteOrder,
    listStmt
} = require('./statements');

const { createLogger } = require('../logger');
const logger = createLogger('db/orders');

function addOrder({
                      orderId,
                      userId,
                      userName,
                      serviceId,
                      price,
                      createdAt
                  }) {
    if (!orderId) {
        throw new Error('addOrder: orderId required');
    }

    logger.trace('Saving order.', {
        orderId: String(orderId),
        userId: String(userId),
        userName: String(userName),
        serviceId: String(serviceId)
    });

    insertOrder.run({
        orderId: String(orderId),
        userId: String(userId),
        userName: String(userName),
        serviceId: String(serviceId),
        price: price ?? null,
        createdAt: createdAt || Date.now()
    });

    logger.debug('Order saved.', {
        orderId: String(orderId)
    });
}

function removeOrder(orderId) {
    if (!orderId) {
        return;
    }

    logger.trace('Removing order.', {
        orderId: String(orderId)
    });

    deleteOrder.run(String(orderId));

    logger.debug('Order removed.', {
        orderId: String(orderId)
    });
}

function listOrders() {
    const orders = listStmt.all();

    logger.trace('Listing orders.', {
        count: orders.length
    });

    return orders;
}

module.exports = {
    addOrder,
    removeOrder,
    listOrders
};