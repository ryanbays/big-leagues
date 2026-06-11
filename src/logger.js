'use strict';

const util = require('util');

const LEVELS = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    silent: 60
};

const LEVEL_NAMES = Object.keys(LEVELS);
const DEFAULT_LEVEL = 'debug';

function getConfiguredLevel() {
    const raw = String(process.env.LOG_LEVEL || DEFAULT_LEVEL).trim().toLowerCase();
    return LEVELS[raw] !== undefined ? raw : DEFAULT_LEVEL;
}

function createLogger(scope) {
    const threshold = LEVELS[getConfiguredLevel()];

    function shouldLog(level) {
        return LEVELS[level] >= threshold;
    }

    function emit(level, message, meta) {
        if (!shouldLog(level)) {
            return;
        }

        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]${scope ? ` [${scope}]` : ''}`;
        const parts = [prefix, formatMessage(message)];

        if (meta !== undefined) {
            parts.push(formatMeta(meta));
        }

        const line = parts.filter(Boolean).join(' ');

        if (level === 'error') {
            console.error(line);
            return;
        }

        if (level === 'warn') {
            console.warn(line);
            return;
        }

        console.log(line);
    }

    return {
        level: getConfiguredLevel(),
        trace(message, meta) {
            emit('trace', message, meta);
        },
        debug(message, meta) {
            emit('debug', message, meta);
        },
        info(message, meta) {
            emit('info', message, meta);
        },
        warn(message, meta) {
            emit('warn', message, meta);
        },
        error(message, meta) {
            emit('error', message, meta);
        }
    };
}

function formatMessage(message) {
    if (message instanceof Error) {
        return message.stack || message.message || String(message);
    }

    if (typeof message === 'string') {
        return message;
    }

    return util.inspect(message, { depth: 4, breakLength: 120, colors: false });
}

function formatMeta(meta) {
    if (meta instanceof Error) {
        return meta.stack || meta.message || String(meta);
    }

    if (typeof meta === 'string') {
        return meta;
    }

    return util.inspect(meta, { depth: 4, breakLength: 120, colors: false });
}

module.exports = {
    LEVELS,
    LEVEL_NAMES,
    createLogger,
    getConfiguredLevel
};