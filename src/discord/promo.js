const axios = require('axios');

const { PROMO_API_KEY } = require('../env');
const { createLogger } = require('../logger');

const logger = createLogger('discord/promo');

const promoApi = axios.create({
    baseURL: 'https://api.rainserver.uk',
    timeout: 20000,
    headers: PROMO_API_KEY ? { 'X-API-Key': PROMO_API_KEY } : {}
});

async function fetchPromoServices({ userId, interaction }) {
    void userId;
    void interaction;

    logger.debug('Fetching promo services list.');

    const payload = await requestPromoApi(['/promo/sevices', '/promo/services']);
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
        logger.trace('Attempting promo code lookup with primary endpoint.');
        const data = await requestPromoApi(`/promo/${encodeURIComponent(normalizedServiceId)}`);
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
        if (isNoPromoCodeError(err)) {
            logger.debug('Promo code endpoint returned no active code.', { serviceId: normalizedServiceId });
            return null;
        }

        logger.error('Promo code lookup failed.', {
            serviceId: normalizedServiceId,
            error: err && err.message ? err.message : String(err)
        });
        throw err;
    }
}

async function requestPromoApi(paths) {
    const candidates = Array.isArray(paths) ? paths : [paths];
    let lastError = null;

    if (!PROMO_API_KEY) {
        throw new Error('Missing PROMO_API_KEY in environment.');
    }

    for (const path of candidates) {
        try {
            logger.trace('Promo API request.', { path });
            const response = await promoApi.get(path);
            logger.trace('Promo API response received.', {
                path,
                status: response.status
            });
            return response.data;
        } catch (err) {
            lastError = err;

            if (isNoPromoCodeError(err) && typeof path === 'string' && path.startsWith('/promo/')) {
                return null;
            }
        }
    }

    if (lastError) {
        throw lastError;
    }

    return null;
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

function isNoPromoCodeError(err) {
    const status = err && err.response && err.response.status;
    const data = err && err.response && err.response.data ? err.response.data : null;
    const message = data && typeof data === 'object'
        ? String(data.error ?? data.message ?? data.msg ?? '').trim()
        : String(data ?? err?.message ?? '').trim();

    return status === 500 && (/no promo code/i.test(message) || /ERROR/i.test(message));
}

module.exports = {
    fetchPromoServices,
    fetchPromoCode
};