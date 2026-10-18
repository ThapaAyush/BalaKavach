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
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { createAuthRouter } from './routes/authRoutes.js';
import { createChildRouter } from './routes/childRoutes.js';
import { createDevicePairingRouter } from './routes/devicePairingRoutes.js';
import { createPolicyRouter } from './routes/policyRoutes.js';
import { createScreenTimeRouter } from './routes/screenTimeRoutes.js';
import { getHealth } from './controllers/healthController.js';
import healthRoutes from './routes/healthRoutes.js';

export function createApp({
  authService = defaultAuthService,
  familyChildService = defaultFamilyChildService,
  devicePairingService = defaultDevicePairingService,
  policyService = defaultPolicyService,
  screenTimeService = defaultScreenTimeService,
  runtimeEnv = env,
} = {}) {
  const logger = pino({ level: runtimeEnv.NODE_ENV === 'test' ? 'silent' : 'info' });
  const app = express();

  const trustProxyHops = runtimeEnv.TRUST_PROXY ?? (runtimeEnv.NODE_ENV === 'production' ? 1 : 0);
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  const allowedOrigins = Array.isArray(runtimeEnv.CLIENT_ORIGIN)
    ? runtimeEnv.CLIENT_ORIGIN
    : typeof runtimeEnv.CLIENT_ORIGIN === 'string'
      ? runtimeEnv.CLIENT_ORIGIN.split(',').map((o) => o.trim().replace(/\/+$/, ''))
      : [runtimeEnv.CLIENT_ORIGIN];

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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
  app.use(express.json({ limit: '32kb' }));
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
