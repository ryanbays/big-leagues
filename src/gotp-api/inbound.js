'use strict';

const { post } = require('./client');

async function submitInboundEmail({ from, to, raw }) {
    return post('/inbound-email', {
        from,
        to,
        raw
    });
}

module.exports = {
    submitInboundEmail
};
