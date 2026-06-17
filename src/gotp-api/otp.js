'use strict';

const { get } = require('./client');

async function getOtp(inbox) {
    return get(`/otp/${encodeURIComponent(String(inbox || '').trim())}`);
}

async function getOtpHistory(inbox) {
    return get(`/otp/${encodeURIComponent(String(inbox || '').trim())}/history`);
}

module.exports = {
    getOtp,
    getOtpHistory
};
