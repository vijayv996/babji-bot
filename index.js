import dotenv from 'dotenv';
dotenv.config();
import { dict } from './genaral-modules.js';
import { newAnagram, verifyAnagram, skip, hint, anagramsScore, anagramsLeaderboard } from './anagrams.js';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);

client.on("interactionCreate", async (interaction) => { 
    
    if(!interaction.isCommand()) return;

    const { commandName } = interaction;

    if(commandName === "ping") {
        await interaction.reply("Pong!");
    }

 });

client.on("messageCreate", async (message) => {

    if(message.author.bot) {
        return;
    }

    if(message.content.startsWith(".dict")) {
        dict(message);
        return;
    }

    const anagramChannels = process.env.ANAGRAM_CHANNELS.split(',').map(channel => channel.trim());

    if(anagramChannels.includes(message.channel.id)) {
        if(message.content.startsWith(".anagrams")) {
            message.channel.send("Anagrams game started! The anagram");
            newAnagram(message);
        }

        if(message.content.startsWith(".hint")) {
            hint(message);
        }
        
        if(message.content.startsWith(".skip")) {
            skip(message);
        }

        if(message.content.startsWith(".top") || message.content.startsWith(".lb")) {
            anagramsLeaderboard(message);
        }

        if(message.content.startsWith(".score")) {
            const values = await anagramsScore(message, false);
            message.reply(`Your score is ${values[0]} and your rank in the server is ${values[1]}`);
        }

        verifyAnagram(message);

    }
});