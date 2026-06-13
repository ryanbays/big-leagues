const {
    OTP_TIMEOUT_MS,
    OTP_POLL_INTERVAL_MS,
    SERVICES,
    SELECT_PREFIX,
    GENERATE_PREFIX,
    PROMO_SELECT_PREFIX,
    PROMO_FETCH_PREFIX,
    REFRESH_PREFIX,
    REFUND_PREFIX,
    EPHEMERAL_FLAGS
} = require('../constants');

const { activeOrders } = require('../state');
const { createLogger } = require('../logger');
const { isAllowedService, serviceLabelFromId } = require('../serviceUtils');
const { buySmsNumber, checkSms, cancelSms } = require('../smspool/client');
const { extractSmsText, isRefundSuccess } = require('../smspool/parsing');
const { fetchPromoServices, fetchPromoCode } = require('./promo');

const {
    panelHeader,
    panelComponents,
    promoPanelHeader,
    promoPanelComponents,
    orderActionComponents,
    orderMessage,
    formatCopyFriendly,
    formatPromoCopyFriendly,
    formatRefundResponse
} = require('./ui');

const {
    safeReply,
    safeUpdate,
    safeFollowUp,
    safeEditReply,
    safeDeferReply,
    safeDeferUpdate,
    isUnknownInteractionError
} = require('./safe');

const { addOrder, removeOrder, listOrders } = require('./orderDb');

const logger = createLogger('discord/handlers');
const assert = require('assert').strict;

function parseDateInput(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;

    const ms = Date.parse(s);
    if (Number.isFinite(ms)) return ms;

    // Allow unix seconds or ms.
    if (/^\d+$/.test(s)) {
        const n = Number(s);
        if (!Number.isFinite(n)) return null;
        if (n > 10_000_000_000) return n; // ms
        return n * 1000; // seconds
    }

    return null;
}

