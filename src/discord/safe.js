const { createLogger } = require('../logger');

const logger = createLogger('discord/safe');

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
            logger.trace('Reply skipped because interaction expired.', { customId: interaction.customId || null });
            return null;
        }
        if (isAlreadyAcknowledgedError(err)) {
            logger.trace('Reply skipped because interaction already acknowledged.', { customId: interaction.customId || null });
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
            logger.trace('Update skipped because interaction expired.', { customId: interaction.customId || null });
            return null;
        }
        if (isAlreadyAcknowledgedError(err)) {
            logger.trace('Update skipped because interaction already acknowledged.', { customId: interaction.customId || null });
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
            logger.trace('Follow-up skipped because interaction expired.', { customId: interaction.customId || null });
            return null;
        }
        if (isAlreadyAcknowledgedError(err)) {
            logger.trace('Follow-up skipped because interaction already acknowledged.', { customId: interaction.customId || null });
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
            logger.trace('Edit reply skipped because interaction expired.', { customId: interaction.customId || null });
            return null;
        }
        if (isAlreadyAcknowledgedError(err)) {
            logger.trace('Edit reply skipped because interaction already acknowledged.', { customId: interaction.customId || null });
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
            logger.trace('Defer skipped because interaction expired.', { customId: interaction.customId || null, err: err && err.message ? err.message : String(err) });
            return false;
        }
        if (isAlreadyAcknowledgedError(err)) {
            logger.trace('Defer skipped because interaction already acknowledged.', { customId: interaction.customId || null });
            return false;
        }
        throw err;
    }
}

async function safeDeferUpdate(interaction) {
    try {
        await interaction.deferUpdate();
        return true;
    } catch (err) {
        if (isUnknownInteractionError(err)) {
            logger.trace('Defer update skipped because interaction expired.', { customId: interaction.customId || null, err: err && err.message ? err.message : String(err) });
            return false;
        }
        if (isAlreadyAcknowledgedError(err)) {
            logger.trace('Defer update skipped because interaction already acknowledged.', { customId: interaction.customId || null });
            return false;
        }
        throw err;
    }
}

module.exports = {
    isAlreadyAcknowledgedError,
    isUnknownInteractionError,
    safeReply,
    safeUpdate,
    safeFollowUp,
    safeEditReply,
    safeDeferReply,
    safeDeferUpdate
};
