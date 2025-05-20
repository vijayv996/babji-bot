import { EmbedBuilder } from 'discord.js';
import exec from 'child_process';

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

// async function googleImage(message) {}

async function instaVid(message, filepath) {
    const url = message.content.split(' ')[1];
    filepath += `${url.split("/")[4]}.mp4`;
    exec(`yt-dlp ${url}  -o ${filepath}`, (err, output) => {
        if(err) {
            console.log("download failed", err);
            message.reply("download failed :cry:");
            return;
        }
        console.log(output);
    });
    message.reply("test", { files: [filepath] });
}


export { dict };