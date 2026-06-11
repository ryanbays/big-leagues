const axios = require('axios');

const { SMSPOOL_API_KEY } = require('../env');
const { createLogger } = require('../logger');
const {
    UK_COUNTRY
} = require('../constants');

const logger = createLogger('smspool/client');

const axiosInstance = axios.create({
    baseURL: 'https://api.smspool.net',
    timeout: 20000
});

async function buySmsNumber({ serviceId, maxPrice }) {
    logger.debug('Submitting SMS purchase request.', {
        serviceId,
        maxPrice: maxPrice ?? null,
        country: UK_COUNTRY
    });

    const form = new URLSearchParams();
    form.append('key', SMSPOOL_API_KEY);
    form.append('country', UK_COUNTRY);
    form.append('service', String(serviceId));

    if (maxPrice !== null && maxPrice !== undefined) {
        form.append('max_price', String(maxPrice));
    }

    const res = await axiosInstance.post('/purchase/sms', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const normalized = normalizeOrderResponse(res.data);
    if (!normalized.id) {
        logger.error('Unexpected SMS purchase response shape.', {
            serviceId,
            response: res.data
        });
        throw new Error(`Unexpected response format from /purchase/sms: ${JSON.stringify(res.data)}`);
    }

    logger.info('SMS purchase request accepted.', {
        serviceId,
        orderId: normalized.id,
        price: normalized.price ?? null
    });

    return normalized;
}

async function checkSms(orderId) {
    logger.trace('Checking SMS order.', { orderId: String(orderId) });

    const activeData = await checkSmsFromActive(orderId);
    if (activeData) {
        return activeData;
    }

    return checkSmsDirect(orderId);
}

async function checkSmsFromActive(orderId) {
    const form = new URLSearchParams();
    form.append('key', SMSPOOL_API_KEY);

    try {
        const res = await axiosInstance.post('/request/active', form, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        logger.trace('Received active order payload.', {
            orderId: String(orderId),
            payloadPreview: safePreview(res.data)
        });

        const match = findOrderInActivePayload(res.data, String(orderId));
        logger.debug('Active order lookup completed.', {
            orderId: String(orderId),
            matched: Boolean(match)
        });
        return match || null;
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        logger.warn('Active order check failed.', {
            orderId: String(orderId),
            error: message
        });
        return null;
    }
}

async function checkSmsDirect(orderId) {
    const form = new URLSearchParams();
    form.append('orderid', String(orderId));
    form.append('key', SMSPOOL_API_KEY);

    const res = await axiosInstance.post('/sms/check', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    logger.trace('Received direct SMS payload.', {
        orderId: String(orderId),
        payloadPreview: safePreview(res.data)
    });

    return res.data;
}

function findOrderInActivePayload(payload, orderId) {
    if (!payload) return null;

    const stack = [payload];
    while (stack.length) {
        const node = stack.pop();
        if (!node) continue;

        if (Array.isArray(node)) {
            for (const item of node) {
                if (sameOrder(item, orderId)) return item;
                if (item && typeof item === 'object') stack.push(item);
            }
            continue;
        }

        if (typeof node === 'object') {
            if (sameOrder(node, orderId)) return node;
            for (const v of Object.values(node)) {
                if (v && (typeof v === 'object' || Array.isArray(v))) stack.push(v);
            }
        }
    }

    return null;
}

async function cancelSms(orderId) {
    const form = new URLSearchParams();
    form.append('orderid', String(orderId));
    form.append('key', SMSPOOL_API_KEY);

    try {
        const res = await axiosInstance.post('/sms/cancel', form, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return normalizeApiResponse(res.data);
    } catch (err) {
        logger.warn('SMS cancel request failed, falling back to error object.', {
            orderId: String(orderId),
            error: err && err.message ? err.message : String(err)
        });
        const resp = err && err.response && err.response.data ? err.response.data : null;
        if (resp) return normalizeApiResponse(resp);
        const message = err && err.message ? err.message : String(err);
        return { success: 0, message };
    }
}

function normalizeApiResponse(payload) {
    if (payload === undefined || payload === null) return { success: 0, message: 'No response from API' };

    try {
        let p = payload;

        while (typeof p === 'string') {
            const t = p.trim();
            if (t.startsWith('{') || t.startsWith('[')) {
                try {
                    p = JSON.parse(t);
                    continue;
                } catch (e) {
                    return { success: 0, message: t };
                }
            }
            return { success: 0, message: t };
        }

        if (typeof p === 'object') {
            const msgField = p.message ?? p.msg ?? p.error ?? p.data ?? null;

            if (typeof msgField === 'string') {
                const t = msgField.trim();
                if (t.startsWith('{') || t.startsWith('[')) {
                    try {
                        return normalizeApiResponse(JSON.parse(t));
                    } catch (e) {
                        return { success: 0, message: t };
                    }
                }
                const success = p.success === 1 || p.success === true || String(p.status).toLowerCase().includes('succ');
                return { success: success ? 1 : 0, message: t };
            }

            if (p.success === 1 || p.success === true) {
                return { success: 1, message: 'Success' };
            }

            for (const v of Object.values(p)) {
                if (typeof v === 'string' && v.trim()) return { success: 0, message: v.trim() };
            }

            return { success: 0, message: JSON.stringify(p) };
        }

        return { success: 0, message: String(p) };
    } catch (e) {
        return { success: 0, message: String(payload) };
    }
}

function normalizeOrderResponse(data) {
    const id = data?.orderid ?? data?.order_id ?? data?.id ?? data?.request_id ?? null;
    const phone = data?.phonenumber ?? data?.phone ?? data?.number ?? null;
    const price = data?.cost ?? data?.price ?? data?.amount ?? null;

    return {
        id,
        phone,
        price,
        raw: data
    };
}

function safePreview(payload) {
    try {
        const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
        return String(text).slice(0, 1000);
    } catch (err) {
        return '[unserializable payload]';
    }
}

function sameOrder(obj, orderId) {
    if (!obj || typeof obj !== 'object') return false;
    const vals = [obj.orderid, obj.order_id, obj.id, obj.request_id, obj.requestId, obj.requestID];
    for (const v of vals) {
        if (v && String(v) === String(orderId)) return true;
    }
    return false;
}

module.exports = {
    buySmsNumber,
    checkSms,
    cancelSms,
    normalizeApiResponse,
    normalizeOrderResponse,
    findOrderInActivePayload,
    sameOrder
};
