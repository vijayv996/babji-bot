import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { dict, instaDl, ytDl, streamMusic, streamHandler, stopMusic, skipSong, delMsg, genMsg, initGemini, webhookMsg, chat, wordCounter, avatar } from './utils/general-modules.js';
import { Client, GatewayIntentBits } from 'discord.js';
import { loadCsv, newAnagram, verifyAnagram, skipAnagram, anagramsScore, anagramsLeaderboard } from './games/anagrams.js';
import { newChain, verifyChain, wordChainScore, wordChainLeaderboard } from './games/word-chain.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

let systemInstruction;
const convo = [];

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
    loadCsv(process.env.CSV_PATH);
    initGemini(process.env.GEMINI_API_KEY);
    systemInstruction = process.env.SYSTEM_INSTRUCTION;
});

client.login(process.env.DISCORD_TOKEN);

client.on("interactionCreate", async (interaction) => { 
    
    if(!interaction.isCommand()) return;

    const { commandName } = interaction;

    if(commandName === "ping") {
        await interaction.reply("Pong!");
    }

    if(commandName === "fakehook") {
        webhookMsg(interaction);
    }

});

client.on("messageCreate", async (message) => {
     
    if(message.author.bot) {
        return;
    }

    wordCounter(message);

    if(message.content.startsWith(".av ")) {
        avatar(message);
        return;
    }

    if(message.content.startsWith(".chat")) {
        chat(message);
        return;
    }

    if(message.content.startsWith(".del") && message.author.id == process.env.ADMIN_ID) {
        delMsg(message);
        return;
    }
    
    if(message.content.startsWith(".dict")) {
        dict(message);
        return;
    }

    if(message.content.startsWith(".img")) {
        googleImage(message);
    }

    if(message.content.startsWith(".instadl")) {
        instaDl(message, process.env.INSTA_PATH, process.env.INSTA_COOKIES);
    }

    if(message.content.startsWith(".play")) {
        streamHandler(message);
    }

    if(message.content.startsWith(".fplay")) {
        streamMusic(message);
    }

    if(message.content.startsWith(".stop")) {
        stopMusic();
    }

    if(message.content.startsWith(".skipsong")) {
        skipSong(message);
    }

    if(message.content.startsWith(".ytdl")) {
        ytDl(message, process.env.INSTA_PATH, );
    }

    if (message.content === '.ping') {  
        message.channel.send(`🏓 API Latency is ${client.ws.ping}ms`);
        // message.channel.send(`Overall Latency is ${Date.now() - message.createdTimestamp}ms.`);
    }

    const interactiveChannels = process.env.INTERACTIVE_CHANNELS.split(',').map(channel => channel.trim());
    if(interactiveChannels.includes(message.channel.id)) {
        if(convo.length > 9) convo.shift();
        convo.push({
            role: 'user',
            parts: [{ text: message.member.displayName + ": " + message.content }],
        });
        if(message.mentions.has(client.user.id)) {
            if(bernoulliP(0.5)) {
                genMsg(message, systemInstruction, convo)
                return;
            }
        }
        if(bernoulliP(0.05)) {
            genMsg(message, systemInstruction, convo);
        }
    }
    
    const anagramChannels = process.env.ANAGRAM_CHANNELS.split(',').map(channel => channel.trim());
    if(anagramChannels.includes(message.channel.id)) {
        if(message.content.startsWith(".anagrams") && message.author.id == process.env.ADMIN_ID) {
            message.channel.send("Anagrams game started! The anagram");
            newAnagram(message);
            return;
        }

        if(message.content.startsWith(".skip")) {
            skipAnagram(message);
            return;
        }

        if(message.content.startsWith(".top") || message.content.startsWith(".lb")) {
            anagramsLeaderboard(message);
            return;
        }

        if(message.content.startsWith(".score")) {
            const values = await anagramsScore(message, false);
            message.reply(`Your score is ${values[0]} and your rank in the server is ${values[1]}`);
            return;
        }

        verifyAnagram(message);

    }

    const wordChainChannels = process.env.WORDCHAIN_CHANNELS.split(',').map(channel => channel.trim());
    if(wordChainChannels.includes(message.channel.id)) {
        if(message.content.startsWith(".chain")) {
            newChain(message);
            return;
        }

        if(message.content.startsWith('.score')) {
            const values = await wordChainScore(message);
            message.reply(`Your score is ${values[0]} and your rank in the server is ${values[1]}`);
            return;
        }

        if(message.content.startsWith(".top") || message.content.startsWith(".lb")) {
            wordChainLeaderboard(message);
            return;
        }

        verifyChain(message);
    }

});

function bernoulliP(p) {
    return Math.random() < p;
}