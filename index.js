const { Client, GatewayIntentBits } = require('discord.js');
const mineflayer = require('mineflayer');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('🌐 VorstyAFK Worker Node Online 24/7!'));
app.listen(PORT, () => console.log(`🌐 Keep-alive server running on port ${PORT}`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const activeBots = new Map();

client.once('ready', () => {
    console.log(`🤖 AFK Worker Bot logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Syntax: $deploy <botName> <server_ip> [port]
    if (message.content.startsWith('$deploy')) {
        const args = message.content.split(/\s+/);
        const botName = args[1];
        const ip = args[2];
        const rawPort = args[3];

        if (!botName || !ip) {
            return message.reply('❌ Use syntax: `$deploy <botName> <server_ip> [port]`');
        }

        let port = null;
        if (rawPort && !isNaN(parseInt(rawPort))) {
            port = parseInt(rawPort);
        }

        if (activeBots.has(botName)) {
            const existing = activeBots.get(botName);
            if (existing && existing.instance) {
                existing.shouldReconnect = false;
                existing.instance.quit();
            }
            activeBots.delete(botName);
        }

        const displayEndpoint = port ? `${ip}:${port}` : ip;
        message.reply(`⚙️ Deploying worker node \`${botName}\` onto target \`${displayEndpoint}\`...`);
        
        launchMinecraftBot(botName, ip, port, message);
    }

    if (message.content.startsWith('$stopbot')) {
        const args = message.content.split(/\s+/);
        const botName = args[1];
        if (activeBots.has(botName)) {
            const botState = activeBots.get(botName);
            botState.shouldReconnect = false;
            if (botState.instance) {
                botState.instance.quit();
            }
            activeBots.delete(botName);
            return message.reply(`🛑 Bot node \`${botName}\` stopped and connection blocked.`);
        } else {
            return message.reply(`❌ No active bot found with name \`${botName}\`.`);
        }
    }
});

function launchMinecraftBot(botName, host, port, discordContext) {
    console.log(`📡 Connecting client ${botName} to ${host}:${port || 25565}`);

    const botPassword = `VorstyPass_${Math.floor(100 + Math.random() * 900)}`;

    const botOptions = {
        host: host,
        username: botName,
        auth: 'offline',
        viewDistance: 'tiny',
        checkTimeoutInterval: 60000 // Timeout badha diya hai taaki connection drop na ho
    };

    if (port) {
        botOptions.port = port;
    }

    const bot = mineflayer.createBot(botOptions);

    const botState = {
        instance: bot,
        moveLoop: null,
        jumpLoop: null,
        chatLoop: null,
        shouldReconnect: false
    };

    activeBots.set(botName, botState);

    bot.on('message', (jsonMsg) => {
        const chatMessage = jsonMsg.toString().toLowerCase();

        if (chatMessage.includes('register') || chatMessage.includes('/register') || chatMessage.includes('reg')) {
            setTimeout(() => {
                if (bot && bot.entity) {
                    bot.chat(`/register ${botPassword}${botPassword}`);
                    console.log(`🔑 [${botName}] Sent register command.`);
                }
            }, 1500);
        }

        if (chatMessage.includes('login') || chatMessage.includes('/login') || chatMessage.includes('log ')) {
            setTimeout(() => {
                if (bot && bot.entity) {
                    bot.chat(`/login ${botPassword}`);
                    console.log(`🔑 [${botName}] Sent login command.`);
                }
            }, 1500);
        }
    });

    bot.once('spawn', () => {
        const targetStr = port ? `${host}:${port}` : host;
        console.log(`[${botName}] Successfully spawned in game at${targetStr}`);
        discordContext.channel.send(`✅ Client \`${botName}\` successfully joined server \`${targetStr}\`!`);

        setTimeout(() => {
            if (bot && bot.entity) {
                bot.chat(`/register ${botPassword}${botPassword}`);
                bot.chat(`/login ${botPassword}`);
            }
        }, 2000);

        botState.moveLoop = setInterval(() => {
            if (!bot || !bot.entity) return;
            const randomYaw = (Math.random() * 360) * (Math.PI / 180);
            const randomPitch = ((Math.random() * 60) - 30) * (Math.PI / 180);
            bot.look(randomYaw, randomPitch, true);

            const directions = ['forward', 'back', 'left', 'right'];
            const chosenDir = directions[Math.floor(Math.random() * directions.length)];
            
            bot.setControlState(chosenDir, true);
            setTimeout(() => { if (bot && bot.entity) bot.setControlState(chosenDir, false); }, 3000);
        }, 4000);

        botState.jumpLoop = setInterval(() => {
            if (!bot || !bot.entity) return;
            bot.setControlState('jump', true);
            setTimeout(() => { if (bot && bot.entity) bot.setControlState('jump', false); }, 500);
        }, 11000);

        botState.chatLoop = setInterval(() => {
            if (!bot.entity) return;
            bot.chat("MADE BY - VORSTYAFK");
        }, 30 * 60000);
    });

    bot.on('death', () => {
        try { bot.respawn(); } catch (err) {}
    });

    bot.on('end', (reason) => {
        console.log(`🔌 [${botName}] Disconnected. Reason: ${reason}`);
        clearInterval(botState.moveLoop);
        clearInterval(botState.jumpLoop);
        clearInterval(botState.chatLoop);

        try {
            discordContext.channel.send(`⚠️ **Alert:** Bot node \`${botName}\` disconnected. Reason: \`${reason}\`.`);
        } catch (e) {}

        activeBots.delete(botName);
    });

    bot.on('error', (err) => {
        console.log(`[${botName}] Connection Error:${err.message}`);
        try {
            discordContext.channel.send(`❌ **Error Alert:** Bot node \`${botName}\` error: \`${err.message}\``);
        } catch (e) {}
    });
}

if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN);
} else {
    console.error("❌ DISCORD_TOKEN missing!");
}
