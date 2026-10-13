import { z } from 'zod';

export const encryptedMessagePayloadSchema = z.object({
  counter: z.number().int().nonnegative(),
  iv: z.string().min(12),
  ciphertext: z.string().min(1),
  senderSlot: z.number().int().min(0).max(1),
  createdAt: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
});
export type EncryptedMessagePayload = z.infer<typeof encryptedMessagePayloadSchema>;

export const messageQuerySchema = z.object({
  after: z.coerce.number().int().nonnegative().optional().default(0),
});
export type MessageQueryInput = z.infer<typeof messageQuerySchema>;

export const updateDisappearSchema = z.object({
  disappearAfter: z.number().int().min(0).max(604800),
});
export type UpdateDisappearInput = z.infer<typeof updateDisappearSchema>;

export const decryptedMessageSchema = z.object({
  id: z.string(),
  counter: z.number(),
  senderSlot: z.number(),
  text: z.string(),
  timestamp: z.number(),
  isOutgoing: z.boolean(),
  expiresAt: z.number().nullable().optional(),
});
export type DecryptedMessage = z.infer<typeof decryptedMessageSchema>;
