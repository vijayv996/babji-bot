import { EmbedBuilder } from 'discord.js';

async function dict(message) {
    const word = message.content.split(' ')[1].toLowerCase();
    let response = await fetch(`https://api.datamuse.com/words?sp=${word}&md=d&max=1`);
    let data = await response.json();
    if(data.length === 0) {
        await message.reply("failed to get the definition. Check typos maybe");
        return;
    }
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(data[0].word)
    data[0].defs.forEach((element, index) => {
        embed.addFields({ name: ``, value: `${index + 1}. ${element.replace(/n\t/, '')}` });
    });
    await message.channel.send({ embeds: [embed] });
}

export { dict };