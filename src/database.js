// database.js
import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://localhost:27017');
let isConnected = false;

const DB_NAMES = {
  ANAGRAMS: "anagramsDB",
  WORD_CHAIN: "wordChainDB"
};

async function connect() {
  if (!isConnected) {
    try {
      await client.connect();
      console.log("Connected to MongoDB");
      isConnected = true;
    } catch (error) {
      console.error("Error connecting to MongoDB:", error);
      throw error;
    }
  }
  return client;
}

function getDb(dbName) {
  if (!isConnected) {
    console.log("Database not connected. Call connect() first.");
  }
  return client.db(dbName);
}

async function close() {
  if (isConnected) {
    await client.close();
    isConnected = false;
    console.log("MongoDB connection closed");
  }
}

export { connect, getDb, close, DB_NAMES };