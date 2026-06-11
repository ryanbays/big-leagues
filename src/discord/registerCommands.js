const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = require('../env');
const { createLogger } = require('../logger');
const { commands } = require('./commands');

const logger = createLogger('discord/registerCommands');

async function registerCommands(options = {}) {
    const { clear = false } = options;

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    logger.info('Registering Discord commands.', {
        clear,
        guildId: GUILD_ID || null,
        commandCount: commands.length
    });

    try {
        if (GUILD_ID) {
            try {
                if (clear) {
                    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
                    logger.debug('Cleared guild commands.');
                }

                await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
                logger.info('Registered guild commands.', { guildId: GUILD_ID, commandCount: commands.length });
                return;
            } catch (guildErr) {
                const code = guildErr && guildErr.code ? guildErr.code : null;
                if (code !== 50001) {
                    throw guildErr;
                }

                logger.warn('Guild command registration failed with Missing Access; falling back to global commands.', guildErr);
            }
        }

        if (clear) {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
            logger.debug('Cleared global commands.');
        }

        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        if (GUILD_ID) {
            logger.info('Registered global commands after guild fallback.', { commandCount: commands.length });
        } else {
            logger.info('Registered global commands.', { commandCount: commands.length });
        }
    } catch (err) {
        logger.error('Failed to register commands.', err);
    }
}

module.exports = {
    registerCommands
};
