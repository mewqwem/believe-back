// src/middleware/errorHandler.js
import { HttpError } from 'http-errors';

// Global error handling middleware
export const errorHandler = (err, req, res, next) => {
  console.error('Error Middleware:', err);

  // Check if error is an instance of HttpError (created via http-errors)
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      message: err.message || err.name,
    });
  }

  const isProd = process.env.NODE_ENV === 'production';

  // Return generic message in production to prevent leaking sensitive data
  res.status(500).json({
    message: isProd
      ? 'Something went wrong. Please try again later.'
      : err.message,
  });
};
