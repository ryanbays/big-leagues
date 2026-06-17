'use strict';

const axios = require('axios');

const { PROMO_API_KEY } = require('../env');

const GOTP_API_BASE_URL = process.env.GOTP_API_BASE_URL || 'https://api.rainserver.uk';

const apiClient = axios.create({
    baseURL: GOTP_API_BASE_URL,
    timeout: 20000,
    headers: PROMO_API_KEY ? { 'X-API-Key': PROMO_API_KEY } : {}
});

function assertApiKey() {
    if (!PROMO_API_KEY) {
        throw new Error('Missing PROMO_API_KEY in environment.');
    }
}

async function get(path, config) {
    assertApiKey();
    const response = await apiClient.get(path, config);
    return response.data;
}

async function post(path, body, config) {
    assertApiKey();
    const response = await apiClient.post(path, body, config);
    return response.data;
}

module.exports = {
    apiClient,
    get,
    post,
    assertApiKey,
    GOTP_API_BASE_URL
};
