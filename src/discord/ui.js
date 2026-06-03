const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const {
    UK_COUNTRY,
    SERVICE_OPTIONS,
    SELECT_PREFIX,
    GENERATE_PREFIX,
    REFRESH_PREFIX,
    REFUND_PREFIX
} = require('../constants');

const { serviceLabelFromId } = require('../serviceUtils');
const { isRefundSuccess, extractRefundMessage } = require('../smspool/parsing');

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

function orderMessage(orderInfo) {
    const lines = [
        `Service: ${serviceLabelFromId(orderInfo.serviceId)}`,
        `Order ID: ${orderInfo.orderId}`,
        `Price: ${formatPrice(orderInfo.price)}`
    ];

    return lines.join('\n');
}

function formatCopyFriendly(phone) {
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

module.exports = {
    panelHeader,
    panelComponents,
    orderActionComponents,
    orderMessage,
    formatCopyFriendly,
    formatRefundResponse
};
