import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { RoomSessionPayload } from '@talk/shared';
import { config } from '../config.js';

export async function hashVerifier(verifier: string): Promise<string> {
  return argon2.hash(verifier, {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyVerifier(storedHash: string, candidateVerifier: string): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, candidateVerifier);
  } catch {
    return false;
  }
}

export function createSessionToken(payload: RoomSessionPayload): string {
  return jwt.sign(payload, config.SESSION_SECRET, {
    expiresIn: '15m',
    algorithm: 'HS256',
  });
}

export function verifySessionToken(token: string): RoomSessionPayload | null {
  try {
    const decoded = jwt.verify(token, config.SESSION_SECRET, {
      algorithms: ['HS256'],
    });
    return decoded as RoomSessionPayload;
  } catch {
    return null;
  }
}
