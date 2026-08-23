import express from 'express';
import { env } from './config/env';
import { logger } from './infrastructure/logger';
import { analyticsRoutes } from './modules/analytics';
import { notificationRoutes } from './modules/notifications';
import { replayRoutes } from './modules/replay';
import { errorHandler } from './shared/middleware/error-handler';

const app = express();

app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: env.nodeEnv,
  });
});

app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/notifications', replayRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

app.use(errorHandler);

export { app, logger };
