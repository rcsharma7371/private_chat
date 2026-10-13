import { z } from 'zod';

export const signalTypeSchema = z.enum(['offer', 'answer', 'ice', 'end']);
export type SignalType = z.infer<typeof signalTypeSchema>;

export const encryptedSignalPayloadSchema = z.object({
  type: signalTypeSchema,
  ciphertext: z.string().min(1),
  iv: z.string().min(12),
  counter: z.number().int().nonnegative(),
});
export type EncryptedSignalPayload = z.infer<typeof encryptedSignalPayloadSchema>;

export const iceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

export const turnCredentialsResponseSchema = z.object({
  iceServers: z.array(iceServerSchema),
});
export type TurnCredentialsResponse = z.infer<typeof turnCredentialsResponseSchema>;
