import { MongoClient } from 'mongodb';
import { EmbedBuilder } from 'discord.js';
const dbName = "wordChainDB";
const client = new MongoClient("mongodb://localhost:27017");

async function connectDB() {
    try {
        await client.connect();
        console.log("Connected to WordChain database");
        return client.db(dbName);
    } catch (error) {
        console.error("Error connecting to database:", error);
    }
}

let db;
(async () => {
    db = await connectDB();
})

async function newChain() {
    await db.collection('wordChain').updateOne(
        { serverId: serverId },
        {
            $set: {
                lastLetter: 'a',
                lastUser: '123'
            }
        },
        { upsert: true }
    )
}

async function verifyChain(message) {

    if(message.content.startsWith('.chain')) {
        return;
    }

    if(message.connect.split(' ').length > 1) {
        return;
    }

    const serverId = message.guild.id;
    const msg = message.content.toLowerCase();

    const doc = await db.collection('wordChain').findOne({ serverId: serverId });
    if(doc.lastUser === message.author.id) {
        message.reply("It's not your turn. 2 points deducted");
        await updateWordChainLeaderboard(message, -2);
        return;
    }

    if(doc.lastLetter !== msg[0]) {
        message.reply(`2 points deducted. Next letter is ${doc.lastLetter}`);
        await updateWordChainLeaderboard(message, -2);
        return;
    }

    if(!await db.collection('wordChainWords').findOne({ serverId: serverId, word: msg })) {
        message.react('❌');
        message.channel.reply("word already used");
        return;
    }

    if(!await isValidWord(msg)) {
        message.react('❌');
        message.channel.reply("word doesn't exist");
        return;
    }

    let wordScore = evalScore(msg); 
    let react;
    if(wordScore == 4) {
        react = '4️⃣';
    } else if(wordScore == 6) {
        react = '6️⃣';
    } else if(wordScore == 8) {
        react = '8️⃣';
    }
    message.react(react);
    
    await db.collection('wordChain').updateOne(
        { serverId: serverId },
        {
            $set: {
                lastLetter: msg[msg.length - 1],
                lastUser: message.author.id
            }
        },
        { upsert: true }
    )

    await db.collection('wordChainWords').updateOne(
        { serverId: serverId, word: msg },
        {
            $set: {
                isUsed: true
            }
        },
        { upsert: true }
    )

    await updateWordChainLeaderboard(message, wordScore);

}

async function evalScore(word) {

    let score = 0;
    let len = word.length;
    if(len < 7) {
        score += 4;
    } else {
        score += 6;
    }
    if(word[0] === word[len - 1]) {
        score += 2;
    }
    return score;
    
}

async function isValidWord(word) {

    let word1;
    await fetch(`https://api.datamuse.com/words?sp=${word}&max=1`)
        .then(response => response.json())
        .then(data => word1 = data[0].word);

    return word1 === word;

}

async function updateWordChainLeaderboard(message, wordScore) {

    await db.collection('leaderboard').updateOne(
        {
            serverId: message.guild.id,
            userId: message.author.id
        },
        { 
            $inc: {
                score: wordScore
            }
        },
        { upsert: true }
    )

}

async function wordChainScore(message) {

    const serverId = message.guild.id;
    const userId = message.author.id;
    const userScore = doc.score;
    const higherScores = await db.collection('leaderboard').countDocuments({ 
        serverId: serverId, 
        score: { $gt: userScore }
    });

    return [userScore, higherScores + 1];

}

async function wordChainLeaderboard(message) {

    const serverId = message.guild.id;
    const leaderboard = await db.collection('leaderboard').find({ serverId: serverId }).sort({ score: -1 }).limit(10).toArray();
    const embed = new EmbedBuilder()
        .setTitle("Top 10 | Leaderboard")
        .setColor("#0099ff")
        .setFooter({ text: "Word Chain game" });

    leaderboard.forEach((entry, index) => {
        embed.addFields({ name: ``, value: `${index + 1}. <@!${entry.userId}>: ${entry.score}` });
    });

    await message.channel.send({ embeds: [embed] });

}

export { newChain, isValidWord, verifyChain, wordChainScore, wordChainLeaderboard };