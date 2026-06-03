require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    Events,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const axios = require('axios');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const SMSPOOL_API_KEY = process.env.SMSPOOL_API_KEY;

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

if (!DISCORD_TOKEN || !CLIENT_ID || !SMSPOOL_API_KEY) {
    console.error('Missing required env vars. See .env.example');
    process.exit(1);
}

const axiosInstance = axios.create({
    baseURL: 'https://api.smspool.net',
    timeout: 20000
});

const SELECT_PREFIX = 'svc_select';
const GENERATE_PREFIX = 'generate';
const REFRESH_PREFIX = 'refresh';
const REFUND_PREFIX = 'refund';
const EPHEMERAL_FLAGS = MessageFlags.Ephemeral;

const activeOrders = new Map();

const commands = [
    {
        name: 'ping',
        description: 'Replies with pong'
    },
    {
        name: 'panel',
        description: 'Open UK SMS panel with service dropdown and generate button',
        default_member_permissions: '32',
        options: [{ name: 'maxprice', type: 10, description: 'Max price', required: true }]
    },
    {
        name: 'buyuk',
        description: 'Direct buy UK number and check OTP',
        default_member_permissions: '32',
        options: [
            {
                name: 'service',
                description: 'Choose service',
                type: 3,
                required: true,
                choices: [
                    { name: SERVICES.uberPostmates.label, value: SERVICES.uberPostmates.id },
                    { name: SERVICES.greggs.label, value: SERVICES.greggs.id }
                ]
            },
            { name: 'maxprice', type: 10, description: 'Max price (optional)', required: true }
        ]
    }
];

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        if (GUILD_ID) {
            try {
                await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
                console.log('Registered guild commands.');
                return;
            } catch (guildErr) {
                const code = guildErr && guildErr.code ? guildErr.code : null;
                if (code !== 50001) {
                    throw guildErr;
                }

                console.warn('Guild command registration failed with Missing Access; falling back to global commands.');
            }
        }

        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        if (GUILD_ID) {
            console.log('Registered global commands after guild fallback (may take up to an hour to propagate).');
        } else {
            console.log('Registered global commands (may take up to an hour to propagate).');
        }
    } catch (err) {
        console.error('Failed to register commands:', err);
    }
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    partials: ['CHANNEL']
});

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await registerCommands();
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction);
            return;
        }

        if (interaction.isStringSelectMenu()) {
            await handleServiceSelect(interaction);
            return;
        }

        if (interaction.isButton()) {
            await handleButton(interaction);
        }
    } catch (err) {
        if (isUnknownInteractionError(err)) {
            console.warn('Ignored expired interaction.');
            return;
        }
        console.error('Interaction handler error:', err);
    }
});

