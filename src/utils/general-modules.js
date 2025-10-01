import { Attachment, Embed, EmbedBuilder, VoiceChannel } from 'discord.js';
import youtubedl from 'youtube-dl-exec';
import { spawn } from 'child_process';
import { getDb, DB_NAMES } from './../utils/database.js';
import { AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, StreamType } from '@discordjs/voice';
import { GoogleGenAI } from '@google/genai';
let ai;
async function dict(message) {
    const word = message.content.split(' ')[1].toLowerCase();
    try {
        let response = await fetch(`https://api.datamuse.com/words?sp=${word}&md=d&max=1`);
        let data = await response.json();
        if(data.length === 0) {
            await message.reply("failed to get the definition. Check typos maybe");
            return;
        }
        const definitions = data[0].defs
            .map((def, i) => `${i + 1}. ${def.replace(/^[a-z]\t/, '')}`)
            .join('\n');
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(data[0].word)
            .setDescription(definitions);
        
        await message.channel.send({ embeds: [embed] });
    } catch(e) { console.error("error", e); }    
}

async function instaDl(message, filePath, cookies) {
    const url = message.content.split(" ")[1];
    filePath += url.split("/")[4] + '.mp4';
    try {
        let promise = await youtubedl(url, { 
            output: filePath,
            cookies: cookies
        });
        console.log(promise);
        await message.channel.send({
            files: [{
                attachment: filePath
            }]
        });
    } catch(error) {
        console.error(error);
        message.reply("Download failed");
    }
}

async function ytDl(message, filePath) {
    const url = message.content.split(" ")[1];
    if(url.split("/").length < 5) {
        filePath += url.split("/")[3].split("_")[1];
    } else {
        filePath += url.split("/")[4];
    }
    try {
        let promise = await youtubedl(url, { 
            output: filePath
        });
        console.log(promise);
        await message.reply({
            files: [{
                attachment: filePath + '.webm'
            }]
        });
    } catch(error) {
        console.error(error);
        if(error instanceof DOMException && error.name === 'AbortError') {
            message.reply("File size is too large for discord");
            return;
        }
        message.reply("Download failed");
    }
}

async function streamMusic(message) {

    if(!message.member?.voice.channel) {
        await message.reply('join a voice channel first');
        return;
    }
    
    const url = message.content.split(" ")[1];

    try {
        const connection = joinVoiceChannel({
            channelId: message.member.voice.channel.id,
            guildId: message.guildId,
            adapterCreator: message.guild.voiceAdapterCreator,
        });

        const ytdlp = spawn('yt-dlp', [
            '-o', '-', 
            '--format', 'bestaudio/best',
            url
        ]);

        const ffmpeg = spawn('ffmpeg', [
            '-i', 'pipe:0',
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            'pipe:1'
        ], { stdio: ['pipe', 'pipe', 'ignore'] });

        ytdlp.stdout.pipe(ffmpeg.stdin);

        const resource = createAudioResource(ffmpeg.stdout, {
            inputType: StreamType.Raw
        });

        const player = createAudioPlayer();
        player.on(AudioPlayerStatus.Playing, () => {
            console.log("Audio is now playing");
        });

        connection.subscribe(player);
        player.play(resource);

    } catch(error) {
        console.error(error);
    }
}

let player = null;
let connection = null;
let queue = [];

async function streamHandler(message) {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
        return message.reply('You need to be in a voice channel!');
    }

    const url = message.content.split(' ')[1];
    if (!url) {
        return message.reply('Please provide a YouTube URL!');
    }

    try {
        if(!connection) {
                connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });
        }

        if(!player) {
            player = createAudioPlayer();
        }

        if(player.state.status === AudioPlayerStatus.Playing) {
            queue.push(url);
            message.channel.send("🎵 Added to queue!");
        } else {
            playMusic(url);
        }

        player.on(AudioPlayerStatus.Playing, () => {
            message.channel.send('🎵 Now playing!');
            // ideally display the song name
        });

        player.on(AudioPlayerStatus.Idle, () => {
            message.reply('🎵 Finished playing!');
            const url = queue.shift();
            if(url) {
                playMusic(url);
            } else {
                message.channel.send('🎵 Queue is empty!');
            }
        });

        player.on('error', (error) => {
            console.error(error);
            message.reply('❌ Playback error occurred.');
        });

    } catch (error) {
        console.error(error);
        message.reply('❌ Failed to stream music.');
    }
}

function skipSong() {
    player.stop();
    const url = queue.shift();
    if(url) {
        playMusic(url);
    }
}

