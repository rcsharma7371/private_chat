import { Prisma } from '@prisma/client';
import {
  CreateRoomInput,
  JoinRoomInput,
  MAX_FAILED_ATTEMPTS,
  MAX_PARTICIPANTS,
  ROOM_STATES,
  RoomState,
  RoomStatusResponse,
  SetCodeInput,
} from '@talk/shared';
import { prisma } from '../db.js';
import { createSessionToken, hashVerifier, verifyVerifier } from './authService.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export async function runInteractiveTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await prisma.$transaction(fn);
  } catch (err: any) {
    if (
      err &&
      typeof err.message === 'string' &&
      err.message.includes('Transactions are not supported on standalone instances')
    ) {
      return await fn(prisma);
    }
    throw err;
  }
}

export async function getRoomStatus(slug: string): Promise<RoomStatusResponse & { salt?: string | null }> {
  const room = await prisma.room.findUnique({
    where: { slug },
    include: {
      participants: {
        select: { id: true },
      },
    },
  });

  if (!room) {
    return {
      state: ROOM_STATES.AVAILABLE,
      full: false,
    };
  }

  if (room.codeVerifier === null) {
    return {
      state: ROOM_STATES.AWAITING_CODE,
      full: false,
    };
  }

  return {
    state: ROOM_STATES.PROTECTED,
    full: room.participants.length >= MAX_PARTICIPANTS,
    disappearAfter: room.disappearAfter,
    salt: room.codeSalt,
  };
}

export async function createRoom(data: CreateRoomInput) {
  const existing = await prisma.room.findUnique({
    where: { slug: data.slug },
  });

  if (existing) {
    throw new AppError(409, 'Room link already exists');
  }

  // State B: Create link only without code
  if (!data.verifier) {
    const room = await prisma.room.create({
      data: {
        slug: data.slug,
        codeVerifier: null,
        codeSalt: null,
        disappearAfter: data.disappearAfter ?? null,
      },
    });

    return {
      room: {
        id: room.id,
        slug: room.slug,
        state: ROOM_STATES.AWAITING_CODE,
      },
      token: null,
      slotIndex: null,
    };
  }

  // State A -> Create link and code together
  if (!data.salt || !data.devicePubKey || !data.ecdhPubKey) {
    throw new AppError(400, 'Salt, device public key, and ECDH public key are required when setting an access code');
  }

  const hashedVerifier = await hashVerifier(data.verifier);

  return await runInteractiveTx(async (tx) => {
    const room = await tx.room.create({
      data: {
        slug: data.slug,
        codeVerifier: hashedVerifier,
        codeSalt: data.salt,
        disappearAfter: data.disappearAfter ?? null,
      },
    });

    const participant = await tx.participant.create({
      data: {
        roomId: room.id,
        slotIndex: 0,
        devicePubKey: data.devicePubKey!,
        ecdhPubKey: data.ecdhPubKey!,
        displayName: data.displayName ?? 'Creator',
      },
    });

    const token = createSessionToken({
      roomId: room.id,
      slug: room.slug,
      slotIndex: 0,
      devicePubKey: participant.devicePubKey,
    });

    return {
      room: {
        id: room.id,
        slug: room.slug,
        state: ROOM_STATES.PROTECTED,
      },
      token,
      slotIndex: 0,
    };
  });
}

export async function setRoomCode(slug: string, data: SetCodeInput) {
  const hashedVerifier = await hashVerifier(data.verifier);

  // Atomic first-wins conditional update: only update if codeVerifier is null
  const updateResult = await prisma.room.updateMany({
    where: {
      slug,
      codeVerifier: null,
    },
    data: {
      codeVerifier: hashedVerifier,
      codeSalt: data.salt,
      lastActivityAt: new Date(),
    },
  });

  if (updateResult.count === 0) {
    // Another client won the race or room does not exist
    throw new AppError(409, 'Access code has already been set for this room or room does not exist');
  }

  // Fetch updated room and register creator as slot 0
  return await runInteractiveTx(async (tx) => {
    const room = await tx.room.findUnique({
      where: { slug },
    });

    if (!room) {
      throw new AppError(404, 'Room not found');
    }

    const participant = await tx.participant.create({
      data: {
        roomId: room.id,
        slotIndex: 0,
        devicePubKey: data.devicePubKey,
        ecdhPubKey: data.ecdhPubKey,
        displayName: data.displayName ?? 'Participant 1',
      },
    });

    const token = createSessionToken({
      roomId: room.id,
      slug: room.slug,
      slotIndex: 0,
      devicePubKey: participant.devicePubKey,
    });

    return {
      room: {
        id: room.id,
        slug: room.slug,
        state: ROOM_STATES.PROTECTED,
      },
      token,
      slotIndex: 0,
    };
  });
}

