import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { authService as defaultAuthService } from './services/authService.js';
import { devicePairingService as defaultDevicePairingService } from './services/devicePairingService.js';
import { familyChildService as defaultFamilyChildService } from './services/familyChildService.js';
import { policyService as defaultPolicyService } from './services/policyService.js';
import { screenTimeService as defaultScreenTimeService } from './services/screenTimeService.js';
import { webHistoryService as defaultWebHistoryService } from './services/webHistoryService.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createChildRouter } from './routes/childRoutes.js';
import { createDevicePairingRouter } from './routes/devicePairingRoutes.js';
import { createPolicyRouter } from './routes/policyRoutes.js';
import { createScreenTimeRouter } from './routes/screenTimeRoutes.js';
import { createWebHistoryRouter } from './routes/webHistoryRoutes.js';
import { createAppUpdateRouter } from './routes/appUpdateRoutes.js';
import { getHealth } from './controllers/healthController.js';
import healthRoutes from './routes/healthRoutes.js';

export function createApp({
  authService = defaultAuthService,
  familyChildService = defaultFamilyChildService,
  devicePairingService = defaultDevicePairingService,
  policyService = defaultPolicyService,
  screenTimeService = defaultScreenTimeService,
  webHistoryService = defaultWebHistoryService,
  runtimeEnv = env,
} = {}) {
  const logger = pino({ level: runtimeEnv.NODE_ENV === 'test' ? 'silent' : 'info' });
  const app = express();

  const trustProxyHops = runtimeEnv.TRUST_PROXY ?? (runtimeEnv.NODE_ENV === 'production' ? 1 : 0);
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  const runtimeOrigins = Array.isArray(runtimeEnv.CLIENT_ORIGIN)
    ? runtimeEnv.CLIENT_ORIGIN
    : typeof runtimeEnv.CLIENT_ORIGIN === 'string'
      ? runtimeEnv.CLIENT_ORIGIN.split(',').map((o) => o.trim().replace(/\/+$/, ''))
      : [runtimeEnv.CLIENT_ORIGIN].filter(Boolean);

  const defaultAllowedOrigins = [
    'https://bala-kavach-fe.vercel.app',
    'http://localhost:5173',
  ];

  const allowedOrigins = Array.from(new Set([
    ...defaultAllowedOrigins,
    ...runtimeOrigins,
  ]));

  app.disable('x-powered-by');
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  app.use(cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://')
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  }));
  app.use(requestId);
  app.use(pinoHttp({
    logger,
    genReqId: (req) => req.id,
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/v1', rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { ok: false, error: { message: 'Too many requests. Try again later.' } },
  }));

  app.use('/api/v1/auth', createAuthRouter({
    authService,
    clientOrigin: runtimeEnv.CLIENT_ORIGIN,
    nodeEnv: runtimeEnv.NODE_ENV,
    sameSite: runtimeEnv.SESSION_COOKIE_SAME_SITE ?? 'strict',
  }));
  app.use('/api/v1/children', createChildRouter({
    authService,
    familyChildService,
    clientOrigin: runtimeEnv.CLIENT_ORIGIN,
    nodeEnv: runtimeEnv.NODE_ENV,
  }));
  app.use('/api/v1', createDevicePairingRouter({
    authService,
    devicePairingService,
    clientOrigin: runtimeEnv.CLIENT_ORIGIN,
    nodeEnv: runtimeEnv.NODE_ENV,
    rateLimitConfig: runtimeEnv.rateLimitConfig,
  }));
  app.use('/api/v1', createPolicyRouter({
    authService,
    devicePairingService,
    policyService,
    clientOrigin: runtimeEnv.CLIENT_ORIGIN,
    nodeEnv: runtimeEnv.NODE_ENV,
  }));
  app.use('/api/v1', createScreenTimeRouter({
    authService,
    devicePairingService,
    screenTimeService,
    nodeEnv: runtimeEnv.NODE_ENV,
    rateLimitConfig: runtimeEnv.rateLimitConfig,
  }));
  app.use('/api/v1', createWebHistoryRouter({
    authService,
    devicePairingService,
    webHistoryService,
    nodeEnv: runtimeEnv.NODE_ENV,
    rateLimitConfig: runtimeEnv.rateLimitConfig,
  }));
  app.use('/api/v1/app-update', createAppUpdateRouter({ runtimeEnv }));

  const backendPublicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
  if (fs.existsSync(backendPublicDir)) {
    app.use(express.static(backendPublicDir, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.apk')) {
          res.setHeader('Content-Type', 'application/vnd.android.package-archive');
          res.setHeader('Content-Disposition', 'attachment; filename="balakavach-companion.apk"');
        } else if (filePath.endsWith('.zip')) {
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', 'attachment; filename="balakavach-chrome-extension.zip"');
        }
      },
    }));
  }
  app.get('/', (req, res) => {
    res.status(200).json({
      ok: true,
      message: 'Your backend is connected',
      service: 'balakavach-api',
      status: 'ready',
      endpoints: {
        health: '/api/v1/health',
        auth: '/api/v1/auth',
        children: '/api/v1/children',
        policies: '/api/v1/policies',
        screenTime: '/api/v1/screen-time',
        appUpdate: '/api/v1/app-update',
      },
    });
  });
  app.get('/health', getHealth);
  app.use('/api/v1', healthRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();

export default app;
