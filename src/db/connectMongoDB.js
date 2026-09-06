// src/db/connectMongoDB.js
import mongoose from 'mongoose';
import { setServers } from 'node:dns/promises';

// Establish connection with MongoDB
export const connectMongoDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }
  // Optional process-local DNS override for networks that cannot resolve Atlas SRV records.
  const dnsServers = process.env.MONGODB_DNS_SERVERS
    ?.split(',')
    .map((server) => server.trim())
    .filter(Boolean);
  if (dnsServers?.length) setServers(dnsServers);

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || 'believe_dev',
    serverSelectionTimeoutMS: 10000,
  });
};
