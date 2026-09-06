// src/server.js
import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectMongoDB } from './db/connectMongoDB.js';
import { logger } from './middleware/logger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import { registerSocketHandlers } from './sockets/index.js';
import { authRouter, initializeAuth } from './auth/router.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(logger);
app.use('/auth/profile', express.json({ limit: '96kb' }));
app.use(express.json({ limit: '16kb' }));
app.use(cors());
app.use('/auth', authRouter);
app.use(notFoundHandler);
app.use(errorHandler);

// НОВЕ: HTTP-сервер поверх express, і Socket.io поверх нього
const httpServer = createServer(app);
// server.js
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3001', // порт Next.js
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log('🔌 Клієнт підключився:', socket.id);
  registerSocketHandlers(io, socket);
});

const bootstrap = async () => {
  const skipDb =
    process.env.SKIP_DB === 'true' || process.env.NODE_ENV === 'test';

  // Start the HTTP server right away so startup isn't blocked by DB
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });

  if (skipDb) {
    console.log('ℹ️ SKIP_DB is set — skipping MongoDB connection');
    return;
  }

  // Connect to MongoDB in background; don't block server startup
  connectMongoDB()
    .then(initializeAuth)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(() =>
      console.error(
        '❌ MongoDB unavailable. Check database credentials and Atlas network access. Guest games remain available.',
      ),
    );
};

bootstrap();
