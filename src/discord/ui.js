const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const {
    UK_COUNTRY,
    SERVICE_OPTIONS,
    OPEN_SMS_PANEL_PREFIX,
    SMS_SELECT_PREFIX,
    SMS_GENERATE_PREFIX,
    OPEN_PROMO_PANEL_PREFIX,
    PROMO_SELECT_PREFIX,
    PROMO_FETCH_PREFIX,
    EMAIL_SELECT_PREFIX,
    EMAIL_CREATE_PREFIX,
    EMAIL_REFRESH_PREFIX,
    EMAIL_OTP_PREFIX,
    EMAIL_DELETE_PREFIX,
    REFRESH_PREFIX,
    REFUND_PREFIX
} = require('../constants');

const { serviceLabelFromId } = require('../serviceUtils');
const { isRefundSuccess, extractRefundMessage } = require('../smspool/parsing');

function smsPanelGeneratorHeader(maxPrice) {
    const lines = ['UK SMS Panel', 'Country: ' + UK_COUNTRY];

    if (maxPrice !== null && maxPrice !== undefined) {
        lines.push(`Max price: ${maxPrice}`);
    }

    lines.push('Press the button below to open your own panel.');
    return lines.join('\n');
}

function smsPanelGeneratorComponents(maxPrice) {
    const open = new ButtonBuilder()
        .setCustomId(`${OPEN_SMS_PANEL_PREFIX}|${maxPrice ?? ''}`)
        .setLabel('Open SMS Panel')
        .setStyle(ButtonStyle.Primary);

    return [new ActionRowBuilder().addComponents(open)];
}

function smsPanelHeader(serviceId, maxPrice) {
    const lines = ['Country: ' + UK_COUNTRY];

    if (maxPrice !== null && maxPrice !== undefined) {
        lines.push(`Max price: ${maxPrice}`);
    }

    lines.push('Press Generate after selecting service.');
    return lines.join('\n');
}

function smsPanelComponents(userId, selectedServiceId, maxPrice) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(`${SMS_SELECT_PREFIX}|${userId}|${maxPrice ?? ''}`)
        .setPlaceholder('Select service')
        .addOptions(
            SERVICE_OPTIONS.map((option) => ({
                ...option,
                default: option.value === selectedServiceId
            }))
        );

    const generate = new ButtonBuilder()
        .setCustomId(`${SMS_GENERATE_PREFIX}|${userId}|${selectedServiceId}|${maxPrice ?? ''}`)
        .setLabel('Generate')
        .setStyle(ButtonStyle.Success);

    return [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(generate)];
}

function promoPanelGeneratorHeader() {
    return ['Promo codes', 'Press the button below to open your own promo panel.'].join('\n');
}

function promoPanelGeneratorComponents() {
    const open = new ButtonBuilder()
        .setCustomId(OPEN_PROMO_PANEL_PREFIX)
        .setLabel('Open Promo Panel')
        .setStyle(ButtonStyle.Primary);

    return [new ActionRowBuilder().addComponents(open)];
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

function emailPanelHeader({ domain, inboxes, selectedInboxId }) {
    const total = Array.isArray(inboxes) ? inboxes.length : 0;
    const selected = total
        ? (inboxes.find((item) => String(item.inboxId) === String(selectedInboxId)) || inboxes[0])
        : null;

    const lines = [
        'Inbox emails',
        `Domain: ${domain}`,
        `Registered inboxes: ${total}`
    ];

    if (selected) {
        lines.push(`Selected: ${selected.email}`);
    }

    lines.push('Use New Email to register a fresh inbox, then Get Latest OTP.');
    return lines.join('\n');
}

function emailPanelComponents(userId, inboxes, selectedInboxId) {
    const normalized = Array.isArray(inboxes) ? inboxes : [];
    const selected = normalized.find((item) => String(item.inboxId) === String(selectedInboxId)) || normalized[0] || null;

    const rows = [];

    if (normalized.length > 0) {
        const options = normalized.slice(0, 25).map((item, index) => ({
            label: String(item.email).slice(0, 100),
            value: String(item.inboxId),
            description: `Inbox ${index + 1}`,
            default: selected ? String(item.inboxId) === String(selected.inboxId) : index === 0
        }));

        const select = new StringSelectMenuBuilder()
            .setCustomId(`${EMAIL_SELECT_PREFIX}|${userId}`)
            .setPlaceholder('Select a registered inbox')
            .addOptions(options);

        rows.push(new ActionRowBuilder().addComponents(select));
    }

    const create = new ButtonBuilder()
        .setCustomId(`${EMAIL_CREATE_PREFIX}|${userId}`)
        .setLabel('New Email')
        .setStyle(ButtonStyle.Success);

    const refresh = new ButtonBuilder()
        .setCustomId(`${EMAIL_REFRESH_PREFIX}|${userId}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary);

    const otp = new ButtonBuilder()
        .setCustomId(`${EMAIL_OTP_PREFIX}|${userId}|${selected ? selected.inboxId : ''}`)
        .setLabel('Get Latest OTP')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!selected);

    const remove = new ButtonBuilder()
        .setCustomId(`${EMAIL_DELETE_PREFIX}|${userId}|${selected ? selected.inboxId : ''}`)
        .setLabel('Delete Email')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!selected);

    rows.push(new ActionRowBuilder().addComponents(create, refresh, otp, remove));
    return rows;
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

// This formats for mobile (default)
function formatCopyFriendly(str) {
    return `\`${String(str)}\``;
}

// This formats for pc
function formatPCCopyFriendly(promoCode) {
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
    smsPanelGeneratorHeader,
    smsPanelGeneratorComponents,
    smsPanelHeader,
    smsPanelComponents,
    promoPanelGeneratorHeader,
    promoPanelGeneratorComponents,
    promoPanelHeader,
    promoPanelComponents,
    emailPanelHeader,
    emailPanelComponents,
    orderActionComponents,
    orderMessage,
    formatCopyFriendly,
    formatPCCopyFriendly,
    formatRefundResponse
};
