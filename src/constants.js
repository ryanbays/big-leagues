const { MessageFlags } = require('discord.js');

const UK_COUNTRY = 'UK';
const OTP_TIMEOUT_MS = 180000;
const OTP_POLL_INTERVAL_MS = 5000;

const SERVICES = {
    uberPostmates: { id: '951', label: 'Uber' },
    deliveroo: {id: '258', label: 'Deliveroo' },
    greggs: { id: '1083', label: 'Greggs' },
    others: {id: '817', label: 'Other'}
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
    },
    {
        label: SERVICES.deliveroo.label,
        value: SERVICES.deliveroo.id,
        description: 'UK number for Deliveroo'
    },
    {
        label: SERVICES.others.label,
        value: SERVICES.others.id,
        description: 'UK number for any other service'
    }
];

const OPEN_SMS_PANEL_PREFIX = 'open_sms_panel';
const SMS_SELECT_PREFIX = 'svc_select';
const SMS_GENERATE_PREFIX = 'generate';
const OPEN_PROMO_PANEL_PREFIX = 'open_promo_panel';
const PROMO_SELECT_PREFIX = 'promo_select';
const PROMO_FETCH_PREFIX = 'promo_fetch';
const EMAIL_SELECT_PREFIX = 'email_select';
const EMAIL_CREATE_PREFIX = 'email_create';
const EMAIL_REFRESH_PREFIX = 'email_refresh';
const EMAIL_OTP_PREFIX = 'email_otp';
const EMAIL_DELETE_PREFIX = 'email_delete';
const REFRESH_PREFIX = 'refresh';
const REFUND_PREFIX = 'refund';
const EPHEMERAL_FLAGS = MessageFlags.Ephemeral;

module.exports = {
    UK_COUNTRY,
    OTP_TIMEOUT_MS,
    OTP_POLL_INTERVAL_MS,
    SERVICES,
    SERVICE_OPTIONS,
    OPEN_SMS_PANEL_PREFIX,
    SMS_SELECT_PREFIX,
    SMS_GENERATE_PREFIX,
    OPEN_PROMO_PANEL_PREFIX,
    PROMO_SELECT_PREFIX,
    PROMO_FETCH_PREFIX,
    EMAIL_SELECT_PREFIX,
    EMAIL_CREATE_PREFIX,
    EMAIL_REFRESH_PREFIX,
    EMAIL_OTP_PREFIX,
    EMAIL_DELETE_PREFIX,
    REFRESH_PREFIX,
    REFUND_PREFIX,
    EPHEMERAL_FLAGS
};
