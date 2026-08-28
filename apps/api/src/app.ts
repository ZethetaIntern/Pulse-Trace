import express from 'express';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { logger } from './infrastructure/logger';
import { analyticsRoutes } from './modules/analytics';
import { monitoringRoutes } from './modules/monitoring';
import { notificationRoutes } from './modules/notifications';
import { readinessRoutes } from './modules/readiness';
import { replayRoutes } from './modules/replay';
import { errorHandler } from './shared/middleware/error-handler';
import { requestIdMiddleware } from './shared/middleware/request-id';

const app = express();

// Security headers via Helmet.  Tuned for a JSON API that is consumed by a
// separate dashboard origin:
//  - crossOriginEmbedderPolicy disabled (breaks cross-origin fetch from dashboard)
//  - crossOriginResourcePolicy set to 'cross-origin' (same reason)
//  - contentSecurityPolicy disabled (API returns JSON, not HTML)
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  }),
);

app.use((req, res, next) => {
  const isDev = env.nodeEnv !== 'production';
  const allowedOrigins = env.corsOrigins.length > 0 ? env.corsOrigins : isDev ? ['*'] : [];
  const origin = req.headers.origin;

  if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
  } else if (!isDev) {
    // In production, reject requests from unconfigured origins
    res.status(403).json({
      success: false,
      message: 'CORS: Origin not allowed',
      error: { code: 'CORS_ORIGIN_NOT_ALLOWED' },
    });
    return;
  }
  next();
});

app.use(express.json({ limit: '100kb' }));

// Request correlation — must run after JSON parser, before any routes.
app.use(requestIdMiddleware);

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
app.use('/api/v1/monitoring', monitoringRoutes);
app.use('/health', readinessRoutes);

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