function parseNumberInput(raw) {
    if (raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

function normalizeServiceId(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    return s;
}

function formatMoney(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n);
    return num.toFixed(2);
}

function withinRange(value, min, max) {
    if (min !== null && min !== undefined && Number.isFinite(min) && value < min) return false;
    if (max !== null && max !== undefined && Number.isFinite(max) && value > max) return false;
    return true;
}

function getUserLabelFromOrders(orders, userId) {
    if (!userId) return 'unknown';
    const idStr = String(userId);

    for (const o of orders || []) {
        if (!o) continue;
        if (o.userId === null || o.userId === undefined) continue;
        if (String(o.userId) !== idStr) continue;

        const candidate =
            o.userName ||
            o.username ||
            o.user ||
            o.displayName ||
            o.discordName ||
            o.tag ||
            null;

        if (candidate && String(candidate).trim()) {
            return `${candidate} (${idStr})`;
        }
    }

    return idStr;
}

function summarizeSpend(orders, userId, nowMs) {
    const windows = [
        { label: '24h', ms: 24 * 60 * 60 * 1000 },
        { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
        { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 }
    ];

    const sums = Object.fromEntries(windows.map((w) => [w.label, 0]));

    for (const o of orders) {
        if (String(o.userId) !== String(userId)) continue;
        const createdAt = parseNumberInput(o.createdAt);
        if (!Number.isFinite(createdAt)) continue;

        const price = parseNumberInput(o.price);
        if (!Number.isFinite(price)) continue;

        for (const w of windows) {
            if (nowMs - createdAt <= w.ms) sums[w.label] += price;
        }
    }

    return sums;
}

function formatSpendSummaryResponse({ userLabel, spendSummary, userOrders }) {
    text = [
        'Purchase history',
        `User: ${userLabel || 'unknown'}`,
        `Total spend (user): 24h=$${formatMoney(spendSummary['24h'])}, 7d=$${formatMoney(spendSummary['7d'])}, 30d=$${formatMoney(spendSummary['30d'])}`
    ].join('\n');
    const recentOrders = (userOrders || []).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 5);
    if (recentOrders.length) {
        text += '\n\nRecent orders:\n' + recentOrders.map((o) => {
            const createdAt = o.createdAt ? new Date(Number(o.createdAt)).toLocaleString() : 'unknown';
            const price = o.price !== undefined && o.price !== null ? `$${formatMoney(o.price)}` : 'unknown';
            const service = o.serviceId ? `${serviceLabelFromId(o.serviceId)} (${o.serviceId})` : 'unknown';
            return `- ${createdAt} | ${price} | ${service} | orderId=${o.orderId}`;
        }).join('\n');
    }
    return text;
}

function formatHistoryResponse({ filters, orders, spendSummary, allOrdersForLookups }) {
    const lines = [];

    lines.push('Purchase history');

    if (filters) {
        const f = [];
        if (filters.userId) f.push(`user=${getUserLabelFromOrders(allOrdersForLookups || orders, filters.userId)}`);
        if (filters.serviceId) f.push(`service=${filters.serviceId}`);
        if (filters.minPrice !== null && filters.minPrice !== undefined) f.push(`minPrice=${filters.minPrice}`);
        if (filters.maxPrice !== null && filters.maxPrice !== undefined) f.push(`maxPrice=${filters.maxPrice}`);
        if (filters.fromMs) f.push(`from=${new Date(filters.fromMs).toLocaleString()}`);
        if (filters.toMs) f.push(`to=${new Date(filters.toMs).toLocaleString()}`);
        if (typeof filters.limit === 'number') f.push(`limit=${filters.limit}`);
        lines.push(f.length ? `Filters: ${f.join(', ')}` : 'Filters: none');
    }

    if (spendSummary) {
        lines.push(
            `Total spend (user): 24h=$${formatMoney(spendSummary['24h'])}, 7d=$${formatMoney(spendSummary['7d'])}, 30d=$${formatMoney(spendSummary['30d'])}`
        );
    }

    lines.push('');

    if (!orders || orders.length === 0) {
        lines.push('No orders found.');
        return lines.join('\n');
    }

    const show = orders.slice(0, 25); // keep message size reasonable
    for (const o of show) {
        const createdAt = o.createdAt ? new Date(Number(o.createdAt)).toLocaleString() : 'unknown';
        const price = o.price !== undefined && o.price !== null ? `$${formatMoney(o.price)}` : 'unknown';
        const service = o.serviceId ? `${serviceLabelFromId(o.serviceId)} (${o.serviceId})` : 'unknown';

        const userId = o.userId !== undefined && o.userId !== null ? String(o.userId) : 'unknown';
        const userName =
            o.userName ||
            o.username ||
            o.user ||
            o.displayName ||
            o.discordName ||
            o.tag ||
            'unknown';

        lines.push(`- ${createdAt} | ${price} | ${service} | orderId=${o.orderId} | user=${userName} (${userId})`);
    }

    if (orders.length > show.length) {
        lines.push(`\nShowing ${show.length} of ${orders.length} results.`);
    }

    return lines.join('\n');
}

async function handleSlashCommand(interaction) {
    logger.debug('Handling slash command.', {
        commandName: interaction.commandName,
        userId: interaction.user?.id || null
    });

    if (interaction.commandName === 'ping') {
        await safeReply(interaction, { content: 'Pong!', flags: EPHEMERAL_FLAGS });
        return;
    }

    if (interaction.commandName === 'panel') {
        const maxPrice = interaction.options.getNumber('maxprice');
        assert(maxPrice !== null && maxPrice !== undefined && Number.isFinite(maxPrice), 'Invalid maxprice input'); // should be guaranteed by command definition
        const defaultServiceId = SERVICES.uberPostmates.id;

        logger.trace('Opening SMS panel.', {
            userId: interaction.user.id,
            maxPrice,
            defaultServiceId
        });

        await safeReply(interaction, {
            content: panelHeader(defaultServiceId, maxPrice),
            components: panelComponents(interaction.user.id, defaultServiceId, maxPrice)
        });
        return;
    }

    if (interaction.commandName === 'promopanel') {
        logger.trace('Opening promo panel.', { userId: interaction.user.id });

        const deferred = await safeDeferReply(interaction);
        if (!deferred) {
            return;
        }

        let promoServices = [];
        try {
            promoServices = await fetchPromoServices({
                userId: interaction.user.id,
                interaction
            });
        } catch (err) {
            const message = err && err.message ? err.message : String(err);
            await safeEditReply(interaction, { content: `Failed to load promo services: ${message}` });
            return;
        }

        if (!Array.isArray(promoServices) || promoServices.length === 0) {
            logger.warn('Promo service API returned no usable services.', { userId: interaction.user.id });
            await safeEditReply(interaction, { content: 'No promo services returned by the API.' });
            return;
        }

        logger.debug('Promo services loaded.', {
            userId: interaction.user.id,
            serviceCount: promoServices.length
        });

        const defaultService = promoServices[0];
        const defaultServiceId = String(defaultService?.value ?? defaultService?.id ?? defaultService?.serviceId ?? defaultService?.service_id ?? defaultService?.code ?? defaultService?.key ?? '');

        await safeEditReply(interaction, {
            content: promoPanelHeader(defaultService?.label ?? defaultServiceId),
            components: promoPanelComponents(interaction.user.id, promoServices, defaultServiceId)
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
        return;
    }

    // /history [from] [to] [service] [minprice] [maxprice] [user] [limit]
    // /history spend [user]
    if (interaction.commandName === 'history') {
        const deferred = await safeDeferReply(interaction, { flags: EPHEMERAL_FLAGS });
        if (!deferred) return;

        if (typeof listOrders !== 'function') {
            await safeEditReply(interaction, {
                content: 'History is not available: orderDb.listOrders is missing.',
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        const sub = interaction.options.getSubcommand(false);

        // Subcommand: spend
        if (sub === 'spend') {
            const userId = interaction.options.getString('user') || interaction.user.id;

            let orders = [];
            try {
                orders = await listOrders();
            } catch (e) {
                await safeEditReply(interaction, {
                    content: `Failed to load order history: ${e && e.message ? e.message : String(e)}`,
                    flags: EPHEMERAL_FLAGS
                });
                return;
            }

            const nowMs = Date.now();
            const sums = summarizeSpend(orders, userId, nowMs);
            const userLabel = getUserLabelFromOrders(orders, userId);
            const userOrders = orders.filter((o) => String(o.userId) === String(userId));

            await safeEditReply(interaction, {
                content: formatSpendSummaryResponse({ userLabel, spendSummary: sums, userOrders }),
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        // Default: list orders with filters
        const fromMs = parseDateInput(interaction.options.getString('from'));
        const toMs = parseDateInput(interaction.options.getString('to'));
        const serviceId = normalizeServiceId(interaction.options.getString('service'));
        const minPrice = parseNumberInput(interaction.options.getNumber('minprice'));
        const maxPrice = parseNumberInput(interaction.options.getNumber('maxprice'));
        const userId = interaction.options.getString('user') || null;
        const limitRaw = interaction.options.getInteger('limit');
        const limit = Number.isInteger(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;

        let orders = [];
        try {
            // Expect listOrders to return objects like: { orderId, userId, serviceId, price, createdAt }
            orders = await listOrders();
        } catch (e) {
            await safeEditReply(interaction, {
                content: `Failed to load order history: ${e && e.message ? e.message : String(e)}`,
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        const filtered = orders
            .filter((o) => {
                if (userId && String(o.userId) !== String(userId)) return false;

                if (serviceId) {
                    if (!o.serviceId) return false;
                    if (String(o.serviceId) !== String(serviceId)) return false;
                }

                const price = parseNumberInput(o.price);
                if (minPrice !== null && minPrice !== undefined && Number.isFinite(minPrice)) {
                    if (!Number.isFinite(price) || price < minPrice) return false;
                }
                if (maxPrice !== null && maxPrice !== undefined && Number.isFinite(maxPrice)) {
                    if (!Number.isFinite(price) || price > maxPrice) return false;
                }

                const createdAt = parseNumberInput(o.createdAt);
                if (fromMs && Number.isFinite(fromMs)) {
                    if (!Number.isFinite(createdAt) || createdAt < fromMs) return false;
                }
                if (toMs && Number.isFinite(toMs)) {
                    if (!Number.isFinite(createdAt) || createdAt > toMs) return false;
                }

                return true;
            })
            .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
            .slice(0, limit);

        const spendSummary = userId ? summarizeSpend(orders, userId, Date.now()) : null;

        await safeEditReply(interaction, {
            content: formatHistoryResponse({
                filters: { fromMs, toMs, serviceId, minPrice, maxPrice, userId, limit },
                orders: filtered,
                spendSummary,
                allOrdersForLookups: orders
            }),
            flags: EPHEMERAL_FLAGS
        });
        return;
    }
}

async function handleServiceSelect(interaction) {
    if (!interaction.customId.startsWith(SELECT_PREFIX)) {
        if (!interaction.customId.startsWith(PROMO_SELECT_PREFIX)) {
            return;
        }
    }

    if (interaction.customId.startsWith(PROMO_SELECT_PREFIX)) {
        logger.trace('Promo service selection changed.', {
            userId: interaction.user.id,
            selectedServiceId: interaction.values[0]
        });

        const deferred = await safeDeferUpdate(interaction);
        if (!deferred) {
            return;
        }

        let promoServices = [];
        try {
            promoServices = await fetchPromoServices({
                userId: interaction.user.id,
                interaction
            });
        } catch (err) {
            const message = err && err.message ? err.message : String(err);
            await safeEditReply(interaction, { content: `Failed to load promo services: ${message}` });
            return;
        }

        const selectedServiceId = interaction.values[0];
        const selectedService = promoServices.find((service) => {
            const value = service && (service.value ?? service.id ?? service.serviceId ?? service.service_id ?? service.code ?? service.key);
            return String(value) === String(selectedServiceId);
        });

        await safeEditReply(interaction, {
            content: promoPanelHeader(selectedService?.label ?? selectedServiceId),
            components: promoPanelComponents(interaction.user.id, promoServices, selectedServiceId)
        });
        return;
    }

    const [, , maxPriceRaw] = interaction.customId.split('|');

    const serviceId = interaction.values[0];
    if (!isAllowedService(serviceId)) {
        logger.warn('Invalid service selection rejected.', {
            userId: interaction.user.id,
            serviceId
        });
        await safeReply(interaction, { content: 'Invalid service selection.', flags: EPHEMERAL_FLAGS });
        return;
    }

    const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : null;

    logger.trace('SMS service selection changed.', {
        userId: interaction.user.id,
        serviceId,
        maxPrice: Number.isFinite(maxPrice) ? maxPrice : null
    });

    await safeUpdate(interaction, {
        content: panelHeader(serviceId, Number.isFinite(maxPrice) ? maxPrice : null),
        components: panelComponents(interaction.user.id, serviceId, Number.isFinite(maxPrice) ? maxPrice : null)
    });
}

async function handleButton(interaction) {
    if (interaction.customId.startsWith(GENERATE_PREFIX)) {
        const [, , serviceId, maxPriceRaw] = interaction.customId.split('|');

        if (!isAllowedService(serviceId)) {
            logger.warn('Invalid generate request rejected.', {
                userId: interaction.user.id,
                serviceId
            });
            await safeReply(interaction, { content: 'Invalid service selection.', flags: EPHEMERAL_FLAGS });
            return;
        }

        const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : null;

        const deferred = await safeDeferReply(interaction, { flags: EPHEMERAL_FLAGS });
        if (!deferred) {
            return;
        }

        logger.info('Generating SMS number.', {
            userId: interaction.user.id,
            serviceId,
            maxPrice: Number.isFinite(maxPrice) ? maxPrice : null
        });

        await generateAndTrack(interaction, serviceId, Number.isFinite(maxPrice) ? maxPrice : null);
        return;
    }

    if (interaction.customId.startsWith(PROMO_FETCH_PREFIX)) {
        const [, , serviceId] = interaction.customId.split('|');

        logger.info('Fetching promo code.', {
            userId: interaction.user.id,
            serviceId
        });

        const deferred = await safeDeferReply(interaction, { flags: EPHEMERAL_FLAGS });
        if (!deferred) {
            return;
        }

        const promoCode = await fetchPromoCode({
            userId: interaction.user.id,
            serviceId,
            interaction
        });

        const content = promoCode
            ? `Promo code:\n${formatPromoCopyFriendly(promoCode)}`
            : 'No promo code returned by API.';

        logger.debug('Promo code fetch completed.', {
            userId: interaction.user.id,
            serviceId,
            hasCode: Boolean(promoCode)
        });

        await safeFollowUp(interaction, {
            content,
            flags: EPHEMERAL_FLAGS
        });
        return;
    }

    if (interaction.customId.startsWith(REFRESH_PREFIX)) {
        const [, ownerId, orderId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
            await safeReply(interaction, { content: 'This button belongs to another user.', flags: EPHEMERAL_FLAGS });
            return;
        }

        logger.trace('Refresh SMS requested.', {
            userId: interaction.user.id,
            orderId
        });

        const orderInfo = activeOrders.get(orderId);
        if (!orderInfo) {
            const smsData = await checkSms(orderId);
            const fullText = extractSmsText(smsData, null);
            const content = `Order not found locally. Latest message:\n${fullText || 'not received yet'}${process.env.DEBUG_SMSSPOOL === '1' ? `\nRaw: ${JSON.stringify(smsData)}` : ''
                }`;
            await safeReply(interaction, { content, flags: EPHEMERAL_FLAGS });
            return;
        }

        const smsData = await checkSms(orderId);
        const fullText = extractSmsText(smsData, orderInfo);

        if (fullText && fullText !== orderInfo.lastMessage) {
            orderInfo.lastMessage = fullText;
        }

        activeOrders.set(orderId, orderInfo);

        const content = orderMessage(orderInfo);
        await safeUpdate(interaction, {
            content,
            components: orderActionComponents(orderInfo.userId, orderId, orderInfo.refunded)
        });

        await sendNumberMessage(interaction, orderInfo.phone);
        return;
    }

    if (interaction.customId.startsWith(REFUND_PREFIX)) {
        const [, ownerId, orderId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
            await safeReply(interaction, { content: 'This button belongs to another user.', flags: EPHEMERAL_FLAGS });
            return;
        }

        logger.trace('Refund requested.', {
            userId: interaction.user.id,
            orderId
        });

        const orderInfo = activeOrders.get(orderId);
        if (!orderInfo) {
            try {
                await cancelSms(orderId);
            } catch (e) {
                /* ignore API errors when order not in memory */
            }

            // Best-effort cleanup in DB too.
            try {
                await removeOrder(orderId);
            } catch (e) {
                /* ignore db errors */
            }

            const content = `Order not found locally. Refund attempted and marked as completed.`;
            await safeReply(interaction, { content, flags: EPHEMERAL_FLAGS });
            return;
        }

        if (orderInfo.refunded) {
            await safeReply(interaction, { content: 'Order already refunded/canceled.', flags: EPHEMERAL_FLAGS });
            return;
        }

        // Block refunds once an OTP/SMS has been received for this order.
        // We treat "received" as having a non-empty lastMessage (set by refresh/poll).
        if (orderInfo.lastMessage && String(orderInfo.lastMessage).trim().length > 0) {
            await safeReply(interaction, {
                content: 'Refund is disabled because an OTP/SMS has already been received for this order.',
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        const refundRes = await cancelSms(orderId);
        const refunded = isRefundSuccess(refundRes);

        if (refunded) {
            try {
                await removeOrder(orderId);
            } catch (e) {
                /* ignore db errors */
            }
        }

        orderInfo.refunded = refunded;
        activeOrders.set(orderId, orderInfo);

        const content = `${orderMessage(orderInfo)}\n${formatRefundResponse(refundRes)}`;

        await safeUpdate(interaction, {
            content,
            components: orderActionComponents(orderInfo.userId, orderId, refunded)
        });
        return;
    }
}

async function generateAndTrack(interaction, serviceId, maxPrice) {
    try {
        logger.debug('Starting SMS purchase request.', {
            userId: interaction.user.id,
            serviceId,
            maxPrice: Number.isFinite(maxPrice) ? maxPrice : null
        });

        const orderData = await buySmsNumber({ serviceId, maxPrice });
        const orderId = orderData.id;

        if (!orderId) {
            logger.warn('SMS purchase succeeded without an order id.', {
                userId: interaction.user.id,
                serviceId,
                raw: orderData.raw
            });
            await safeFollowUp(interaction, {
                content: `Purchase succeeded but order ID missing. Raw: ${JSON.stringify(orderData.raw)}`,
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        logger.info('SMS purchase completed.', {
            userId: interaction.user.id,
            orderId: String(orderId),
            serviceId,
            price: orderData.price ?? null
        });

        const info = {
            orderId: String(orderId),
            userId: interaction.user.id,
            userName: interaction.user?.username || interaction.user?.tag || null,
            serviceId,
            phone: orderData.phone || 'not returned by API',
            price: orderData.price,
            refunded: false,
            lastOtp: null,
            lastMessage: null,
            createdAt: Date.now()
        };

        activeOrders.set(String(orderId), info);

        // Persist to DB for tracking by userId/serviceId/price.
        try {
            await addOrder({
                orderId: info.orderId,
                userId: info.userId,
                userName: info.userName,
                serviceId: info.serviceId,
                price: info.price,
                createdAt: info.createdAt
            });
        } catch (e) {
            logger.warn('Failed to persist order to DB.', e);
        }

        await safeFollowUp(interaction, {
            content: orderMessage(info),
            components: orderActionComponents(interaction.user.id, String(orderId), false),
            flags: EPHEMERAL_FLAGS
        });

        await sendNumberMessage(interaction, info.phone);

        pollAndPushUpdates(interaction, info).catch((err) => {
            const m = err && err.message ? err.message : String(err);
            console.warn(`pollAndPushUpdates failed for ${info.orderId}: ${m}`);
        });
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        logger.error('SMS purchase failed.', {
            userId: interaction.user.id,
            serviceId,
            maxPrice,
            error: msg
        });
        await safeFollowUp(interaction, { content: `Purchase failed: ${msg}`, flags: EPHEMERAL_FLAGS });
    }
}

async function pollAndPushUpdates(interaction, orderInfo) {
    const started = Date.now();

    while (Date.now() - started < OTP_TIMEOUT_MS) {
        const current = activeOrders.get(orderInfo.orderId);
        if (!current || current.refunded) {
            logger.trace('Stopping OTP poll for inactive order.', {
                orderId: orderInfo.orderId,
                refunded: current ? current.refunded : null
            });
            return;
        }

        try {
            const smsData = await checkSms(orderInfo.orderId);
            const fullText = extractSmsText(smsData, orderInfo);

            if (fullText && fullText !== current.lastMessage) {
                logger.info('New SMS message detected for order.', {
                    orderId: orderInfo.orderId,
                    userId: orderInfo.userId
                });
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
            logger.debug('Auto-poll failed for order.', {
                orderId: orderInfo.orderId,
                error: message
            });
        }

        await new Promise((resolve) => setTimeout(resolve, OTP_POLL_INTERVAL_MS));
    }

    const current = activeOrders.get(orderInfo.orderId);
    if (current && !current.refunded) {
        logger.debug('OTP poll timed out without a message.', {
            orderId: orderInfo.orderId,
            userId: orderInfo.userId
        });
        await interaction.followUp({
            content: `No OTP yet for order ${orderInfo.orderId}. Use Refresh SMS button to check again or Refund to cancel.`,
            flags: EPHEMERAL_FLAGS
        });
    }
}

async function sendNumberMessage(interaction, phone) {
    if (!phone) return null;
    try {
        logger.trace('Sending copy-friendly phone follow-up.', {
            userId: interaction.user?.id || null
        });
        return await safeFollowUp(interaction, {
            content: formatCopyFriendly(phone),
            flags: EPHEMERAL_FLAGS
        });
    } catch (err) {
        logger.warn('Failed to send number follow-up.', err);
        return null;
    }
}

async function handleInteraction(interaction) {
    try {
        logger.trace('Routing interaction.', {
            type: interaction.isChatInputCommand() ? 'chat_input_command' : interaction.isStringSelectMenu() ? 'string_select_menu' : interaction.isButton() ? 'button' : 'other',
            userId: interaction.user?.id || null,
            commandName: interaction.commandName || null,
            customId: interaction.customId || null
        });

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
            logger.trace('Ignored expired interaction.', { customId: interaction.customId || null });
            return;
        }
        logger.error('Interaction handler error.', err);
    }
}

module.exports = {
    handleInteraction
};
