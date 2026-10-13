import { Router } from 'express';
import crypto from 'crypto';
import { requireSession } from '../middleware/auth.js';
import { config } from '../config.js';

export const turnRouter = Router();

turnRouter.get('/', requireSession, (req, res) => {
  const ttlSeconds = 600; // 10 minutes
  const expiryTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiryTimestamp}:${crypto.randomBytes(8).toString('hex')}`;

  const hmac = crypto.createHmac('sha1', config.TURN_SECRET);
  hmac.update(username);
  const credential = hmac.digest('base64');

  const iceServers: any[] = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
    {
      urls: 'stun:openrelay.metered.ca:80',
    },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];

  if (config.STUN_SERVER_URL && !config.STUN_SERVER_URL.includes('localhost')) {
    iceServers.push({ urls: config.STUN_SERVER_URL });
  }

  if (config.TURN_SERVER_URL && !config.TURN_SERVER_URL.includes('localhost')) {
    iceServers.push({
      urls: [config.TURN_SERVER_URL, `${config.TURN_SERVER_URL}?transport=tcp`],
      username,
      credential,
    });
  }

  res.json({ iceServers });
});
