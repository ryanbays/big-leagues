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
    PROMO_SELECT_PREFIX,
    PROMO_FETCH_PREFIX,
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

function promoPanelHeader(serviceLabel) {
    const lines = ['Promo codes'];

    if (serviceLabel) {
        lines.push(`Selected service: ${serviceLabel}`);
    }

    lines.push('Select a service from the API list, then request a promo code.');
    return lines.join('\n');
}

function normalizePromoServiceOption(service, fallbackIndex) {
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
        service.serviceId ??
        service.service_id ??
        service.code ??
        service.key ??
        ''
    ).trim();

    if (!value) return null;

    const label = String(
        service.label ??
        service.name ??
        service.title ??
        value
    ).trim() || value;

    const descriptionRaw = service.description ?? service.desc ?? service.details ?? null;
    const description = descriptionRaw !== null && descriptionRaw !== undefined && String(descriptionRaw).trim()
        ? String(descriptionRaw).trim()
        : `Promo service ${fallbackIndex + 1}`;

    return {
        label,
        value,
        description
    };
}

function promoPanelComponents(userId, services, selectedServiceId) {
    const options = (services || [])
        .map((service, index) => normalizePromoServiceOption(service, index))
        .filter(Boolean);

    const selectedValue = selectedServiceId && options.some((option) => option.value === String(selectedServiceId))
        ? String(selectedServiceId)
        : options[0]?.value;

    const select = new StringSelectMenuBuilder()
        .setCustomId(`${PROMO_SELECT_PREFIX}|${userId}`)
        .setPlaceholder('Select promo service')
        .addOptions(
            options.map((option) => ({
                ...option,
                default: option.value === selectedValue
            }))
        );

    const fetchPromo = new ButtonBuilder()
        .setCustomId(`${PROMO_FETCH_PREFIX}|${userId}|${selectedValue ?? ''}`)
        .setLabel('Get Promo Code')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!selectedValue);

    return [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(fetchPromo)];
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

function formatPromoCopyFriendly(promoCode) {
    return `\`\`\`text\n${String(promoCode)}\n\`\`\``;
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
    promoPanelHeader,
    promoPanelComponents,
    orderActionComponents,
    orderMessage,
    formatCopyFriendly,
    formatPromoCopyFriendly,
    formatRefundResponse
};
