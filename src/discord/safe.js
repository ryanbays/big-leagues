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

module.exports = {
    isAlreadyAcknowledgedError,
    isUnknownInteractionError,
    safeReply,
    safeUpdate,
    safeFollowUp,
    safeEditReply,
    safeDeferReply
};
