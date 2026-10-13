import { z } from 'zod';
import { RESERVED_SLUGS, ROOM_STATES, SLUG_REGEX } from './constants.js';

export const slugSchema = z
  .string()
  .min(6, 'Slug must be at least 6 characters')
  .max(40, 'Slug cannot exceed 40 characters')
  .regex(SLUG_REGEX, 'Slug must contain only lowercase letters, numbers, and hyphens')
  .refine((slug) => !RESERVED_SLUGS.has(slug), {
    message: 'This room name is reserved and cannot be used',
  });

export const roomStatusResponseSchema = z.object({
  state: z.enum([ROOM_STATES.AVAILABLE, ROOM_STATES.AWAITING_CODE, ROOM_STATES.PROTECTED]),
  full: z.boolean(),
  disappearAfter: z.number().nullable().optional(),
});
export type RoomStatusResponse = z.infer<typeof roomStatusResponseSchema>;

export const createRoomSchema = z.object({
  slug: slugSchema,
  verifier: z.string().min(16).max(256).optional(),
  salt: z.string().min(16).max(128).optional(),
  devicePubKey: z.string().min(20).optional(),
  ecdhPubKey: z.string().min(20).optional(),
  displayName: z.string().trim().max(50).optional(),
  disappearAfter: z.number().int().min(0).max(604800).optional(),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const setCodeSchema = z.object({
  verifier: z.string().min(16).max(256),
  salt: z.string().min(16).max(128),
  devicePubKey: z.string().min(20),
  ecdhPubKey: z.string().min(20),
  displayName: z.string().trim().max(50).optional(),
});
export type SetCodeInput = z.infer<typeof setCodeSchema>;

export const joinRoomSchema = z.object({
  verifier: z.string().min(16).max(256),
  devicePubKey: z.string().min(20),
  ecdhPubKey: z.string().min(20),
  displayName: z.string().trim().max(50).optional(),
});
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;

export const roomSessionPayloadSchema = z.object({
  roomId: z.string(),
  slug: z.string(),
  slotIndex: z.number().int().min(0).max(1),
  devicePubKey: z.string(),
});
export type RoomSessionPayload = z.infer<typeof roomSessionPayloadSchema>;

export const peerInfoSchema = z.object({
  slotIndex: z.number().int().min(0).max(1),
  devicePubKey: z.string(),
  ecdhPubKey: z.string(),
  displayName: z.string().nullable().optional(),
  joinedAt: z.string(),
});
export type PeerInfo = z.infer<typeof peerInfoSchema>;
