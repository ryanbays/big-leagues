function extractOtpFromBody(body, orderInfo = null) {
    if (!body) {
        return null;
    }

    if (typeof body === 'string') {
        const otp = extractOtp(body);
        return filterOtpByContext(otp, orderInfo);
    }

    const listCandidates = [body.messages, body.data, body.sms_list, body.results, body.messages_list];
    for (const list of listCandidates) {
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
            const text = (entry && (entry.text || entry.message || entry.body || entry.sms || entry.content || entry.code)) || JSON.stringify(entry);
            const otp = extractOtp(String(text || ''));
            const filtered = filterOtpByContext(otp, orderInfo);
            if (filtered) return filtered;
        }
    }

    const directFields = [body.code, body.full_code, body.sms, body.message, body.text, body.otp];
    for (const value of directFields) {
        const otp = extractOtp(String(value || ''));
        const filtered = filterOtpByContext(otp, orderInfo);
        if (filtered) return filtered;
    }

    if (Array.isArray(body)) {
        for (const entry of body) {
            const otp = extractOtpFromBody(entry, orderInfo);
            if (otp) return otp;
        }
    }

    if (body && typeof body === 'object') {
        const ignoreKeys = new Set([
            'time_left',
            'expiration',
            'status',
            'resend',
            'warning',
            'price',
            'cost',
            'orderid',
            'order_id',
            'id',
            'request_id'
        ]);

        for (const [key, value] of Object.entries(body)) {
            if (ignoreKeys.has(String(key).toLowerCase())) continue;

            if (typeof value === 'string') {
                const otp = extractOtp(value);
                const filtered = filterOtpByContext(otp, orderInfo);
                if (filtered) return filtered;
            }

            if (Array.isArray(value) || (value && typeof value === 'object')) {
                const otp = extractOtpFromBody(value, orderInfo);
                if (otp) return otp;
            }
        }
    }

    return null;
}

function filterOtpByContext(otp, orderInfo) {
    if (!otp) return null;
    if (!orderInfo) return otp;
    const normalizedOtp = String(otp);
    if (String(orderInfo.orderId) === normalizedOtp) return null;
    if (orderInfo.phone && String(orderInfo.phone).includes(normalizedOtp)) return null;
    return normalizedOtp;
}

function extractSmsText(body, orderInfo = null) {
    if (!body) return null;

    if (typeof body === 'string') {
        const text = body.trim();
        return text || null;
    }

    const listCandidates = [body.messages, body.data, body.sms_list, body.results, body.messages_list];
    for (const list of listCandidates) {
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
            const text = (entry && (entry.text || entry.message || entry.body || entry.sms || entry.content || entry.code)) || JSON.stringify(entry);
            if (text && String(text).trim()) {
                const t = String(text).trim();
                if (orderInfo && String(orderInfo.orderId) === t) continue;
                return t;
            }
        }
    }

    const directFields = [body.message, body.text, body.body, body.sms, body.code, body.otp];
    for (const v of directFields) {
        if (v && String(v).trim()) {
            const t = String(v).trim();
            if (orderInfo && String(orderInfo.orderId) === t) continue;
            return t;
        }
    }

    return null;
}

function extractOtp(text) {
    if (!text) {
        return null;
    }

    const match = text.match(/(?<![-\/:\"])\b(\d{4,8})\b(?![-\/:\"])/);
    if (!match) return null;
    const candidate = match[1];

    const year = Number(candidate);
    const currentYear = new Date().getFullYear();
    if (candidate.length === 4 && year >= 1900 && year <= currentYear + 5) {
        return null;
    }

    return candidate;
}

function isRefundSuccess(payload) {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    if (payload.success === 1 || payload.success === true) {
        return true;
    }

    const msg = String(payload.message || '').toLowerCase();
    return msg.includes('success') || msg.includes('cancel');
}

function extractRefundMessage(refundRes) {
    if (!refundRes) return null;
    if (typeof refundRes === 'object' && typeof refundRes.message === 'string') return refundRes.message;
    if (typeof refundRes === 'string') return refundRes;
    if (typeof refundRes === 'object') {
        for (const key of ['message', 'msg', 'error', 'data']) {
            const v = refundRes[key];
            if (!v) continue;
            if (typeof v === 'string') return v;
            if (typeof v === 'object' && v.message) return extractRefundMessage(v.message);
        }
        for (const v of Object.values(refundRes)) {
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
    }
    return String(refundRes);
}

module.exports = {
    extractOtpFromBody,
    extractSmsText,
    extractOtp,
    filterOtpByContext,
    isRefundSuccess,
    extractRefundMessage
};
