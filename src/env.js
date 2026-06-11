require('dotenv').config();

const { createLogger } = require('./logger');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const SMSPOOL_API_KEY = process.env.SMSPOOL_API_KEY;
const PROMO_API_KEY = process.env.PROMO_API_KEY;

const logger = createLogger('env');

function assertRequiredEnv() {
    if (!DISCORD_TOKEN || !CLIENT_ID || !SMSPOOL_API_KEY) {
        logger.error('Missing required env vars. See example.env', {
            hasDiscordToken: Boolean(DISCORD_TOKEN),
            hasClientId: Boolean(CLIENT_ID),
            hasSmspoolApiKey: Boolean(SMSPOOL_API_KEY)
        });
        process.exit(1);
    }

    if (!PROMO_API_KEY) {
        logger.warn('PROMO_API_KEY is missing. Promo panel requests will fail until it is set.');
    }
}

module.exports = {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,
    SMSPOOL_API_KEY,
    PROMO_API_KEY,
    assertRequiredEnv
};
