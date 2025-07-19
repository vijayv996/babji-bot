import { connect, getDb, DB_NAMES } from './../utils/database.js';
import { EmbedBuilder  } from 'discord.js';
import { readFile } from 'fs/promises';
import { parse } from 'csv-parse/sync';
import { isValidWord } from './word-chain.js';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

(async () => {
    await connect();
    console.log('Anagrams module ready');
})();

let csvInMemory = null;
const timeoutMap = new Map();
const anagramsDB = getDb(DB_NAMES.ANAGRAMS);

async function loadCsv(filepath) {
    try {
        const content = await readFile(filepath);
        csvInMemory = parse(content, { columns: true });
        console.log("loaded csv into memory");
    } catch (e) {
        console.error("error sending message",e);
        csvInMemory = null;
    }
}

async function safeSend(channel, embed) {
    try {
        await channel.send({ embeds: [embed] });
    } catch(e) {
        console.error(e);
    }
}

async function newAnagram(message) {
    const serverId = message.guild.id;
    if(!csvInMemory) return;
    const row = csvInMemory[Math.floor(Math.random() * csvInMemory.length)];

    let scrambled = scramble(row.Word);
    await new Promise(r => setTimeout(r, 3000));
    await anagramsDB.collection('anagrams').updateOne(
        { serverId: serverId },
        { $set: {
            originalWord: row.Word,
            scrambledWord: scrambled,
            score: Number(row.Score),
            gloss: row.Gloss,
            hints: 3,
            solved: false
        }},
        { upsert: true }
    )
    
    const embed = new EmbedBuilder()
                .setColor('#009933')
                .setTitle(scrambled)
                .setDescription('new anagram');

    await safeSend(message.channel, embed);

    cancelTimeout(serverId);
    timeoutMap.set(serverId, setTimeout(async () => {
        hint(message);
    }, 60000));
    
}

const cancelTimeout = async (serverId) => {
    if(timeoutMap.has(serverId)) {
        clearTimeout(timeoutMap.get(serverId));
        timeoutMap.delete(serverId);
    }
}

function scramble(word) {
    let scrambled = word.split('').sort(() => Math.random() - 0.5).join('');
    if(scrambled === word) {
        return scramble(word);
    }
    return scrambled;   
}

async function hint(message) {

    let serverId = message.guild.id;
    let doc = await anagramsDB.collection('anagrams').findOne({ serverId: serverId });
    
    await anagramsDB.collection('anagrams').updateOne(
        { serverId: serverId },
        {
            $inc: {
                hints: -1
            }
        }
    )

    let w = doc.originalWord;
    let description, footer;
    if(doc.hints === 1) {
        description = doc.gloss
        footer = 'definition';
        timeoutMap.set(serverId, setTimeout(async () => {
            skipAnagram(message);
        }, 900000));
    }

    let s = doc.scrambledWord;
    s = s.replace(w[0], "");
    if(doc.hints === 3) {
        description = '**' + w[0] + '**' + s;
        footer = 'first letter hint';
        timeoutMap.set(serverId, setTimeout(async () => {
            hint(message);
        }, 60000));
    }

    if(doc.hints === 2) {
        s = s.replace(w[w.length - 1], "");
        description = '**' + w[0] + '**' + s + '**' + w[w.length - 1] + '**';
        await anagramsDB.collection('anagrams').updateOne(
            { serverId: serverId },
            {
                $set: {
                    scrambledWord: description
                }
            }
        )
        footer = 'last letter hint';
        timeoutMap.set(serverId, setTimeout(async () => {
            hint(message);
        }, 60000));
    }

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(doc.scrambledWord)
        .setDescription(description)
        .setFooter({ text: footer });
    await safeSend(message.channel, embed);

    if(doc.hints === 1) {
        try {
            message.channel.send(`Next anagrams in 15 minutes. You can answer or you can do ".skip" `);
        } catch(e) { console.error(e); }
    }
    
}

