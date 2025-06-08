import { Attachment, EmbedBuilder, VoiceChannel } from 'discord.js';
import youtubedl from 'youtube-dl-exec';
import { spawn } from 'child_process';
import { AudioPlayerStatus, createAudioPlayer, createAudioResource, joinVoiceChannel, StreamType } from '@discordjs/voice';
async function dict(message) {
    const word = message.content.split(' ')[1].toLowerCase();
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
        await message.reply({
            files: [{
                attachment: filePath
            }]
        });
    } catch(error) {
        console.log(error);
        message.reply("Download failed");
    }
}

async function streamMusic(message, cookies) {

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
            'cookies', cookies,
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
        console.log(error);
    }
}

async function streamMusicSimple(message) {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
        return message.reply('You need to be in a voice channel!');
    }

    const url = message.content.split(' ')[1];
    if (!url) {
        return message.reply('Please provide a YouTube URL!');
    }

    try {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
        });

        // Single command approach (similar to the FAQ example)
        const stream = spawn('yt-dlp', [
            '-o', '-',
            '--format', 'bestaudio',
            url
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        const audioResource = createAudioResource(stream.stdout, {
            inputType: StreamType.Arbitrary,
        });

        const player = createAudioPlayer();
        player.play(audioResource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Playing, () => {
            message.reply('🎵 Now playing!');
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


export { dict, instaDl, streamMusic, streamMusicSimple };