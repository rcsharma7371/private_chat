import { describe, it, expect } from 'vitest';
import { stretchAccessCode } from '../crypto/argon2.js';
import { computeConfirmationTag, verifyConfirmationTag, computeSAS } from '../crypto/sas.js';
import {
  deriveSessionKeys,
  encryptMessage,
  decryptMessage,
  ratchetChainStep,
} from '../crypto/e2ee.js';

describe('Cryptographic Engine & E2EE Primitives', () => {
  it('stretches access code into verifier and authKey', async () => {
    const code = 'secret-passphrase-123';
    const stretched = await stretchAccessCode(code);

    expect(stretched.salt).toBeDefined();
    expect(stretched.verifier).toHaveLength(64); // 32 bytes hex
    expect(stretched.authKey).toBeInstanceOf(Uint8Array);
    expect(stretched.authKey.length).toBe(32);

    // Identical salt produces identical output
    const stretchedAgain = await stretchAccessCode(code, stretched.salt);
    expect(stretchedAgain.verifier).toBe(stretched.verifier);
  });

  it('computes and verifies code-bound HMAC confirmation tags', async () => {
    const code = 'secure-room-code-xyz';
    const { authKey } = await stretchAccessCode(code);

    const dummyEcdhJwk = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'dummyX', y: 'dummyY' });
    const slotIndex = 1;

    const tag = await computeConfirmationTag(authKey, slotIndex, dummyEcdhJwk);
    expect(tag).toBeTruthy();

    const isValid = await verifyConfirmationTag(authKey, slotIndex, dummyEcdhJwk, tag);
    expect(isValid).toBe(true);

    // Tampered payload fails confirmation
    const isTamperedValid = await verifyConfirmationTag(
      authKey,
      slotIndex,
      dummyEcdhJwk + '_tampered',
      tag
    );
    expect(isTamperedValid).toBe(false);
  });

  it('derives shared session keys, encrypts, and decrypts messages with AAD', async () => {
    // Generate Alice and Bob ephemeral ECDH keys
    const aliceKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );

    const bobKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );

    const aliceSession = await deriveSessionKeys(aliceKeyPair.privateKey, bobKeyPair.publicKey);
    const bobSession = await deriveSessionKeys(bobKeyPair.privateKey, aliceKeyPair.publicKey);

    // Encrypt message from Alice
    const roomId = 'test-room-123';
    const counter = 1;
    const plaintext = 'Hello Bob, this is a top-secret message!';

    const encrypted = await encryptMessage(aliceSession.messageKey, roomId, counter, plaintext);
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.ciphertext).toBeTruthy();

    // Decrypt on Bob's side
    const decrypted = await decryptMessage(
      bobSession.messageKey,
      roomId,
      counter,
      encrypted.iv,
      encrypted.ciphertext
    );
    expect(decrypted).toBe(plaintext);

    // Tampered counter or roomId must fail AAD authentication
    await expect(
      decryptMessage(bobSession.messageKey, roomId, counter + 1, encrypted.iv, encrypted.ciphertext)
    ).rejects.toThrow();

    await expect(
      decryptMessage(bobSession.messageKey, 'wrong-room', counter, encrypted.iv, encrypted.ciphertext)
    ).rejects.toThrow();
  });

  it('computes identical deterministic Short Authentication Strings (SAS) on both ends', async () => {
    const aliceKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
    const bobKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );

    const aliceSession = await deriveSessionKeys(aliceKeyPair.privateKey, bobKeyPair.publicKey);
    const bobSession = await deriveSessionKeys(bobKeyPair.privateKey, aliceKeyPair.publicKey);

    const alicePubJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', aliceKeyPair.publicKey));
    const bobPubJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', bobKeyPair.publicKey));

    const sasAlice = await computeSAS(aliceSession.sasSeed, alicePubJwk, bobPubJwk);
    const sasBob = await computeSAS(bobSession.sasSeed, bobPubJwk, alicePubJwk);

    expect(sasAlice.code).toBe(sasBob.code);
    expect(sasAlice.emojis).toEqual(sasBob.emojis);
    expect(sasAlice.code).toMatch(/^\d{3}\s\d{3}$/);
    expect(sasAlice.emojis).toHaveLength(4);
  });

  it('rotates session keys via ratchet forward chain', async () => {
    const keyPairA = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const keyPairB = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    const session = await deriveSessionKeys(keyPairA.privateKey, keyPairB.publicKey);
    const step1 = await ratchetChainStep(session.chainKey);
    const step2 = await ratchetChainStep(step1.nextChainKey);

    expect(step1.nextChainKey).toBeDefined();
    expect(step2.nextChainKey).toBeDefined();
    expect(new Uint8Array(step1.nextChainKey)).not.toEqual(new Uint8Array(step2.nextChainKey));
  });
});
