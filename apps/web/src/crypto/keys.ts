import { getStoredDeviceKey, saveStoredDeviceKey } from './idb.js';

export interface DeviceKeyInfo {
  keyPair: CryptoKeyPair;
  publicKeyJwk: string;
}

export interface EphemeralECDHInfo {
  keyPair: CryptoKeyPair;
  publicKeyJwk: string;
}

export async function getOrCreateDeviceKey(): Promise<DeviceKeyInfo> {
  const existing = await getStoredDeviceKey();
  if (existing) {
    return {
      keyPair: existing.keyPair,
      publicKeyJwk: existing.publicKeyJwk,
    };
  }

  // Generate non-extractable ECDSA P-256 keypair
  // Note: privateKey is non-extractable (extractable: false)
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign']
  );

  // Export public key to JWK string
  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const publicKeyJwk = JSON.stringify(pubJwk);

  await saveStoredDeviceKey(publicKeyJwk, keyPair);

  return { keyPair, publicKeyJwk };
}

export async function generateEphemeralECDH(): Promise<EphemeralECDHInfo> {
  // Generate non-extractable ECDH P-256 keypair
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    false,
    ['deriveKey', 'deriveBits']
  );

  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const publicKeyJwk = JSON.stringify(pubJwk);

  return { keyPair, publicKeyJwk };
}

export async function importPeerECDHPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

export async function importPeerECDSAPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['verify']
  );
}
