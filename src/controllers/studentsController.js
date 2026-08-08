// src/controllers/studentsController.js
import createHttpError from 'http-errors';
import { Student } from '../models/student.js';

// Get list of all students
export const getStudents = async (req, res) => {
  const students = await Student.find();
  res.status(200).json(students);
};

// Get a single student by ID
export const getStudentById = async (req, res) => {
  const { studentId } = req.params;
  const student = await Student.findById(studentId);

  if (!student) {
    throw createHttpError(404, 'Student not found');
  }

  res.status(200).json(student);
};
