// src/routes/studentsRoutes.js
import { Router } from 'express';
import {
  getStudents,
  getStudentById,
}} from '../controllers/studentsController.js';

const router = Router();

// Define students endpoints
router.get('/students', getStudents);
router.get('/students/:studentId', getStudentById);

export default router;
