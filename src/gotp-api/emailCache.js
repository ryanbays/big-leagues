'use strict';

const { get } = require('./client');

async function getEmailCache(inbox) {
    return get(`/email-cache/${encodeURIComponent(String(inbox || '').trim())}`);
}

module.exports = {
    getEmailCache
};
