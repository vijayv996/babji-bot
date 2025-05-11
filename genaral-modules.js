import { EmbedBuilder } from 'discord.js';

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

export { dict };