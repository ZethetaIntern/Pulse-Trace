import express from 'express';
import path from 'path';
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

// Swagger UI — available in development and test environments only.
if (env.nodeEnv !== 'production') {
  // Lazy-load swagger-ui-express so production bundles stay small.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const swaggerUi = require('swagger-ui-express');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const YAML = require('yamljs');
    const specPath = path.resolve(__dirname, '../docs/openapi.yaml');
    const spec = YAML.load(specPath);
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, {
      customSiteTitle: 'PulseTrace API Docs',
    }));
    logger.info('Swagger UI available at /docs');
  } catch (error) {
    logger.warn({ error }, 'Could not load Swagger UI — docs route disabled');
  }
}

app.use(errorHandler);

export { app, logger };
