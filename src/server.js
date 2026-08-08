// src/server.js
import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import { connectMongoDB } from './db/connectMongoDB.js';
import { logger } from './middleware/logger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import studentsRoutes from './routes/studentsRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Global middlewares
app.use(logger);
app.use(express.json());
app.use(cors());

// 2. Domain routes
app.use(studentsRoutes);

// 3. 404 and Error handling middlewares (must be at the end)
app.use(notFoundHandler);
app.use(errorHandler);

// Bootstrap server and database connection
const bootstrap = async () => {
  await connectMongoDB();
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
};

bootstrap();
