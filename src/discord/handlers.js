const {
    OTP_TIMEOUT_MS,
    OTP_POLL_INTERVAL_MS,
    SERVICES,
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
    REFUND_PREFIX,
    EPHEMERAL_FLAGS
} = require('../constants');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const { activeOrders } = require('../state');
const { createLogger } = require('../logger');
const { isAllowedService, serviceLabelFromId } = require('../serviceUtils');
const { buySmsNumber, checkSms, cancelSms } = require('../smspool/client');
const { extractSmsText, isRefundSuccess } = require('../smspool/parsing');
const { fetchPromoServices, fetchPromoCode } = require('./promo');
const { EMAIL_DOMAIN } = require('../env');

const {
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
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');

const { addOrder, removeOrder, listOrders } = require('../db/orders');
const { addUserInbox, listUserInboxes, removeUserInbox } = require('../db/inboxes');
const { addLogin, removeLogin, getLogin } = require('../db/fairfx');

const logger = createLogger('discord/handlers');
const assert = require('assert').strict;

const FAIRFX_OTP_BUTTON_PREFIX = 'fairfx_otp_enter';
const FAIRFX_OTP_MODAL_PREFIX = 'fairfx_otp_modal';
const FAIRFX_OTP_INPUT_ID = 'fairfx_otp_input';
const pendingFairFxLogins = new Map();

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

function sanitizeInboxBase(raw) {
    const value = String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24);

    return value || 'user';
}

function buildInboxId(base) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const clippedBase = String(base || 'user').slice(0, 30);
    return `${clippedBase}-${suffix}`;
}

function pickSelectedInbox(inboxes, selectedInboxId) {
    const list = Array.isArray(inboxes) ? inboxes : [];
    if (!list.length) return null;

    if (selectedInboxId) {
        const match = list.find((item) => String(item.inboxId) === String(selectedInboxId));
        if (match) return match;
    }

    return list[0];
}

function buildEmailPanelPayload({ userId, selectedInboxId, introText }) {
    const inboxes = listUserInboxes(userId);
    const selectedInbox = pickSelectedInbox(inboxes, selectedInboxId);

    const baseHeader = emailPanelHeader({
        domain: EMAIL_DOMAIN,
        inboxes,
        selectedInboxId: selectedInbox ? selectedInbox.inboxId : null
    });

    return {
        selectedInbox,
        inboxes,
        content: introText ? `${introText}\n\n${baseHeader}` : baseHeader,
        components: emailPanelComponents(userId, inboxes, selectedInbox ? selectedInbox.inboxId : null)
    };
}

function isConstraintError(err) {
    const msg = err && err.message ? err.message : String(err);
    return /SQLITE_CONSTRAINT/i.test(msg);
}

function createInboxForUser({ userId, userName, alias }) {
    const base = sanitizeInboxBase(alias || userName || userId);

    for (let attempt = 0; attempt < 10; attempt += 1) {
        const inboxId = buildInboxId(base);
        const email = `${inboxId}@${EMAIL_DOMAIN}`;

        try {
            addUserInbox({
                inboxId,
                userId,
                userName,
                email,
                createdAt: Date.now()
            });

            return { inboxId, email };
        } catch (err) {
            if (!isConstraintError(err)) {
                throw err;
            }
        }
    }

    throw new Error('Could not allocate a unique inbox id. Try again.');
}

function formatOtpResult(inboxRecord, otpPayload) {
    const email = inboxRecord && inboxRecord.email ? inboxRecord.email : 'unknown';
    const otp = otpPayload && typeof otpPayload === 'object' ? otpPayload.otp : null;

    if (!otp) {
        return `No OTP found yet for ${email}.`;
    }

    const from = otpPayload && otpPayload.from ? String(otpPayload.from) : null;
    const timestamp = otpPayload && otpPayload.timestamp ? Number(otpPayload.timestamp) : null;
    const lines = [
        `Latest OTP for ${email}:`,
        formatCopyFriendly(String(otp))
    ];

    if (from) {
        lines.push(`From: ${from}`);
    }

    if (Number.isFinite(timestamp)) {
        lines.push(`Received: ${new Date(timestamp * 1000).toLocaleString()}`);
    }

    return lines.join('\n');
}

