const { Client, GatewayIntentBits } = require('discord.js');
const mineflayer = require('mineflayer');
const express = require('express');

// ---- WEB SERVER (RENDER KEEP-ALIVE) ----
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('🌐 VorstyAFK Worker Node Online 24/7!'));
app.listen(PORT, () => console.log(`🌐 Keep-alive server running on port ${PORT}`));

// ---- DISCORD BOT SETUP ----
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

// ---- DISCORD COMMAND LISTENER ----
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Command Syntax: $deploy <botName> <server_ip> [port]
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

        // Clean up previous instance if running
        if (activeBots.has(botName)) {
            const existing = activeBots.get(botName);
            if (existing && existing.instance) {
                existing.shouldReconnect = false;
                try { existing.instance.quit(); } catch (e) {}
            }
            activeBots.delete(botName);
        }

        const displayEndpoint = port ? `${ip}:${port}` : ip;
        message.reply(`⚙️ Deploying worker node \`${botName}\` onto target \`${displayEndpoint}\`...`);
        
        launchMinecraftBot(botName, ip, port, message);
    }

    // Manual Stop Command: $stopbot <botName>
    if (message.content.startsWith('$stopbot')) {
        const args = message.content.split(/\s+/);
        const botName = args[1];
        if (activeBots.has(botName)) {
            const botState = activeBots.get(botName);
            botState.shouldReconnect = false;
            if (botState.instance) {
                try { botState.instance.quit(); } catch (e) {}
            }
            activeBots.delete(botName);
            return message.reply(`🛑 Bot node \`${botName}\` stopped and connection blocked.`);
        } else {
            return message.reply(`❌ No active bot found with name \`${botName}\`.`);
        }
    }
});

// ---- MINECRAFT AUTOMATION ENGINE ----
function launchMinecraftBot(botName, host, port, discordContext) {
    console.log(`📡 Connecting client ${botName} to ${host}:${port || 'default'}`);

    const botPassword = `VorstyPass_${Math.floor(100 + Math.random() * 900)}`;

    // Fixed Mineflayer Connection Options
    const botOptions = {
        host: host,
        username: botName,
        auth: 'offline',
        version: false, // Auto-detect server MC version (Fixes protocol mismatch)
        checkTimeoutInterval: 90000,
        viewDistance: 'tiny'
    };

    if (port) {
        botOptions.port = port;
    }

    let bot;
    try {
        bot = mineflayer.createBot(botOptions);
    } catch (err) {
        const errMsg = err.message || err.toString() || 'Unknown instantiation error';
        return discordContext.channel.send(`❌ **Launch Error:** Failed to create bot \`${botName}\`: \`${errMsg}\``);
    }

    const botState = {
        instance: bot,
        moveLoop: null,
        jumpLoop: null,
        chatLoop: null,
        shouldReconnect: false
    };

    activeBots.set(botName, botState);

    // Auto Register & Login
    bot.on('message', (jsonMsg) => {
        const chatMessage = jsonMsg.toString().toLowerCase();

        if (chatMessage.includes('register') || chatMessage.includes('/register') || chatMessage.includes('reg')) {
            setTimeout(() => {
                if (bot && bot.entity) {
                    bot.chat(`/register ${botPassword}${botPassword}`);
                }
            }, 1500);
        }

        if (chatMessage.includes('login') || chatMessage.includes('/login') || chatMessage.includes('log ')) {
            setTimeout(() => {
                if (bot && bot.entity) {
                    bot.chat(`/login ${botPassword}`);
                }
            }, 1500);
        }
    });

    bot.once('spawn', () => {
        const targetStr = port ? `${host}:${port}` : host;
        console.log(`[${botName}] Successfully joined${targetStr}`);
        discordContext.channel.send(`✅ Client \`${botName}\` successfully attached to \`${targetStr}\`!`);

        setTimeout(() => {
            if (bot && bot.entity) {
                bot.chat(`/register ${botPassword}${botPassword}`);
                bot.chat(`/login ${botPassword}`);
            }
        }, 2000);

        // Movement Loop
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

        // Jump Loop
        botState.jumpLoop = setInterval(() => {
            if (!bot || !bot.entity) return;
            bot.setControlState('jump', true);
            setTimeout(() => { if (bot && bot.entity) bot.setControlState('jump', false); }, 500);
        }, 11000);

        // Ad Message Loop
        botState.chatLoop = setInterval(() => {
            if (!bot || !bot.entity) return;
            bot.chat("MADE BY - VORSTYAFK");
        }, 30 * 60000);
    });

    bot.on('death', () => {
        try { bot.respawn(); } catch (err) {}
    });

    // Disconnect Handler
    bot.on('end', (reason) => {
        console.log(`🔌 [${botName}] Disconnected. Reason: ${reason}`);
        clearInterval(botState.moveLoop);
        clearInterval(botState.jumpLoop);
        clearInterval(botState.chatLoop);

        const cleanReason = reason || 'Server refused connection (socket closed)';
        try {
            discordContext.channel.send(`⚠️ **Alert:** Bot node \`${botName}\` disconnected. Reason: \`${cleanReason}\`.`);
        } catch (e) {}

        activeBots.delete(botName);
    });

    // Error Handler with proper error extraction
    bot.on('error', (err) => {
        const errorDetails = err?.message || err?.code || (typeof err === 'object' ? JSON.stringify(err) : String(err));
        console.log(`[${botName}] Error:${errorDetails}`);
        try {
            discordContext.channel.send(`❌ **Error Alert:** Bot node \`${botName}\` error: \`${errorDetails}\``);
        } catch (e) {}
    });
}

if (process.env.DISCORD_TOKEN) {
    client.login(process.env.DISCORD_TOKEN);
} else {
    console.error("❌ DISCORD_TOKEN missing!");
}
