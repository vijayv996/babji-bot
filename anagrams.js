import { connect, getDb, DB_NAMES } from './database.js';
import { EmbedBuilder  } from 'discord.js';
import { readFile } from 'fs/promises';
import { parse } from 'csv-parse/sync';
import { isValidWord } from './word-chain.js';
import dotenv from 'dotenv';
dotenv.config();

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
    } catch (error) {
        console.error(error);
        csvInMemory = null;
    }
}

async function newAnagram(message) {
    const serverId = message.guild.id;
    if(!csvInMemory) return;
    const row = csvInMemory[Math.floor(Math.random() * csvInMemory.length)];
    console.log(row);

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

    message.channel.send({ embeds: [embed] });

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
        description = doc.Gloss
        footer = 'definition';
        timeoutMap.set(serverId, setTimeout(async () => {
            skip(message);
        }, 30000));
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
    message.channel.send({ embeds: [embed] });
    
}

async function skip(message) {
    const serverId = message.guild.id;
    const result = await anagramsDB.collection('anagrams').findOneAndUpdate(
        { serverId: serverId },
        {
            $set: {
                solved: true
            }
        }
    )
    await message.channel.send(`:hourglass: Time's up! The word was: ${result.originalWord}`);
    await new Promise(r => setTimeout(r, 3000));
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
            await message.reply(`You got 30 points for finding anagram but not exact answer. Think again`);
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
        await message.reply(`:tada: You got it right! You got ${wordScore} points!. Your score is now ${userScore}.`);
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
    let description = "5Heads on the server:\n\n";
    leaderboard.forEach((entry, index) => {
        description += `${index + 1}. <@!${entry.userId}>: ${entry.score}\n`;
    });

    const embed = new EmbedBuilder()
        .setTitle("Top 10 | Leaderboard")
        .setColor("#0099ff")
        .setDescription(description)
        .setFooter({ text: "Anagrams Game" });

    await message.channel.send({ embeds: [embed] });
}

export { loadCsv, newAnagram, verifyAnagram, anagramsScore, anagramsLeaderboard };