client.on(Events.Error, (err) => {
    console.error('Discord client error:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
});

async function handleSlashCommand(interaction) {
    if (interaction.commandName === 'ping') {
        await safeReply(interaction, { content: 'Pong!', flags: EPHEMERAL_FLAGS });
        return;
    }

    if (interaction.commandName === 'panel') {
        const maxPrice = interaction.options.getNumber('maxprice');
        const defaultServiceId = SERVICES.uberPostmates.id;

        await safeReply(interaction, {
            content: panelHeader(defaultServiceId, maxPrice),
            components: panelComponents(interaction.user.id, defaultServiceId, maxPrice)
        });
        return;
    }

    if (interaction.commandName === 'buyuk') {
        const serviceId = interaction.options.getString('service', true);
        const maxPrice = interaction.options.getNumber('maxprice');

        const deferred = await safeDeferReply(interaction, { flags: EPHEMERAL_FLAGS });
        if (!deferred) {
            return;
        }

        await safeEditReply(interaction, {
            content: `Generating UK number for ${serviceLabelFromId(serviceId)} (${serviceId})...`
        });

        await generateAndTrack(interaction, serviceId, maxPrice);
    }
}

async function handleServiceSelect(interaction) {
    if (!interaction.customId.startsWith(SELECT_PREFIX)) {
        return;
    }

    const [, ownerId, maxPriceRaw] = interaction.customId.split('|');

    const serviceId = interaction.values[0];
    if (!isAllowedService(serviceId)) {
        await safeReply(interaction, { content: 'Invalid service selection.', flags: EPHEMERAL_FLAGS });
        return;
    }

    const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : null;

    await safeUpdate(interaction, {
        content: panelHeader(serviceId, Number.isFinite(maxPrice) ? maxPrice : null),
        components: panelComponents(interaction.user.id, serviceId, Number.isFinite(maxPrice) ? maxPrice : null)
    });
}

async function handleButton(interaction) {
    if (interaction.customId.startsWith(GENERATE_PREFIX)) {
        const [, ownerId, serviceId, maxPriceRaw] = interaction.customId.split('|');

        if (!isAllowedService(serviceId)) {
            await safeReply(interaction, { content: 'Invalid service selection.', flags: EPHEMERAL_FLAGS });
            return;
        }

        const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : null;

        const deferred = await safeDeferReply(interaction, { flags: EPHEMERAL_FLAGS });
        if (!deferred) {
            return;
        }

        await generateAndTrack(interaction, serviceId, Number.isFinite(maxPrice) ? maxPrice : null);
        return;
    }

    if (interaction.customId.startsWith(REFRESH_PREFIX)) {
        const [, ownerId, orderId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
            await safeReply(interaction, { content: 'This button belongs to another user.', flags: EPHEMERAL_FLAGS });
            return;
        }

        let orderInfo = activeOrders.get(orderId);
        if (!orderInfo) {
            // Not in memory (bot restarted) — fetch SMS directly and show latest message/raw payload
            const smsData = await checkSms(orderId);
            const fullText = extractSmsText(smsData, null);
            const content = `Order not found locally. Latest message:\n${fullText || 'not received yet'}${process.env.DEBUG_SMSSPOOL === '1' ? `\nRaw: ${JSON.stringify(smsData)}` : ''}`;
            await safeReply(interaction, { content, flags: EPHEMERAL_FLAGS });
            return;
        }

        const smsData = await checkSms(orderId);
        const fullText = extractSmsText(smsData, orderInfo);

        if (fullText && fullText !== orderInfo.lastMessage) {
            orderInfo.lastMessage = fullText;
        }

        activeOrders.set(orderId, orderInfo);

        const content = orderMessage(orderInfo, null, orderInfo.refunded, smsData);
        await safeUpdate(interaction, {
            content,
            components: orderActionComponents(orderInfo.userId, orderId, orderInfo.refunded)
        });
        // Send phone number separately for easy copy
        await sendNumberMessage(interaction, orderInfo.phone);
        return;
    }

    if (interaction.customId.startsWith(REFUND_PREFIX)) {
        const [, ownerId, orderId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
            await safeReply(interaction, { content: 'This button belongs to another user.', flags: EPHEMERAL_FLAGS });
            return;
        }

        let orderInfo = activeOrders.get(orderId);
        if (!orderInfo) {
            // Not in memory — attempt API cancel but report success regardless
            try {
                await cancelSms(orderId);
            } catch (e) {
                /* ignore API errors when order not in memory */
            }
            const content = `Order not found locally. Refund attempted and marked as completed.`;
            await safeReply(interaction, { content, flags: EPHEMERAL_FLAGS });
            return;
        }

        if (orderInfo.refunded) {
            await safeReply(interaction, { content: 'Order already refunded/canceled.', flags: EPHEMERAL_FLAGS });
            return;
        }

        const refundRes = await cancelSms(orderId);
        const refunded = isRefundSuccess(refundRes);
        orderInfo.refunded = refunded;
        activeOrders.set(orderId, orderInfo);

        const content = `${orderMessage(orderInfo, null, orderInfo.refunded, refundRes)}\n${formatRefundResponse(refundRes)}`;

        await safeUpdate(interaction, {
            content,
            components: orderActionComponents(orderInfo.userId, orderId, refunded)
        });
        return;
    }
}

async function generateAndTrack(interaction, serviceId, maxPrice) {
    try {
        const orderData = await buySmsNumber({ serviceId, maxPrice });
        const orderId = orderData.id;

        if (!orderId) {
            await safeFollowUp(interaction, {
                content: `Purchase succeeded but order ID missing. Raw: ${JSON.stringify(orderData.raw)}`,
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        const info = {
            orderId: String(orderId),
            userId: interaction.user.id,
            serviceId,
            phone: orderData.phone || 'not returned by API',
            price: orderData.price,
            refunded: false,
            lastOtp: null,
            lastMessage: null,
            createdAt: Date.now()
        };

        activeOrders.set(String(orderId), info);

        await safeFollowUp(interaction, {
            content: orderMessage(info, null, false, null),
            components: orderActionComponents(interaction.user.id, String(orderId), false),
            flags: EPHEMERAL_FLAGS
        });
        // Send number separately for easy copy
        await sendNumberMessage(interaction, info.phone);
        // start background poll to push SMS updates (does not block reply)
        pollAndPushUpdates(interaction, info).catch((err) => {
            const m = err && err.message ? err.message : String(err);
            console.warn(`pollAndPushUpdates failed for ${info.orderId}: ${m}`);
        });
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        await safeFollowUp(interaction, { content: `Purchase failed: ${msg}`, flags: EPHEMERAL_FLAGS });
    }
}

async function buySmsNumber({ serviceId, maxPrice }) {
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
        throw new Error(`Unexpected response format from /purchase/sms: ${JSON.stringify(res.data)}`);
    }

    return normalized;
}

async function checkSms(orderId) {
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

        if (process.env.DEBUG_SMSSPOOL === '1') {
            try {
                console.debug('[SMSPOOL][request/active] payload for order', orderId, JSON.stringify(res.data).slice(0, 1000));
            } catch (e) {
                /* ignore stringify errors */
            }
        }

        const match = findOrderInActivePayload(res.data, String(orderId));
        return match || null;
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        console.warn(`Active order check failed: ${message}`);
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

    if (process.env.DEBUG_SMSSPOOL === '1') {
        try {
            console.debug('[SMSPOOL][sms/check] payload for order', orderId, JSON.stringify(res.data).slice(0, 1000));
        } catch (e) {
            /* ignore */
        }
    }

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
        const resp = err && err.response && err.response.data ? err.response.data : null;
        if (resp) return normalizeApiResponse(resp);
        const message = err && err.message ? err.message : String(err);
        return { success: 0, message };
    }
}

function normalizeApiResponse(payload) {
    if (payload === undefined || payload === null) return { success: 0, message: 'No response from API' };

    // Deeply unwrap strings that contain JSON until we reach a primitive message.
    try {
        let p = payload;

        // If payload is a string that contains JSON, parse it repeatedly.
        while (typeof p === 'string') {
            const t = p.trim();
            if (t.startsWith('{') || t.startsWith('[')) {
                try {
                    p = JSON.parse(t);
                    continue;
                } catch (e) {
                    // not JSON — return the raw string as message
                    return { success: 0, message: t };
                }
            }
            return { success: 0, message: t };
        }

        // If it's an object, try to extract a human message field.
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

            // If message field is not a string, but success flag exists
            if (p.success === 1 || p.success === true) {
                return { success: 1, message: 'Success' };
            }

            // Try to find any string-valued property to use as message
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

async function pollAndPushUpdates(interaction, orderInfo) {
    const started = Date.now();

    while (Date.now() - started < OTP_TIMEOUT_MS) {
        const current = activeOrders.get(orderInfo.orderId);
        if (!current || current.refunded) {
            return;
        }

        try {
            const smsData = await checkSms(orderInfo.orderId);
            const fullText = extractSmsText(smsData, orderInfo);

            if (fullText && fullText !== current.lastMessage) {
                current.lastMessage = fullText;
                activeOrders.set(orderInfo.orderId, current);
                const rawPart = process.env.DEBUG_SMSSPOOL === '1' ? `\nRaw SMS payload: ${JSON.stringify(smsData)}` : '';
                await interaction.followUp({
                    content: `SMS update for order ${orderInfo.orderId}:\nMessage: ${fullText || 'not available'}${rawPart}`,
                    flags: EPHEMERAL_FLAGS
                });
                return;
            }
        } catch (err) {
            const message = err && err.message ? err.message : String(err);
            console.warn(`Auto-poll failed for order ${orderInfo.orderId}: ${message}`);
        }

        await new Promise((resolve) => setTimeout(resolve, OTP_POLL_INTERVAL_MS));
    }

    const current = activeOrders.get(orderInfo.orderId);
    if (current && !current.refunded) {
        await interaction.followUp({
            content: `No OTP yet for order ${orderInfo.orderId}. Use Refresh SMS button to check again or Refund to cancel.`,
            flags: EPHEMERAL_FLAGS
        });
    }
}

function panelHeader(serviceId, maxPrice) {
    const lines = ['Country: ' + UK_COUNTRY];

    if (maxPrice !== null && maxPrice !== undefined) {
        lines.push(`Max price: ${maxPrice}`);
    }

    lines.push('Press Generate after selecting service.');
    return lines.join('\n');
}

function panelComponents(userId, selectedServiceId, maxPrice) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(`${SELECT_PREFIX}|${userId}|${maxPrice ?? ''}`)
        .setPlaceholder('Select service')
        .addOptions(
            SERVICE_OPTIONS.map((option) => ({
                ...option,
                default: option.value === selectedServiceId
            }))
        );

    const generate = new ButtonBuilder()
        .setCustomId(`${GENERATE_PREFIX}|${userId}|${selectedServiceId}|${maxPrice ?? ''}`)
        .setLabel('Generate')
        .setStyle(ButtonStyle.Success);

    return [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(generate)];
}

function orderActionComponents(userId, orderId, refunded) {
    const refresh = new ButtonBuilder()
        .setCustomId(`${REFRESH_PREFIX}|${userId}|${orderId}`)
        .setLabel('Refresh SMS')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(Boolean(refunded));

    const refund = new ButtonBuilder()
        .setCustomId(`${REFUND_PREFIX}|${userId}|${orderId}`)
        .setLabel(refunded ? 'Refunded' : 'Refund')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(Boolean(refunded));

    return [new ActionRowBuilder().addComponents(refresh, refund)];
}

function orderMessage(orderInfo, otp, refunded, statusBody) {
    // Minimal summary for quick copy/paste: Service, Order ID, Price
    const lines = [
        `Service: ${serviceLabelFromId(orderInfo.serviceId)}`,
        `Order ID: ${orderInfo.orderId}`,
        `Price: ${formatPrice(orderInfo.price)}`
    ];

    return lines.join('\n');
}

async function sendNumberMessage(interaction, phone) {
    if (!phone) return null;
    try {
        return await safeFollowUp(interaction, {
            content: formatCopyFriendly(phone),
            flags: EPHEMERAL_FLAGS
        });
    } catch (err) {
        console.warn('Failed to send number follow-up:', err && err.message ? err.message : String(err));
        return null;
    }
}

function compactStatus(body) {
    const asText = typeof body === 'string' ? body : JSON.stringify(body);
    if (asText.length <= 180) {
        return asText;
    }
    return `${asText.slice(0, 177)}...`;
}

function formatCopyFriendly(phone) {
    // Discord does not support clipboard-copy buttons in bot messages, so this format is easiest to copy.
    return `\`${String(phone)}\``;
}

function formatPrice(price) {
    if (price === null || price === undefined || price === '') {
        return '$not returned by API';
    }

    const text = String(price);
    return text.startsWith('$') ? text : `$${text}`;
}

function formatRefundResponse(refundRes) {
    const success = isRefundSuccess(refundRes);
    const status = success ? 'Refund successful.' : 'Refund not completed.';
    const message = extractRefundMessage(refundRes) || 'No message returned by API.';
    return `${status}\nRefund response: ${message}`;
}

function extractRefundMessage(refundRes) {
    if (!refundRes) return null;
    // If already normalized and has a string message, return it
    if (typeof refundRes === 'object' && typeof refundRes.message === 'string') return refundRes.message;
    if (typeof refundRes === 'string') return refundRes;
    // If it's an object with nested message objects, try to unwrap common patterns
    if (typeof refundRes === 'object') {
        for (const key of ['message', 'msg', 'error', 'data']) {
            const v = refundRes[key];
            if (!v) continue;
            if (typeof v === 'string') return v;
            if (typeof v === 'object' && v.message) return extractRefundMessage(v.message);
        }
        // Fallback: find any string value
        for (const v of Object.values(refundRes)) {
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
    }
    return String(refundRes);
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

function extractOtpFromBody(body, orderInfo = null) {
    if (!body) {
        return null;
    }

    if (typeof body === 'string') {
        const otp = extractOtp(body);
        return filterOtpByContext(otp, orderInfo);
    }
    // Prefer message-like arrays/fields
    const listCandidates = [body.messages, body.data, body.sms_list, body.results, body.messages_list];
    for (const list of listCandidates) {
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
            // common text fields
            const text = (entry && (entry.text || entry.message || entry.body || entry.sms || entry.content || entry.code)) || JSON.stringify(entry);
            const otp = extractOtp(String(text || ''));
            const filtered = filterOtpByContext(otp, orderInfo);
            if (filtered) return filtered;
        }
    }

    // Direct known fields
    const directFields = [body.code, body.full_code, body.sms, body.message, body.text, body.otp];
    for (const value of directFields) {
        const otp = extractOtp(String(value || ''));
        const filtered = filterOtpByContext(otp, orderInfo);
        if (filtered) return filtered;
    }

    // Recurse arrays
    if (Array.isArray(body)) {
        for (const entry of body) {
            const otp = extractOtpFromBody(entry, orderInfo);
            if (otp) return otp;
        }
    }

    // Scan object properties but avoid numeric-only metadata fields (time_left, expiration, etc.)
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

    // No reliable OTP found in message-like fields — avoid scavenging numbers from JSON metadata
    return null;
}

function filterOtpByContext(otp, orderInfo) {
    if (!otp) return null;
    if (!orderInfo) return otp;
    // Ignore OTPs that match order id or phone (to avoid false positives)
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

    // If we reach here, there's no human-readable SMS text present — treat as no message yet.
    return null;
}

function extractOtp(text) {
    if (!text) {
        return null;
    }
    // Avoid matching numbers that are adjacent to common date separators (-, /, :)
    const match = text.match(/(?<![-\/:"])\b(\d{4,8})\b(?![-\/:"])/);
    if (!match) return null;
    const candidate = match[1];
    // filter out year-like values (e.g. 2026) which are not OTPs
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

function isAllowedService(serviceId) {
    const allowed = Object.values(SERVICES).map((s) => String(s.id));
    return allowed.includes(String(serviceId));
}

function serviceLabelFromId(serviceId) {
    if (serviceId === SERVICES.greggs.id) return SERVICES.greggs.label;
    if (serviceId === SERVICES.uberPostmates.id) return SERVICES.uberPostmates.label;
    return `Service ${serviceId}`;
}

function sameOrder(obj, orderId) {
    if (!obj || typeof obj !== 'object') return false;
    const vals = [obj.orderid, obj.order_id, obj.id, obj.request_id, obj.requestId, obj.requestID];
    for (const v of vals) {
        if (v && String(v) === String(orderId)) return true;
    }
    return false;
}

function isAlreadyAcknowledgedError(err) {
    return Boolean(err && (err.code === 40060 || (err.rawError && err.rawError.code === 40060)));
}

function isUnknownInteractionError(err) {
    return Boolean(err && err.code === 10062);
}

async function safeReply(interaction, payload) {
    try {
        return await interaction.reply(payload);
    } catch (err) {
        if (isUnknownInteractionError(err)) {
            console.warn('Reply skipped because interaction expired.');
            return null;
        }
        if (isAlreadyAcknowledgedError(err)) {
            console.warn('Reply skipped because interaction already acknowledged.');
            return null;
        }
        throw err;
    }
}

async function safeUpdate(interaction, payload) {
    try {
        return await interaction.update(payload);
    } catch (err) {
        if (isUnknownInteractionError(err)) {
            console.warn('Update skipped because interaction expired.');
            return null;
        }
        if (isAlreadyAcknowledgedError(err)) {
            console.warn('Update skipped because interaction already acknowledged.');
            return null;
        }
        throw err;
    }
}

async function safeFollowUp(interaction, payload) {
    try {
        return await interaction.followUp(payload);
    } catch (err) {
        if (isUnknownInteractionError(err)) {
            console.warn('Follow-up skipped because interaction expired.');
            return null;
        }
        if (isAlreadyAcknowledgedError(err)) {
            console.warn('Follow-up skipped because interaction already acknowledged.');
            return null;
        }
        throw err;
    }
}

async function safeEditReply(interaction, payload) {
    try {
        return await interaction.editReply(payload);
    } catch (err) {
        if (isUnknownInteractionError(err)) {
            console.warn('Edit reply skipped because interaction expired.');
            return null;
        }
        if (isAlreadyAcknowledgedError(err)) {
            console.warn('Edit reply skipped because interaction already acknowledged.');
            return null;
        }
        throw err;
    }
}

async function safeDeferReply(interaction, payload) {
    try {
        await interaction.deferReply(payload);
        return true;
    } catch (err) {
        if (isUnknownInteractionError(err)) {
            console.warn('Defer skipped because interaction expired.');
            return false;
        }
        if (isAlreadyAcknowledgedError(err)) {
            console.warn('Defer skipped because interaction already acknowledged.');
            return false;
        }
        throw err;
    }
}

client.login(DISCORD_TOKEN);
