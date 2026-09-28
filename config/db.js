const mongoose = require('mongoose');

let lastConnectionError = null;

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    lastConnectionError = new Error('MONGODB_URI is not configured');
    console.warn(`[mongodb] ${lastConnectionError.message}`);
    return false;
  }

  try {
    await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME || 'verimatrix', serverSelectionTimeoutMS: 5000 });
    lastConnectionError = null;
    console.log(`[mongodb] connected to ${mongoose.connection.name}`);
    return true;
  } catch (error) {
    lastConnectionError = error;
    console.error(`[mongodb] connection failed: ${error.message}`);
    return false;
  }
}

function getDatabaseStatus() {
  return {
    configured: Boolean(process.env.MONGODB_URI),
    state: mongoose.connection.readyState,
    stateLabel: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
    error: lastConnectionError ? lastConnectionError.message : null
  };
}

module.exports = { connectDatabase, getDatabaseStatus };
