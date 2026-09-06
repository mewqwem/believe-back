// src/middleware/errorHandler.js
import { HttpError } from 'http-errors';

// Global error handling middleware
export const errorHandler = (err, req, res, next) => {
  // Parser errors can contain the submitted body, including passwords.
  console.error('HTTP request failed');
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Некоректний JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Завеликий запит.' });
  }

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
