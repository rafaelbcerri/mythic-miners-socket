/* eslint-disable no-multi-assign */
/* eslint-disable no-var */
/* eslint-disable vars-on-top */
/* eslint-disable @typescript-eslint/no-explicit-any */

import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';

// Load environment variables from .env.local first, then .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const uri = process.env.MONGODB_URI;
console.log('uri', uri);

declare global {
  var mongoose: any; // This must be a `var` and not a `let / const`
}

let cached = global.mongoose;

if (!cached) {
  console.log('cached', cached);
  cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect(params = {}) {
  if (cached.conn) {
    return params;
  }
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      dbName: 'MythicMiners',
      maxIdleTimeMS: 15000,
      autoIndex: false, // Disable automatic index creation
    };
    cached.promise = mongoose.connect(uri!, opts);
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return params;
}

// mongoose.set('debug', true); // Uncomment for debugging, but it creates a lot of noise

export default dbConnect;
