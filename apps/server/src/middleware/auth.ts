import { Request, Response, NextFunction } from 'express';
import { RoomSessionPayload } from '@talk/shared';
import { verifySessionToken } from '../services/authService.js';

export interface AuthenticatedRequest extends Request {
  session?: RoomSessionPayload;
}

export function requireSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token =
    req.cookies?.talk_session ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) {
    return res.status(401).json({ error: 'Session required' });
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Session invalid or expired' });
  }

  req.session = payload;
  next();
}