function playMusic(url) {
    const stream = spawn('yt-dlp', [
        '-o', '-',
        '--format', 'bestaudio',
        url
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const audioResource = createAudioResource(stream.stdout, {
        inputType: StreamType.Arbitrary,
    });
    
    player.play(audioResource);
    connection.subscribe(player);
}

function stopMusic() {
    player.stop();
    connection.destroy();
    player = null;
    connection = null;
}

function initGemini(key) {
    ai = new GoogleGenAI({key: key});
    console.log("gemini AI initialized");
}

async function delMsg(message) {
    if(!message.reference) {
        console.log("message is not a reply. reply to something to delete");
        return;
    }
    if(!message.deletable) {
        console.log(`cannot delete. no permission in ${message.guild.name}`);
        return;
    }
    try {
        const repliedMessage = await message.fetchReference();
        repliedMessage.delete();
        message.delete();
        console.log("messages deleted.");
    } catch (e) {
        console.log("error deleteing messages:", e);
    }
}

async function genMsg(message, systemInstruction, convo) {
    await message.channel.sendTyping();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: convo,
            config: {
                systemInstruction: systemInstruction
            },
        });
        await message.reply(response.text);
    } catch(e) { console.error("generation failed." + e)}
}

async function chat(message) {
    await message.channel.sendTyping();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message.content.split(".chat")[1],
            config: {
                systemInstruction: "answer must be less than 2000 characters" // discord message limit
            }
        });
        await message.reply(response.text);
    } catch(e) { console.error("generation failed." + e)}   
}

async function tldr(currentMessage) {
    if (!currentMessage.reference) {
        await currentMessage.reply("You need to reply to a message to summarize.");
        return;
    }

    try {
        const repliedMessage = await currentMessage.fetchReference();

        // Fetch messages after the replied message up to the current message
        const messages = await currentMessage.channel.messages.fetch({
            after: repliedMessage.id,
            before: currentMessage.id,
            limit: 10 // Adjust limit as needed
        });

        // Sort messages by creation time (oldest first)
        const sortedMessages = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        // Collect content, skipping the replied message itself
        const conversation = sortedMessages.map(m => `${m.author.username}: ${m.content}`).join('\n');

        if (!conversation.trim()) {
            await currentMessage.reply("No messages to summarize after the replied message.");
            return;
        }

        await currentMessage.channel.sendTyping();

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Summarize the following conversation:\n${conversation}`,
            config: {
                systemInstruction: "Provide a concise TLDR summary in under 2000 characters, focusing on key points and flow."
            }
        });

        await currentMessage.reply(response.text);
    } catch (e) {
        console.error("Error in tldr:", e);
        await currentMessage.reply("Failed to generate summary.");
    }
}

async function webhookMsg(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });
        const targetMember = interaction.options.getMember('user');
        const webhooks = await interaction.channel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.name === 'babjiWebhook');

        if (!webhook) {
            webhook = await interaction.channel.createWebhook({
                name: 'babjiWebhook',
            });
        }

        await webhook.send({
            content: interaction.options.getString('message'),
            username: targetMember.displayName,
            avatarURL: targetMember.displayAvatarURL(),
        });
        await interaction.editReply({ content: 'Message sent successfully!' });
    } catch (e) {
        await interaction.editReply({ content: 'Failed to send message.' });
        console.error("error executing webhook command:", e);
    }
}

const wordCounterDB = getDb(DB_NAMES.WORD_COUNTER);
const regexWord = /\b(?:n(?:[iIl!1|][gG9ğqQ]{2,}(?:[aA@4ä^]|[eE3ë]r?)|ihha|igha|iqqa))(?:\s*-\s*[aA@4ä^])?\b/i;

async function wordCounter(message) {
    if(!regexWord.test(message.content.toLowerCase())) return;
    const doc = await wordCounterDB.collection('count').findOne({ userId: message.author.id });
    if(message.createdTimestamp - doc.time <= 5000) return;
    console.log('pass');
    
    await wordCounterDB.collection('count').updateOne(
        { userId: message.author.id },
        {
            $set: {
                username: message.member.displayName,
                time: message.createdTimestamp
            },
            $inc: {
                score: 1,
            }
        },
        { upsert: true }
    );

    if(Math.random() < 0.1) {
        try {
            await message.reply(`${doc.username} used n word ${doc.score + 1} times`);
        } catch(e) { console.error(e); }
    }
}

async function nBoard(message) {
    const leaderboard = await wordCounterDB.collection('count').find().sort({ score: -1 }).limit(10).toArray();
    let description = "";
    leaderboard.forEach((entry, index) => {
        description += `${index + 1}. <@!${entry.userId}>: ${entry.score}\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle("Top 10")
        .setColor("#000000")
        .setDescription(description)
        .setFooter({ text: "The nihhaboard" });
    try {
        await message.reply({ embeds: [embed] });
    } catch(e) { console.log(e) }
}

async function avatar(message) {
    let user;
    if(message.mentions.users.size > 0) {
        user = message.mentions.users.first();
    } else {
        await message.reply("mention someone");
    }
    const avatarURL = user.displayAvatarURL({ dynamic: true, format: 'png', size: 256 });
    const embed = new EmbedBuilder().setColor(0x000000).setTitle(`${user.username}'s Avatar`).setURL(avatarURL).setImage(avatarURL);
    try {
        await message.reply({ embeds: [embed] });
    } catch(e) { console.log(e) }
}

export { dict, instaDl, ytDl, streamMusic, streamHandler, stopMusic, skipSong, delMsg, genMsg, initGemini, webhookMsg, chat, tldr, wordCounter, avatar, nBoard };
