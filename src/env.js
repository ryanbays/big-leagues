require('dotenv').config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const SMSPOOL_API_KEY = process.env.SMSPOOL_API_KEY;

function assertRequiredEnv() {
    if (!DISCORD_TOKEN || !CLIENT_ID || !SMSPOOL_API_KEY) {
        console.error('Missing required env vars. See .env.example');
        process.exit(1);
    }
}

module.exports = {
    DISCORD_TOKEN,
    CLIENT_ID,
    GUILD_ID,
    SMSPOOL_API_KEY,
    assertRequiredEnv
};
