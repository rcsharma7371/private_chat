import http from 'http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { connectDB, disconnectDB } from './db.js';
import { securityHeaders, noStoreCache } from './middleware/security.js';
import { generalApiLimiter } from './middleware/rateLimit.js';
import { roomsRouter } from './routes/rooms.js';
import { turnRouter } from './routes/turn.js';
import { initSocketIO } from './sockets/index.js';
import { initCronJobs } from './services/cronService.js';

export const app = express();

// Trust reverse proxy for secure cookies and rate limiting in container / cloud
app.set('trust proxy', 1);

// Security & Caching Middlewares
app.use(securityHeaders);
app.use(noStoreCache);

// CORS configuration
app.use(
  cors({
    origin: process.env.NODE_ENV === 'production'
      ? config.CLIENT_ORIGIN
      : (origin, callback) => callback(null, true),
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '500kb' }));

// General Rate Limiting
app.use('/api', generalApiLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Routes
app.use('/api/rooms', roomsRouter);
app.use('/api/turn-credentials', turnRouter);

// Central error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

export const server = http.createServer(app);

// Initialize Socket.IO
initSocketIO(server);

// Boot server if run directly
if (process.env.NODE_ENV !== 'test') {
  connectDB()
    .then(() => {
      console.log('[DB] Connected to MongoDB Atlas cluster');
      initCronJobs();

      server.listen(config.PORT, '0.0.0.0', () => {
        console.log(`[Server] Private Chat & Call Server running on http://0.0.0.0:${config.PORT}`);
      });
    })
    .catch((err) => {
      console.error('[Startup Error] Failed to connect to DB:', err);
      process.exit(1);
    });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Server] Gracefully shutting down...');
    server.close();
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
