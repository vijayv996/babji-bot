import { Attachment, EmbedBuilder } from 'discord.js';
import { YtDlp } from 'ytdlp-nodejs';
const ytdlp = new YtDlp();

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

// async function instaVid(message, filepath) {
//     const url = message.content.split(' ')[1];
//     filepath += `${url.split("/")[4]}.mp4`;
//     exec(`yt-dlp ${url}  -o ${filepath}`, (err, output) => {
//         if(err) {
//             console.log("download failed", err);
//             message.reply("download failed :cry:");
//             return;
//         }
//         console.log(output);
//     });
//     message.reply("test", { files: [filepath] });
// }

// async function instaVid(message) {
//     // const ytdlp = new YtDlp(); // here temporarily because its not used much
//     const url = message.content.split(" ")[1];
//     const id = url.split("/")[4];
//     try {
//         const file = await ytdlp.getFileAsync(
//             `${url}`,
//             {
//                 filename: `${id}.mp4`,
//                 onProgress: (progress) => {
//                     console.log(progress);
//                 },
//             }
//         );
//         const arrayBuffer = await file.arrayBuffer();
//         const buffer = Buffer.from(arrayBuffer);
//         console.log(file);
//         await message.reply({
//             content: "vid",
//             files: [{
//                 attachment: buffer,
//                 name: `${id}.mp4`
//             }]
//         });
//         } catch (error) {
//         console.error('Error:', error);
//     }
// }

async function streamMusic(message) {
    const url = message.content.split(" ")[1];
    const stream = ytdlp.stream(url, {
        format: {
            filter: 'audioonly',
        }
    });
}

export { dict, instaVid };