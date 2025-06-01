import { Attachment, EmbedBuilder } from 'discord.js';
import youtubedl from 'youtube-dl-exec';

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

async function instaDl(message, filePath) {
    const url = message.content.split(" ")[1];
    filePath += url.split("/")[4] + '.mp4';
    try {
        let promise = await youtubedl(url, { output: filePath });
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

export { dict, instaDl };