function formatWorkerConsoleLog(logLines, maxChars = 900) {
    if (!Array.isArray(logLines) || logLines.length === 0) {
        return 'No worker console logs captured.';
    }

    const lines = [];
    let used = 0;

    for (let i = logLines.length - 1; i >= 0; i -= 1) {
        const line = String(logLines[i]);
        const nextLen = line.length + (lines.length ? 1 : 0);
        if (used + nextLen > maxChars) {
            break;
        }

        lines.unshift(line);
        used += nextLen;
    }

    return lines.join('\n');
}

/*
function withinRange(value, min, max) {
    if (min !== null && min !== undefined && Number.isFinite(min) && value < min) return false;
    if (max !== null && max !== undefined && Number.isFinite(max) && value > max) return false;
    return true;
}
*/

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

async function handlePingCommand(interaction) {
    await safeReply(interaction, { content: 'Pong!', flags: EPHEMERAL_FLAGS });
}

async function handleSmsPanelCommand(interaction) {
    const maxPrice = interaction.options.getNumber('maxprice');
    assert(maxPrice !== null && maxPrice !== undefined && Number.isFinite(maxPrice), 'Invalid maxprice input'); // should be guaranteed by command definition

    logger.trace('Posting SMS panel generator.', {
        userId: interaction.user.id,
        maxPrice
    });

    // Post a shared generator message. The admin's options (e.g. max price)
    // are baked into the button; each user who clicks it gets their own
    // ephemeral panel that inherits those options.
    await safeReply(interaction, {
        content: smsPanelGeneratorHeader(maxPrice),
        components: smsPanelGeneratorComponents(maxPrice)
    });
}

async function handlePromoPanelCommand(interaction) {
    logger.trace('Posting promo panel generator.', { userId: interaction.user.id });

    // Post a shared generator message; each user who clicks the button gets
    // their own ephemeral promo panel.
    await safeReply(interaction, {
        content: promoPanelGeneratorHeader(),
        components: promoPanelGeneratorComponents()
    });
}

async function handleNewEmailCommand(interaction) {
    const deferred = await safeDeferReply(interaction, { flags: EPHEMERAL_FLAGS });
    if (!deferred) {
        return;
    }

    const alias = interaction.options.getString('alias');

    let created;
    try {
        created = createInboxForUser({
            userId: interaction.user.id,
            userName: interaction.user?.username || interaction.user?.tag || interaction.user.id,
            alias
        });
    } catch (err) {
        await safeEditReply(interaction, {
            content: `Failed to create inbox email: ${err && err.message ? err.message : String(err)}`
        });
        return;
    }

    const panel = buildEmailPanelPayload({
        userId: interaction.user.id,
        selectedInboxId: created.inboxId,
        introText: `New inbox email created: ${formatCopyFriendly(created.email)}`
    });

    await safeEditReply(interaction, {
        content: panel.content,
        components: panel.components
    });
}

async function handleEmailPanelCommand(interaction) {
    const deferred = await safeDeferReply(interaction, { flags: EPHEMERAL_FLAGS });
    if (!deferred) {
        return;
    }

    const panel = buildEmailPanelPayload({ userId: interaction.user.id });

    await safeEditReply(interaction, {
        content: panel.content,
        components: panel.components
    });
}

async function handleBuyUkCommand(interaction) {
    const serviceId = interaction.options.getString('service', true);
    const maxPrice = interaction.options.getNumber('maxprice');

    const deferred = await safeDeferReply(interaction, { flags: EPHEMERAL_FLAGS });
    if (!deferred) {
        return;
    }

    await safeEditReply(interaction, {
        content: `Generating UK number for ${serviceLabelFromId(serviceId)} (${serviceId})...`
    });

    await generateSMSAndTrack(interaction, serviceId, maxPrice);
}

async function handleHistoryCommand(interaction) {
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
}

