// src/models/student.js
import { Schema, model } from 'mongoose';

// Example Student schema
const studentSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    age: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const Student = model('Student', studentSchema);
