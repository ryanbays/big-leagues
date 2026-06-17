'use strict';

const { get } = require('./client');

async function getHealth() {
    return get('/health');
}

module.exports = {
    getHealth
};
