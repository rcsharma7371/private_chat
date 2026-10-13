import { Router, Response } from 'express';
import {
  createRoomSchema,
  joinRoomSchema,
  messageQuerySchema,
  setCodeSchema,
  updateDisappearSchema,
} from '@talk/shared';
import { AuthenticatedRequest, requireSession } from '../middleware/auth.js';
import { joinAuthLimiter, roomCreateLimiter } from '../middleware/rateLimit.js';
import {
  AppError,
  burnRoom,
  createRoom,
  getRoomMessages,
  getRoomStatus,
  joinRoom,
  leaveRoom,
  setRoomCode,
  updateDisappearingTimer,
} from '../services/roomService.js';
import { getIO } from '../sockets/index.js';

export const roomsRouter = Router();

function setSessionCookie(res: Response, token: string) {
  res.cookie('talk_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/',
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie('talk_session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

// 1. Get room status (State A: AVAILABLE, State B: AWAITING_CODE, State C: PROTECTED)
roomsRouter.get('/:slug/status', async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const status = await getRoomStatus(slug);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

// 2. Create room (State A -> Link only or Link + Code)
roomsRouter.post('/', roomCreateLimiter, async (req, res, next) => {
  try {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }

    const result = await createRoom(parsed.data);
    if (result.token) {
      setSessionCookie(res, result.token);
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// 3. Set access code on link-only room (State B -> State C, atomic first-wins)
roomsRouter.post('/:slug/code', joinAuthLimiter, async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const parsed = setCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }

    const result = await setRoomCode(slug, parsed.data);
    setSessionCookie(res, result.token);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// 4. Join protected room (State C)
roomsRouter.post('/:slug/join', joinAuthLimiter, async (req, res, next) => {
  try {
    const slug = req.params.slug.toLowerCase();
    const parsed = joinRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
    }

    const result = await joinRoom(slug, parsed.data);
    setSessionCookie(res, result.token);

    // Notify existing peer over socket if connected
    const io = getIO();
    if (io) {
      io.to(result.room.id).emit('room:peer-joined', {
        slotIndex: result.slotIndex,
        devicePubKey: parsed.data.devicePubKey,
        ecdhPubKey: parsed.data.ecdhPubKey,
        displayName: parsed.data.displayName ?? null,
      });
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// 5. Leave room (frees participant slot)
roomsRouter.post('/:slug/leave', requireSession, async (req: AuthenticatedRequest, res, next) => {
  try {
    const session = req.session!;
    await leaveRoom(session.roomId, session.devicePubKey);
    clearSessionCookie(res);

    const io = getIO();
    if (io) {
      io.to(session.roomId).emit('room:peer-left', {
        slotIndex: session.slotIndex,
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// 6. Burn room (panic button: hard deletes DB records and notifies connected clients)
roomsRouter.delete('/:slug', requireSession, async (req: AuthenticatedRequest, res, next) => {
  try {
    const session = req.session!;
    const io = getIO();
    if (io) {
      io.to(session.roomId).emit('room:destroyed', {
        reason: 'Room destroyed by participant',
      });
    }

    await burnRoom(session.roomId);
    clearSessionCookie(res);

    res.json({ destroyed: true });
  } catch (error) {
    next(error);
  }
});

// 7. Get encrypted messages history (ciphertext only)
roomsRouter.get('/:slug/messages', requireSession, async (req: AuthenticatedRequest, res, next) => {
  try {
    const session = req.session!;
    const query = messageQuerySchema.safeParse(req.query);
    const after = query.success ? query.data.after : 0;

    const messages = await getRoomMessages(session.roomId, after);
    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

// 8. Update disappearing messages timer
roomsRouter.patch('/:slug/disappear', requireSession, async (req: AuthenticatedRequest, res, next) => {
  try {
    const session = req.session!;
    const parsed = updateDisappearSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid disappearing timer' });
    }

    const updated = await updateDisappearingTimer(session.roomId, parsed.data.disappearAfter);

    const io = getIO();
    if (io) {
      io.to(session.roomId).emit('room:disappear-changed', {
        disappearAfter: updated,
      });
    }

    res.json({ disappearAfter: updated });
  } catch (error) {
    next(error);
  }
});

// Central error handler for rooms routes
roomsRouter.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error('[Rooms API Error]', err);
  return res.status(500).json({ error: 'An unexpected internal error occurred' });
});
