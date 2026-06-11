const { MessageFlags } = require('discord.js');

const UK_COUNTRY = 'UK';
const OTP_TIMEOUT_MS = 180000;
const OTP_POLL_INTERVAL_MS = 5000;

const SERVICES = {
    uberPostmates: { id: '951', label: 'Uber' },
    greggs: { id: '1083', label: 'Greggs' }
};

const SERVICE_OPTIONS = [
    {
        label: SERVICES.uberPostmates.label,
        value: SERVICES.uberPostmates.id,
        description: 'UK number for Uber'
    },
    {
        label: SERVICES.greggs.label,
        value: SERVICES.greggs.id,
        description: 'UK number for Greggs'
    }
];

const SELECT_PREFIX = 'svc_select';
const GENERATE_PREFIX = 'generate';
const PROMO_SELECT_PREFIX = 'promo_select';
const PROMO_FETCH_PREFIX = 'promo_fetch';
const REFRESH_PREFIX = 'refresh';
const REFUND_PREFIX = 'refund';
const EPHEMERAL_FLAGS = MessageFlags.Ephemeral;

module.exports = {
    UK_COUNTRY,
    OTP_TIMEOUT_MS,
    OTP_POLL_INTERVAL_MS,
    SERVICES,
    SERVICE_OPTIONS,
    SELECT_PREFIX,
    GENERATE_PREFIX,
    PROMO_SELECT_PREFIX,
    PROMO_FETCH_PREFIX,
    REFRESH_PREFIX,
    REFUND_PREFIX,
    EPHEMERAL_FLAGS
};
