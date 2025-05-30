import { Attachment, EmbedBuilder } from 'discord.js';
import play from 'play-dl';
import { createAudioPlayer, createAudioResource, joinVoiceChannel, AudioPlayerStatus } from '@discordjs/voice';

// Queue system
const queues = new Map();

class MusicQueue {
    constructor() {
        this.songs = [];
        this.player = createAudioPlayer();
        this.connection = null;
        this.playing = false;
    }

    async addSong(song) {
        this.songs.push(song);
        if (!this.playing) {
            this.playing = true;
            await this.playNext();
        }
    }

    async playNext() {
        if (this.songs.length === 0) {
            this.playing = false;
            if (this.connection) {
                this.connection.destroy();
                this.connection = null;
            }
            return;
        }

        const song = this.songs[0];
        try {
            const stream = await play.stream(song.url);
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type
            });

            this.player.play(resource);
            song.message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('🎵 Now Playing')
                        .setDescription(`[${song.title}](${song.url})`)
                        .setThumbnail(song.thumbnail)
                ]
            });
        } catch (error) {
            console.error('Error playing song:', error);
            song.message.channel.send('Failed to play the song. Skipping to next...');
            this.songs.shift();
            this.playNext();
        }
    }
}

async function streamMusic(message) {
    // Check if user is in a voice channel
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
        await message.reply('You need to be in a voice channel to use this command!');
        return;
    }

    const url = message.content.split(' ')[1];
    if (!url) {
        await message.reply('Please provide a YouTube URL!');
        return;
    }

    try {
        // Validate the URL
        const videoInfo = await play.video_info(url);
        if (!videoInfo) {
            await message.reply('Invalid YouTube URL!');
            return;
        }

        // Get or create queue for this guild
        if (!queues.has(message.guild.id)) {
            queues.set(message.guild.id, new MusicQueue());
        }
        const queue = queues.get(message.guild.id);

        // Create song object
        const song = {
            url: url,
            title: videoInfo.video_details.title,
            thumbnail: videoInfo.video_details.thumbnails[0].url,
            message: message
        };

        // If not already playing, join voice channel
        if (!queue.connection) {
            queue.connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });
            queue.connection.subscribe(queue.player);

            // Handle player state changes
            queue.player.on(AudioPlayerStatus.Idle, () => {
                queue.songs.shift();
                queue.playNext();
            });
        }

        // Add song to queue
        await queue.addSong(song);

        // Send confirmation message
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎵 Added to Queue')
            .setDescription(`[${song.title}](${url})`)
            .setThumbnail(song.thumbnail)
            .setFooter({ text: `Position in queue: ${queue.songs.length}` });

        await message.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error playing music:', error);
        await message.reply('Failed to play the music. Please try again!');
    }
}

// Function to skip current song
async function skipMusic(message) {
    const queue = queues.get(message.guild.id);
    if (!queue || !queue.playing) {
        await message.reply('There is nothing playing to skip!');
        return;
    }

    queue.player.stop();
    await message.reply('⏭️ Skipped the current song!');
}

// Function to show current queue
async function showQueue(message) {
    const queue = queues.get(message.guild.id);
    if (!queue || queue.songs.length === 0) {
        await message.reply('The queue is empty!');
        return;
    }

    const queueList = queue.songs
        .map((song, index) => `${index + 1}. [${song.title}](${song.url})`)
        .join('\n');

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🎵 Music Queue')
        .setDescription(queueList)
        .setFooter({ text: `Total songs: ${queue.songs.length}` });

    await message.reply({ embeds: [embed] });
}

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

export { dict, streamMusic, skipMusic, showQueue };