const { Client, GatewayIntentBits, Events } = require('discord.js');

const { DISCORD_TOKEN, assertRequiredEnv } = require('../env');
const { registerCommands } = require('./registerCommands');
const { handleInteraction } = require('./handlers');

function startBot() {
    assertRequiredEnv();

    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
        partials: ['CHANNEL']
    });

    client.once(Events.ClientReady, async () => {
        console.log(`Logged in as ${client.user.tag}`);
        await registerCommands();
    });

    client.on(Events.InteractionCreate, async (interaction) => {
        await handleInteraction(interaction);
    });

    client.on(Events.Error, (err) => {
        console.error('Discord client error:', err);
    });

    process.on('unhandledRejection', (err) => {
        console.error('Unhandled rejection:', err);
    });

    return client.login(DISCORD_TOKEN);
}

module.exports = {
    startBot
};