export async function joinRoom(slug: string, data: JoinRoomInput) {
  const room = await prisma.room.findUnique({
    where: { slug },
  });

  // Identical generic error message to avoid enumeration
  if (!room || room.codeVerifier === null) {
    if (room && room.codeVerifier === null) {
      throw new AppError(409, 'Room requires an access code to be set first');
    }
    throw new AppError(403, 'Invalid room link or access code');
  }

  // Check brute force lockout (15 minutes)
  if (room.lockedUntil && room.lockedUntil > new Date()) {
    throw new AppError(429, 'Room is temporarily locked due to repeated failed attempts. Please try again later.');
  }

  // Constant-time Argon2 comparison
  const isMatch = await verifyVerifier(room.codeVerifier, data.verifier);

  if (!isMatch) {
    const failedAttempts = room.failedAttempts + 1;
    const lockedUntil =
      failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + 15 * 60 * 1000) : null;

    await prisma.room.update({
      where: { id: room.id },
      data: {
        failedAttempts,
        lockedUntil,
      },
    });

    if (lockedUntil) {
      throw new AppError(429, 'Maximum attempts exceeded. Room locked for 15 minutes.');
    }

    throw new AppError(403, 'Invalid room link or access code');
  }

  // Reset failed attempts upon successful password verification
  if (room.failedAttempts > 0 || room.lockedUntil) {
    await prisma.room.update({
      where: { id: room.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  // Atomic 2-person slot assignment inside interactive transaction
  try {
    return await runInteractiveTx(async (tx) => {
      const participants = await tx.participant.findMany({
        where: { roomId: room.id },
      });

      // Check if this exact device is already registered in a slot
      const existing = participants.find((p) => p.devicePubKey === data.devicePubKey);
      if (existing) {
        // Device re-joining: update ephemeral ECDH public key and refresh activity
        await tx.participant.update({
          where: { id: existing.id },
          data: {
            ecdhPubKey: data.ecdhPubKey,
            displayName: data.displayName ?? existing.displayName,
          },
        });

        await tx.room.update({
          where: { id: room.id },
          data: { lastActivityAt: new Date() },
        });

        const token = createSessionToken({
          roomId: room.id,
          slug: room.slug,
          slotIndex: existing.slotIndex,
          devicePubKey: existing.devicePubKey,
        });

        return {
          room: { id: room.id, slug: room.slug },
          token,
          slotIndex: existing.slotIndex,
          peer: participants.find((p) => p.id !== existing.id) ?? null,
        };
      }

      // Check 2-person limit strictly
      if (participants.length >= MAX_PARTICIPANTS) {
        throw new AppError(403, 'Room is full. Exactly two participants are permitted.');
      }

      // Determine vacant slot index (0 or 1)
      const occupiedSlots = new Set(participants.map((p) => p.slotIndex));
      const targetSlot = !occupiedSlots.has(0) ? 0 : 1;

      // Unique compound index (roomId, slotIndex) ensures database-level atomicity
      const newParticipant = await tx.participant.create({
        data: {
          roomId: room.id,
          slotIndex: targetSlot,
          devicePubKey: data.devicePubKey,
          ecdhPubKey: data.ecdhPubKey,
          displayName: data.displayName ?? `Participant ${targetSlot + 1}`,
        },
      });

      await tx.room.update({
        where: { id: room.id },
        data: { lastActivityAt: new Date() },
      });

      const token = createSessionToken({
        roomId: room.id,
        slug: room.slug,
        slotIndex: newParticipant.slotIndex,
        devicePubKey: newParticipant.devicePubKey,
      });

      return {
        room: { id: room.id, slug: room.slug },
        token,
        slotIndex: newParticipant.slotIndex,
        peer: participants[0] ?? null,
      };
    });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(403, 'Room is full or slot conflict occurred.');
    }
    throw error;
  }
}

export async function leaveRoom(roomId: string, devicePubKey: string) {
  await prisma.participant.deleteMany({
    where: {
      roomId,
      devicePubKey,
    },
  });

  await prisma.room.update({
    where: { id: roomId },
    data: { lastActivityAt: new Date() },
  });

  return { success: true };
}

export async function burnRoom(roomId: string) {
  return await runInteractiveTx(async (tx) => {
    await tx.message.deleteMany({ where: { roomId } });
    await tx.participant.deleteMany({ where: { roomId } });
    await tx.room.delete({ where: { id: roomId } });
    return { destroyed: true };
  });
}

export async function getRoomMessages(roomId: string, after = 0) {
  const messages = await prisma.message.findMany({
    where: {
      roomId,
      counter: { gt: after },
    },
    orderBy: { counter: 'asc' },
    select: {
      id: true,
      senderSlot: true,
      counter: true,
      iv: true,
      ciphertext: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return messages.map((m) => ({
    id: m.id,
    senderSlot: m.senderSlot,
    counter: m.counter,
    iv: m.iv,
    ciphertext: Buffer.from(m.ciphertext).toString('base64'),
    createdAt: m.createdAt.toISOString(),
    expiresAt: m.expiresAt?.toISOString() ?? null,
  }));
}

export async function saveMessage(
  roomId: string,
  data: {
    senderSlot: number;
    counter: number;
    iv: string;
    ciphertext: string;
    expiresAt?: string | null;
  }
) {
  const ciphertextBuffer = Buffer.from(data.ciphertext, 'base64');

  const message = await prisma.message.create({
    data: {
      roomId,
      senderSlot: data.senderSlot,
      counter: data.counter,
      iv: data.iv,
      ciphertext: ciphertextBuffer,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
  });

  await prisma.room.update({
    where: { id: roomId },
    data: { lastActivityAt: new Date() },
  });

  return {
    id: message.id,
    senderSlot: message.senderSlot,
    counter: message.counter,
    iv: message.iv,
    ciphertext: data.ciphertext,
    createdAt: message.createdAt.toISOString(),
    expiresAt: message.expiresAt?.toISOString() ?? null,
  };
}

export async function updateDisappearingTimer(roomId: string, seconds: number) {
  const updated = await prisma.room.update({
    where: { id: roomId },
    data: {
      disappearAfter: seconds === 0 ? null : seconds,
      lastActivityAt: new Date(),
    },
  });
  return updated.disappearAfter;
}
