'use strict';

const { getHealth } = require('./health');
const { submitInboundEmail } = require('./inbound');
const { getOtp, getOtpHistory } = require('./otp');
const { getEmailCache } = require('./emailCache');
const {
    listPromoServices,
    getPromoCode,
    postPromoCode,
    fetchPromoServices,
    fetchPromoCode
} = require('./promo');

module.exports = {
    getHealth,
    submitInboundEmail,
    getOtp,
    getOtpHistory,
    getEmailCache,
    listPromoServices,
    getPromoCode,
    postPromoCode,
    fetchPromoServices,
    fetchPromoCode
};