async function handleFairFXCommand(interaction) {
    const deferred = await safeDeferReply(interaction, { flags: EPHEMERAL_FLAGS });
    if (!deferred) return;

    const sub = interaction.options.getSubcommand(true);

    if (sub === "login") {
        const email = interaction.options.getString('email');
        const password = interaction.options.getString('password');
        const save = interaction.options.getBoolean('save') || false;
        if (!email || !password) {
            await safeEditReply(interaction, {
                content: 'Email and password are required for login.',
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        if (save) {
            addLogin({ userId: interaction.user.id, email, password });
        }

        await safeEditReply(interaction, {
            content: `${save ? `FairFX credentials saved for ${email}.` : `Using provided FairFX credentials for ${email}.`}\nStarting FairFX login process...`,
            flags: EPHEMERAL_FLAGS
        });

        const statesDir = path.resolve(__dirname, '../../data/states');
        fs.mkdirSync(statesDir, { recursive: true });

        const payload = {
            email,
            password,
            storagePath: path.join(statesDir, `fairfx_state_${interaction.user.id}.json`)
        };
        logger.trace('Starting FairFX worker thread.', { payload: { email, storagePath: payload.storagePath } });

        const workerPath = path.resolve(__dirname, '../fairfx/login.js');
        const worker = new Worker(workerPath, {
            stdout: true,
            stderr: true
        });

        const workerLogLines = [];
        const captureLogLine = (source, chunk) => {
            const text = String(chunk || '');
            for (const rawLine of text.split(/\r?\n/)) {
                const line = rawLine.trim();
                if (!line) continue;
                workerLogLines.push(`[${source}] ${line}`);
            }

            if (workerLogLines.length > 200) {
                workerLogLines.splice(0, workerLogLines.length - 200);
            }
        };

        if (worker.stdout) {
            worker.stdout.on('data', (chunk) => captureLogLine('stdout', chunk));
        }
        if (worker.stderr) {
            worker.stderr.on('data', (chunk) => captureLogLine('stderr', chunk));
        }

        // Helper: await a worker message that satisfies predicate (with timeout)
        const waitForWorkerMessage = (predicate, timeoutMs = OTP_TIMEOUT_MS) =>
            new Promise((resolve, reject) => {
                let timer;
                const onMessage = (msg) => {
                    try {
                        if (predicate(msg)) {
                            cleanup();
                            resolve(msg);
                        }
                    } catch (e) {
                        // ignore predicate errors
                    }
                };
                const onError = (err) => {
                    cleanup();
                    reject(err);
                };
                const onExit = (code) => {
                    cleanup();
                    reject(new Error(`Worker exited with code ${code}`));
                };
                const cleanup = () => {
                    worker.off('message', onMessage);
                    worker.off('error', onError);
                    worker.off('exit', onExit);
                    if (timer) clearTimeout(timer);
                };
                worker.on('message', onMessage);
                worker.on('error', onError);
                worker.on('exit', onExit);
                timer = setTimeout(() => {
                    cleanup();
                    reject(new Error('Timed out waiting for worker message'));
                }, timeoutMs);
            });

        logger.trace('FairFX login worker started, awaiting OTP request.', { userId: interaction.user.id });

        let handedOffToUserOtpEntry = false;

        try {
            worker.postMessage({ type: 'start', payload });

            const initialWorkerMessage = await waitForWorkerMessage(
                (m) => m && (m.type === 'otp_request' || m.type === 'error')
            );

            if (initialWorkerMessage.type === 'error') {
                const message = initialWorkerMessage.payload && initialWorkerMessage.payload.message
                    ? initialWorkerMessage.payload.message
                    : 'Worker failed before OTP request';
                throw new Error(message);
            }

            const existing = pendingFairFxLogins.get(interaction.user.id);
            if (existing) {
                try { existing.worker.terminate(); } catch (e) { /* ignore */ }
                if (existing.timeoutHandle) {
                    clearTimeout(existing.timeoutHandle);
                }
                pendingFairFxLogins.delete(interaction.user.id);
            }

            const resultPromise = waitForWorkerMessage((m) => m && (m.type === 'success' || m.type === 'error'))
                .then((result) => ({ ok: true, result }))
                .catch((error) => ({ ok: false, error }));
            const timeoutHandle = setTimeout(() => {
                const pending = pendingFairFxLogins.get(interaction.user.id);
                if (!pending) return;

                pendingFairFxLogins.delete(interaction.user.id);
                try { pending.worker.terminate(); } catch (e) { /* ignore */ }
            }, OTP_TIMEOUT_MS + 15_000);

            pendingFairFxLogins.set(interaction.user.id, {
                worker,
                resultPromise,
                workerLogLines,
                timeoutHandle
            });
            handedOffToUserOtpEntry = true;

            const otpButton = new ButtonBuilder()
                .setCustomId(`${FAIRFX_OTP_BUTTON_PREFIX}|${interaction.user.id}`)
                .setLabel('Enter FairFX OTP')
                .setStyle(ButtonStyle.Primary);

            await safeFollowUp(interaction, {
                content: 'FairFX sent the OTP to your phone. Click the button below to enter it privately.',
                components: [new ActionRowBuilder().addComponents(otpButton)],
                flags: EPHEMERAL_FLAGS
            });
        } catch (err) {
            logger.warn('FairFX worker communication failed.', { error: err && err.message ? err.message : String(err) });
            const logText = formatWorkerConsoleLog(workerLogLines);
            await safeFollowUp(interaction, {
                content: `FairFX login flow failed: ${err && err.message ? err.message : String(err)}\n\nWorker console log:\n${logText}`,
                flags: EPHEMERAL_FLAGS
            });
            try { worker.terminate(); } catch (e) { /* ignore */ }
        } finally {
            if (!handedOffToUserOtpEntry) {
                try { worker.terminate(); } catch (e) { /* ignore */ }
            }
        }
    }
}

const slashCommandHandlers = {
    ping: handlePingCommand,
    smspanel: handleSmsPanelCommand,
    promopanel: handlePromoPanelCommand,
    newemail: handleNewEmailCommand,
    emailpanel: handleEmailPanelCommand,
    buyuk: handleBuyUkCommand,
    history: handleHistoryCommand,
    fairfx: handleFairFXCommand,
};

async function handleSlashCommand(interaction) {
    logger.debug('Handling slash command.', {
        commandName: interaction.commandName,
        userId: interaction.user?.id || null
    });

    const handler = slashCommandHandlers[interaction.commandName];
    if (!handler) {
        logger.warn('No slash command handler registered.', {
            commandName: interaction.commandName,
            userId: interaction.user?.id || null
        });
        await safeReply(interaction, {
            content: `Unknown command: ${interaction.commandName}`,
            flags: EPHEMERAL_FLAGS
        });
        return;
    }

    await handler(interaction);
}

async function handleServiceSelect(interaction) {
    if (interaction.customId.startsWith(EMAIL_SELECT_PREFIX)) {
        const [, ownerId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
            await safeReply(interaction, { content: 'This panel belongs to another user.', flags: EPHEMERAL_FLAGS });
            return;
        }

        const selectedInboxId = interaction.values[0];
        const panel = buildEmailPanelPayload({
            userId: interaction.user.id,
            selectedInboxId
        });

        await safeUpdate(interaction, {
            content: panel.content,
            components: panel.components
        });
        return;
    }

    if (!interaction.customId.startsWith(SMS_SELECT_PREFIX)) {
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
        content: smsPanelHeader(serviceId, Number.isFinite(maxPrice) ? maxPrice : null),
        components: smsPanelComponents(interaction.user.id, serviceId, Number.isFinite(maxPrice) ? maxPrice : null)
    });
}

async function handleButton(interaction) {
    if (interaction.customId.startsWith(FAIRFX_OTP_BUTTON_PREFIX)) {
        const [, ownerId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
            await safeReply(interaction, { content: 'This OTP prompt belongs to another user.', flags: EPHEMERAL_FLAGS });
            return;
        }

        if (!pendingFairFxLogins.get(ownerId)) {
            await safeReply(interaction, { content: 'No pending FairFX login found. Start /fairfx login again.', flags: EPHEMERAL_FLAGS });
            return;
        }

        const otpInput = new TextInputBuilder()
            .setCustomId(FAIRFX_OTP_INPUT_ID)
            .setLabel('FairFX OTP code')
            .setPlaceholder('Enter 4-8 digits')
            .setRequired(true)
            .setStyle(TextInputStyle.Short)
            .setMinLength(4)
            .setMaxLength(8);

        const modal = new ModalBuilder()
            .setCustomId(`${FAIRFX_OTP_MODAL_PREFIX}|${ownerId}`)
            .setTitle('Enter FairFX OTP')
            .addComponents(new ActionRowBuilder().addComponents(otpInput));

        await interaction.showModal(modal);
        return;
    }

    if (interaction.customId.startsWith(EMAIL_CREATE_PREFIX)) {
        const [, ownerId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
            await safeReply(interaction, { content: 'This panel belongs to another user.', flags: EPHEMERAL_FLAGS });
            return;
        }

        let created;
        try {
            created = createInboxForUser({
                userId: interaction.user.id,
                userName: interaction.user?.username || interaction.user?.tag || interaction.user.id
            });
        } catch (err) {
            await safeReply(interaction, {
                content: `Failed to create inbox email: ${err && err.message ? err.message : String(err)}`,
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        const panel = buildEmailPanelPayload({
            userId: interaction.user.id,
            selectedInboxId: created.inboxId,
            introText: `New inbox email created: ${formatCopyFriendly(created.email)}`
        });

        await safeUpdate(interaction, {
            content: panel.content,
            components: panel.components
        });
        return;
    }

    if (interaction.customId.startsWith(EMAIL_REFRESH_PREFIX)) {
        const [, ownerId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
            await safeReply(interaction, { content: 'This panel belongs to another user.', flags: EPHEMERAL_FLAGS });
            return;
        }

        const panel = buildEmailPanelPayload({ userId: interaction.user.id });
        await safeUpdate(interaction, {
            content: panel.content,
            components: panel.components
        });
        return;
    }

    if (interaction.customId.startsWith(EMAIL_OTP_PREFIX)) {
        const [, ownerId, inboxId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
            await safeReply(interaction, { content: 'This panel belongs to another user.', flags: EPHEMERAL_FLAGS });
            return;
        }

        const inboxes = listUserInboxes(interaction.user.id);
        const selectedInbox = pickSelectedInbox(inboxes, inboxId);

        if (!selectedInbox) {
            await safeReply(interaction, {
                content: 'No inbox selected. Create one first using New Email.',
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        let otpPayload;
        try {
            otpPayload = await getOtp(selectedInbox.inboxId);
        } catch (err) {
            await safeReply(interaction, {
                content: `Failed to fetch OTP: ${err && err.message ? err.message : String(err)}`,
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        await safeReply(interaction, {
            content: formatOtpResult(selectedInbox, otpPayload),
            flags: EPHEMERAL_FLAGS
        });
        return;
    }

    if (interaction.customId.startsWith(EMAIL_DELETE_PREFIX)) {
        const [, ownerId, inboxId] = interaction.customId.split('|');

        if (interaction.user.id !== ownerId) {
            await safeReply(interaction, { content: 'This panel belongs to another user.', flags: EPHEMERAL_FLAGS });
            return;
        }

        const inboxes = listUserInboxes(interaction.user.id);
        const selectedInbox = pickSelectedInbox(inboxes, inboxId);

        if (!selectedInbox) {
            await safeReply(interaction, {
                content: 'No inbox selected to delete.',
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        const removed = removeUserInbox({
            userId: interaction.user.id,
            inboxId: selectedInbox.inboxId
        });

        const panel = buildEmailPanelPayload({
            userId: interaction.user.id,
            introText: removed
                ? `Deleted inbox email: ${formatCopyFriendly(selectedInbox.email)}`
                : `Could not delete inbox email: ${formatCopyFriendly(selectedInbox.email)}`
        });

        await safeUpdate(interaction, {
            content: panel.content,
            components: panel.components
        });
        return;
    }

    if (interaction.customId.startsWith(OPEN_SMS_PANEL_PREFIX)) {
        const [, maxPriceRaw] = interaction.customId.split('|');
        const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : null;
        const normalizedMaxPrice = Number.isFinite(maxPrice) ? maxPrice : null;
        const defaultServiceId = SERVICES.uberPostmates.id;

        logger.trace('Opening per-user SMS panel.', {
            userId: interaction.user.id,
            maxPrice: normalizedMaxPrice,
            defaultServiceId
        });

        // Spin up a private panel for the clicking user, inheriting the admin's
        // configured options. customIds carry this user's id so the panel is theirs.
        await safeReply(interaction, {
            content: smsPanelHeader(defaultServiceId, normalizedMaxPrice),
            components: smsPanelComponents(interaction.user.id, defaultServiceId, normalizedMaxPrice),
            flags: EPHEMERAL_FLAGS
        });
        return;
    }

    if (interaction.customId.startsWith(OPEN_PROMO_PANEL_PREFIX)) {
        logger.trace('Opening per-user promo panel.', { userId: interaction.user.id });

        const deferred = await safeDeferReply(interaction, { flags: EPHEMERAL_FLAGS });
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

    if (interaction.customId.startsWith(SMS_GENERATE_PREFIX)) {
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

        await generateSMSAndTrack(interaction, serviceId, Number.isFinite(maxPrice) ? maxPrice : null);
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
            ? formatCopyFriendly(promoCode)
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

async function handleModalSubmit(interaction) {
    if (!interaction.customId.startsWith(FAIRFX_OTP_MODAL_PREFIX)) {
        return;
    }

    const [, ownerId] = interaction.customId.split('|');

    if (interaction.user.id !== ownerId) {
        await safeReply(interaction, { content: 'This OTP prompt belongs to another user.', flags: EPHEMERAL_FLAGS });
        return;
    }

    const pending = pendingFairFxLogins.get(ownerId);
    if (!pending) {
        await safeReply(interaction, { content: 'No pending FairFX login found. Start /fairfx login again.', flags: EPHEMERAL_FLAGS });
        return;
    }

    const otp = String(interaction.fields.getTextInputValue(FAIRFX_OTP_INPUT_ID) || '').trim();
    if (!/^\d{4,8}$/.test(otp)) {
        await safeReply(interaction, { content: 'OTP looks invalid. Enter 4-8 digits only.', flags: EPHEMERAL_FLAGS });
        return;
    }

    const deferred = await safeDeferReply(interaction, { flags: EPHEMERAL_FLAGS });
    if (!deferred) {
        return;
    }

    pending.worker.postMessage({ type: 'otp', payload: { otp } });

    try {
        const outcome = await pending.resultPromise;
        const logText = formatWorkerConsoleLog(pending.workerLogLines);

        if (!outcome.ok) {
            await safeEditReply(interaction, {
                content: `FairFX login flow failed: ${outcome.error && outcome.error.message ? outcome.error.message : String(outcome.error)}\n\nWorker console log:\n${logText}`,
                flags: EPHEMERAL_FLAGS
            });
            return;
        }

        const result = outcome.result;

        if (result.type === 'success') {
            await safeEditReply(interaction, {
                content: `FairFX login successful.\n${result.payload && result.payload.message ? result.payload.message : ''}\n\nWorker console log:\n${logText}`,
                flags: EPHEMERAL_FLAGS
            });
        } else {
            await safeEditReply(interaction, {
                content: `FairFX login failed: ${result.payload && result.payload.message ? result.payload.message : 'Unknown error'}\n\nWorker console log:\n${logText}`,
                flags: EPHEMERAL_FLAGS
            });
        }
    } catch (err) {
        const logText = formatWorkerConsoleLog(pending.workerLogLines);
        await safeEditReply(interaction, {
            content: `FairFX login flow failed: ${err && err.message ? err.message : String(err)}\n\nWorker console log:\n${logText}`,
            flags: EPHEMERAL_FLAGS
        });
    } finally {
        if (pending.timeoutHandle) {
            clearTimeout(pending.timeoutHandle);
        }

        pendingFairFxLogins.delete(ownerId);
        try { pending.worker.terminate(); } catch (e) { /* ignore */ }
    }
}

async function generateSMSAndTrack(interaction, serviceId, maxPrice) {
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
            return;
        }

        if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction);
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
