// src/db/connectMongoDB.js
import mongoose from 'mongoose';

// Establish connection with MongoDB
export const connectMongoDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }
    await mongoose.connect(uri);
    console.log('✅ Successfully connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    // Allow application to run even if DB connection fails during initial boilerplate testing
  }
};
