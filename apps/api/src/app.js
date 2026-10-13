import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { authService as defaultAuthService } from './services/authService.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { createAuthRouter } from './routes/authRoutes.js';
import healthRoutes from './routes/healthRoutes.js';

export function createApp({ authService = defaultAuthService, runtimeEnv = env } = {}) {
  const logger = pino({ level: runtimeEnv.NODE_ENV === 'test' ? 'silent' : 'info' });
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: runtimeEnv.CLIENT_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
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
  }));
  app.use('/api/v1', healthRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = createApp();

export default app;