async function skipAnagram(message) {
    const serverId = message.guild.id;
    const result = await anagramsDB.collection('anagrams').findOneAndUpdate(
        { serverId: serverId },
        {
            $set: {
                solved: true
            }
        }
    )
    if(result.hints !== 0) return;
    cancelTimeout(serverId);
    try{
        await message.channel.send(`:hourglass: Time's up! The word was: ${result.originalWord}`);
    } catch(e) { console.error(e); }
    await new Promise(r => setTimeout(r, 10000));
    newAnagram(message);
}

async function verifyAnagram(message) {
    if(message.content.startsWith(".anagrams")) return;

    const serverId = message.guild.id;
    
    const doc = await anagramsDB.collection('anagrams').findOne({ serverId: serverId });
    const originalWord = doc.originalWord;
    
    const userMessage = message.content.toLowerCase();
    if(!doc.solved && userMessage !== originalWord && isValidAnagram(userMessage, originalWord)) {
        if(await isValidWord(userMessage)) {
            try {
                await message.reply(`You got 30 points for finding anagram but not exact answer. Think again`);
            } catch(e) { console.error(e); }
            await updateLeaderBoard(message, 30);
        }
        return;
    }

    if(originalWord !== userMessage) {
        return;
    }

    if(!doc.solved) {
        cancelTimeout(serverId);
        await anagramsDB.collection('anagrams').updateOne( { serverId: serverId }, { $set: { solvedAt: message.createdTimestamp } } );
    }

    const temp = await anagramsDB.collection('anagrams').findOne( { serverId: serverId } );
    if(message.createdTimestamp - temp.solvedAt < 1000)  {

        let wordScore = doc.score;
        if(doc.solved) {
            wordScore = Math.round((wordScore / 3) * 2);
        }
        
        await updateLeaderBoard(message, wordScore);
        await anagramsDB.collection('anagrams').updateOne( { serverId: serverId }, { $set: { solved: true } } );
        const userScore = await anagramsScore(message, true);
        try{
            await message.reply(`:tada: You got it right! You got ${wordScore} points!. Your score is now ${userScore}.`);
        } catch(e) { console.error(e); }
    }

    if(!doc.solved) {
        newAnagram(message);
    }

}

function isValidAnagram(userMessage, originalWord) {
    const sortedUsr = userMessage.split('').sort().join('');
    const sortedog = originalWord.split('').sort().join('');
    return sortedUsr === sortedog;
}


async function anagramsScore(message, onlyScore) {
    const serverId = message.guild.id;
    const userId = message.author.id;
    const doc = await anagramsDB.collection('leaderboard').findOne({ serverId: serverId, userId: userId });
    const userScore = doc.score;
    if(onlyScore) return userScore;
    const higherScores = await anagramsDB.collection('leaderboard').countDocuments({ 
        serverId: serverId, 
        score: { $gt: userScore }
    });

    return [userScore, higherScores + 1];
}

async function updateLeaderBoard(message, wordScore) {
    await anagramsDB.collection('leaderboard').updateOne(
        {
            serverId: message.guild.id,
            userId: message.author.id
        },
        {
            $inc: {
                score: wordScore
            }
        },
        {
            upsert: true
        }
    );
}

async function anagramsLeaderboard(message) {
    const serverId = message.guild.id;
    const leaderboard = await anagramsDB.collection('leaderboard').find({ serverId: serverId }).sort({ score: -1 }).limit(10).toArray();
    let description = "5Heads on the server:\n";
    leaderboard.forEach((entry, index) => {
        description += `${index + 1}. <@!${entry.userId}>: ${entry.score}\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle("Top 10 | Leaderboard")
        .setColor("#0099ff")
        .setDescription(description)
        .setFooter({ text: "Anagrams Game" });

    await safeSend(message.channel, embed);
}

export { loadCsv, newAnagram, verifyAnagram, skipAnagram, anagramsScore, anagramsLeaderboard };