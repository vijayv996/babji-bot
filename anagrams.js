import { connect, getDb, DB_NAMES } from './database.js';
import { EmbedBuilder  } from 'discord.js';
import { isValidWord } from './word-chain.js';

(async () => {
    await connect();
    console.log('Anagrams module ready');
})();

let timeoutId;

const anagramsDB = getDb(DB_NAMES.ANAGRAMS);

async function newAnagram(message) {
    const serverId = message.guild.id;
    let word;
    await fetch('https://random-word-api.vercel.app/api?words=1')
        .then(response => response.json())
        .then(data => word = data[0]);
    
    console.log(word);

    let scrambled = scramble(word);
    await new Promise(r => setTimeout(r, 3000));
    await anagramsDB.collection('anagrams').updateOne(
        { serverId: serverId },
        { $set: {
            originalWord: word,
            scrambledWord: scrambled,
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
    timeoutId = setTimeout(async () => {
        hint(message);
    }, 60000);
    
}

const cancelTimeout = async () => {
    clearTimeout(timeoutId);
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
        let def;
        try {
            await fetch(`https://api.datamuse.com/words?sp=${w}&md=d&max=1`)
                .then(response => response.json())
                .then(data => def = data[0].defs);
        } catch {
            console.log("something wrong");
        }
        description = def[0].replace(/n\t/,'');
        footer = 'definition';
        timeoutId = setTimeout(async () => {
            skip(message);
        }, 60000);
    }

    let s = doc.scrambledWord;
    s = s.replace(w[0], "");
    if(doc.hints === 3) {
        description = '**' + w[0] + '**' + s;
        footer = 'first letter hint';
        timeoutId = setTimeout(async () => {
            hint(message);
        }, 60000);
    }

    if(doc.hints === 2) {
        s = s.replace(w[w.length - 1], "");
        description = '**' + w[0] + '**' + s + '**' + w[w.length - 1] + '**';
        footer = 'last letter hint';
        timeoutId = setTimeout(async () => {
            hint(message);
        }, 60000);
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
    const result = await anagramsDB.collection('anagrams').findOne({ serverId: serverId })
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
    if(!doc.solved && userMessage !== originalWord) {
        if(await isValidWord(userMessage)) {
            await message.reply(`You got 20 points for finding anagram but not exact answer. Think again`);
            await updateLeaderBoard(message, 30);
        }
        return;
    }

    if(originalWord !== userMessage) {
        return;
    }

    if(!doc.solved) {
        cancelTimeout();
        await anagramsDB.collection('anagrams').updateOne( { serverId: serverId }, { $set: { solvedAt: message.createdTimestamp } } );
    }

    const temp = await anagramsDB.collection('anagrams').findOne( { serverId: serverId } );
    if(message.createdTimestamp - temp.solvedAt < 1000)  {

        let wordScore = evalScore(originalWord);
        if(doc.solved) {
            wordScore = (wordScore / 3) * 2;
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

function evalScore(word) {

    if (!word) return 0;

    // 1. Score based on length
    const lengthScore = word.length * 10;

    // 2. Letter frequency in English (rarer letters give higher scores)
    const letterFrequency = {
        e: 12.0, t: 9.1, a: 8.1, o: 7.7, i: 7.0, n: 6.7, s: 6.3, 
        h: 6.1, r: 6.0, d: 4.3, l: 4.0, u: 2.8, c: 2.8, m: 2.4, 
        w: 2.4, f: 2.2, g: 2.0, y: 2.0, p: 1.9, b: 1.5, v: 0.98, 
        k: 0.77, j: 0.15, x: 0.15, q: 0.095, z: 0.074
    };

    let difficultyScore = 0;
    const uniqueLetters = new Set(word);

    for (let letter of uniqueLetters) {
        if (letterFrequency.hasOwnProperty(letter)) {
            difficultyScore += (13 - Math.min(13, letterFrequency[letter]));
        } else {
            difficultyScore += 5; // For non-alphabetic characters or unknown letters
        }
    }

    // 3. Consider letter repetitions
    const letterCounts = {};
    for (let letter of word) {
        letterCounts[letter] = (letterCounts[letter] || 0) + 1;
    }

    let repetitionFactor = 0;
    for (let count of Object.values(letterCounts)) {
        repetitionFactor += count - 1;
    }

    const repetitionPenalty = Math.max(0, 5 - repetitionFactor);

    // 4. Vowel-consonant ratio
    const vowelsSet = new Set(['a', 'e', 'i', 'o', 'u']);
    let vowels = 0;
    for (let letter of word) {
        if (vowelsSet.has(letter)) vowels++;
    }

    const consonants = word.length - vowels;
    let balanceFactor = 1;

    if (vowels === 0 || consonants === 0) {
        balanceFactor = 1.5;
    } else if (Math.min(vowels, consonants) / Math.max(vowels, consonants) < 0.25) {
        balanceFactor = 1.3;
    }

    // 5. Final score calculation
    const finalScore = (lengthScore + difficultyScore + repetitionPenalty) * balanceFactor;
    return (Math.round(finalScore * 10) / 10 | 0);
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
    const embed = new EmbedBuilder()
        .setTitle("Top 10 | Leaderboard")
        .setColor("#0099ff")
        .setDescription("5Heads on the server")
        .setFooter({ text: "Anagrams Game" });

    leaderboard.forEach((entry, index) => {
        embed.addFields({ name: ``, value: `${index + 1}. <@!${entry.userId}>: ${entry.score}` });
    });

    await message.channel.send({ embeds: [embed] });
}

export { newAnagram, verifyAnagram, skip, hint, anagramsScore, anagramsLeaderboard };