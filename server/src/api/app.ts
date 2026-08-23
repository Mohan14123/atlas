import express from 'express';
import cors from 'cors';
import routes from './routes';
import { errorHandler } from './middlewares/error';
import { logger } from '../shared/lib/logger';

export function createApp() {
  const app = express();

  logger.setService('api');

  app.use(cors());
  app.use(express.json());

  // HTTP request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      logger.info(`HTTP ${req.method} ${req.originalUrl}`, {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration_ms: durationMs,
      });
    });
    next();
  });

  // Health check
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Mount API routes
  app.use('/api/v1', routes);

  // 404 handler
  app.use((req, res, next) => {
    res.status(404).json({ error: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}
