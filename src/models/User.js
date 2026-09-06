import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, maxlength: 254 },
  name: { type: String, required: true, minlength: 2, maxlength: 32 },
  passwordHash: { type: String, required: true, select: false },
  avatar: { type: String, default: null },
}, { timestamps: true, bufferCommands: false });

export const User = mongoose.model('User', schema);
