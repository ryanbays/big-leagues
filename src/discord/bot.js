const { Client, GatewayIntentBits, Events } = require('discord.js');

const { DISCORD_TOKEN, assertRequiredEnv } = require('../env');
const { createLogger } = require('../logger');
const { registerCommands } = require('./registerCommands');
const { handleInteraction } = require('./handlers');

const logger = createLogger('discord/bot');

function startBot() {
    assertRequiredEnv();

    logger.info('Creating Discord client.', {
        intents: ['Guilds', 'DirectMessages']
    });

    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
        partials: ['CHANNEL']
    });

    client.once(Events.ClientReady, async () => {
        logger.info('Discord client ready.', { userTag: client.user.tag, userId: client.user.id });
        await registerCommands();
    });

    client.on(Events.InteractionCreate, async (interaction) => {
        logger.trace('Interaction received.', {
            type: interaction.type,
            commandName: interaction.commandName || null,
            customId: interaction.customId || null,
            userId: interaction.user && interaction.user.id ? interaction.user.id : null
        });
        await handleInteraction(interaction);
    });

    client.on(Events.Error, (err) => {
        logger.error('Discord client error.', err);
    });

    process.on('unhandledRejection', (err) => {
        logger.error('Unhandled rejection.', err);
    });

    return client.login(DISCORD_TOKEN);
}

module.exports = {
    startBot
};
