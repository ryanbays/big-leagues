const {
    OTP_TIMEOUT_MS,
    OTP_POLL_INTERVAL_MS,
    SERVICES,
    SELECT_PREFIX,
    GENERATE_PREFIX,
    REFRESH_PREFIX,
    REFUND_PREFIX,
    EPHEMERAL_FLAGS
} = require('../constants');

const { activeOrders } = require('../state');
const { isAllowedService, serviceLabelFromId } = require('../serviceUtils');
const { buySmsNumber, checkSms, cancelSms } = require('../smspool/client');
const { extractSmsText, isRefundSuccess } = require('../smspool/parsing');

const {
    panelHeader,
    panelComponents,
    orderActionComponents,
    orderMessage,
    formatCopyFriendly,
    formatRefundResponse
} = require('./ui');

const {
    safeReply,
    safeUpdate,
    safeFollowUp,
    safeEditReply,
    safeDeferReply,
    isUnknownInteractionError
} = require('./safe');

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

        const orderInfo = activeOrders.get(orderId);
        if (!orderInfo) {
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

        const orderInfo = activeOrders.get(orderId);
        if (!orderInfo) {
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
        await safeFollowUp(interaction, { content: `Purchase failed: ${msg}`, flags: EPHEMERAL_FLAGS });
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

async function handleInteraction(interaction) {
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
}

module.exports = {
    handleInteraction
};
