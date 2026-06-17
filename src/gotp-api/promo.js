'use strict';

const { get, post } = require('./client');
const { createLogger } = require('../logger');

const logger = createLogger('gotp-api/promo');

async function listPromoServices() {
    try {
        return await get('/promo/services');
    } catch (err) {
        return get('/promo/sevices');
    }
}

async function getPromoCode(serviceId) {
    const normalizedServiceId = String(serviceId || '').trim();
    if (!normalizedServiceId) {
        throw new Error('Missing promo service id.');
    }

    try {
        return await get(`/promo/${encodeURIComponent(normalizedServiceId)}`);
    } catch (err) {
        if (isNoPromoCodeError(err)) {
            return null;
        }
        throw err;
    }
}

async function fetchPromoServices({ userId, interaction }) {
    void userId;
    void interaction;

    logger.debug('Fetching promo services list.');

    const payload = await listPromoServices();
    const services = Array.isArray(payload?.services) ? payload.services : Array.isArray(payload) ? payload : [];

    logger.info('Promo services loaded.', { count: services.length });

    return services
        .map((service, index) => normalizePromoService(service, index))
        .filter(Boolean);
}

async function fetchPromoCode({ userId, serviceId, interaction }) {
    void userId;
    void interaction;

    const normalizedServiceId = String(serviceId || '').trim();
    if (!normalizedServiceId) {
        throw new Error('Missing promo service id.');
    }

    logger.debug('Fetching promo code.', { serviceId: normalizedServiceId });

    try {
        logger.trace('Attempting promo code lookup with API client endpoint.');
        const data = await getPromoCode(normalizedServiceId);
        logger.trace('Primary endpoint response received.', { serviceId: normalizedServiceId, data });
        const promoCode = normalizePromoCode(data);
        logger.trace('Promo code normalized.', { serviceId: normalizedServiceId, promoCode });

        logger.info('Promo code lookup completed.', {
            serviceId: normalizedServiceId,
            hasCode: Boolean(promoCode),
            data: data && typeof data === 'object' ? Object.keys(data) : null
        });

        return promoCode;
    } catch (err) {
        logger.error('Promo code lookup failed.', {
            serviceId: normalizedServiceId,
            error: err && err.message ? err.message : String(err)
        });
        throw err;
    }
}

async function postPromoCode(serviceId, code) {
    const normalizedServiceId = String(serviceId || '').trim();
    const normalizedCode = String(code || '').trim();

    if (!normalizedServiceId) {
        throw new Error('Missing promo service id.');
    }

    if (!normalizedCode) {
        throw new Error('Missing promo code.');
    }

    return post(`/promo/${encodeURIComponent(normalizedServiceId)}`, {
        code: normalizedCode
    });
}

function isNoPromoCodeError(err) {
    const status = err && err.response && err.response.status;
    const data = err && err.response && err.response.data ? err.response.data : null;
    const message = data && typeof data === 'object'
        ? String(data.error ?? data.message ?? data.msg ?? '').trim()
        : String(data ?? err?.message ?? '').trim();

    return status === 500 && (/no promo code/i.test(message) || /ERROR/i.test(message));
}

function normalizePromoService(service, fallbackIndex) {
    if (service === null || service === undefined) {
        return null;
    }

    if (typeof service === 'string' || typeof service === 'number') {
        const value = String(service).trim();
        if (!value) return null;
        return {
            label: value,
            value,
            description: `Promo service ${fallbackIndex + 1}`
        };
    }

    const value = String(
        service.value ??
        service.id ??
        service.service ??
        service.serviceId ??
        service.service_id ??
        service.code ??
        service.key ??
        ''
    ).trim();

    if (!value) {
        return null;
    }

    const label = String(
        service.label ??
        service.name ??
        service.title ??
        value
    ).trim() || value;

    const description = String(service.description ?? service.desc ?? service.details ?? '').trim() || `Promo service ${fallbackIndex + 1}`;

    return {
        label,
        value,
        description
    };
}

function normalizePromoCode(payload) {
    if (payload === null || payload === undefined) {
        return null;
    }

    if (typeof payload === 'string') {
        const text = payload.trim();
        if (!text || text === 'null' || text === 'undefined') return null;
        return text;
    }

    if (typeof payload === 'object') {
        const promoCode = payload.promo_code ?? payload.promoCode ?? payload.code ?? payload.value ?? payload.promo ?? null;
        if (promoCode === null || promoCode === undefined) return null;
        const text = String(promoCode).trim();
        return text ? text : null;
    }

    return String(payload).trim() || null;
}

module.exports = {
    listPromoServices,
    getPromoCode,
    postPromoCode,
    fetchPromoServices,
    fetchPromoCode,
    isNoPromoCodeError
};
