const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = require('../env');
const { commands } = require('./commands');

async function registerCommands(options = {}) {
    const { clear = false } = options;

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    try {
        if (GUILD_ID) {
            try {
                if (clear) {
                    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
                    console.log('Cleared guild commands.');
                }

                await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
                console.log('Registered guild commands.');
                return;
            } catch (guildErr) {
                const code = guildErr && guildErr.code ? guildErr.code : null;
                if (code !== 50001) {
                    throw guildErr;
                }

                console.warn('Guild command registration failed with Missing Access; falling back to global commands.');
            }
        }

        if (clear) {
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
            console.log('Cleared global commands.');
        }

        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        if (GUILD_ID) {
            console.log('Registered global commands after guild fallback (may take up to an hour to propagate).');
        } else {
            console.log('Registered global commands (may take up to an hour to propagate).');
        }
    } catch (err) {
        console.error('Failed to register commands:', err);
    }
}

module.exports = {
    registerCommands
};
