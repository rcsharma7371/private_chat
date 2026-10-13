export interface DerivedSessionKeys {
  messageKey: CryptoKey;
  signalingKey: CryptoKey;
  sasSeed: ArrayBuffer;
  chainKey: ArrayBuffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function deriveSessionKeys(
  myEcdhPrivateKey: CryptoKey,
  peerEcdhPublicKey: CryptoKey
): Promise<DerivedSessionKeys> {
  // 1. Derive ECDH shared bits
  const sharedBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerEcdhPublicKey,
    },
    myEcdhPrivateKey,
    256
  );

  // 2. Import shared bits into HKDF master key
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const enc = new TextEncoder();

  // 3. Derive AES-GCM 256-bit message key
  const messageKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // standard zero salt for initial exchange
      info: enc.encode('talk-e2ee-message-v1'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // 4. Derive AES-GCM 256-bit WebRTC signaling key
  const signalingKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: enc.encode('talk-e2ee-signaling-v1'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // 5. Derive SAS seed bits
  const sasSeed = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: enc.encode('talk-e2ee-sas-v1'),
    },
    hkdfKey,
    256
  );

  // 6. Derive Chain key for forward secrecy ratcheting
  const chainKey = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: enc.encode('talk-e2ee-chain-v1'),
    },
    hkdfKey,
    256
  );

  return {
    messageKey,
    signalingKey,
    sasSeed,
    chainKey,
  };
}

export async function encryptMessage(
  key: CryptoKey,
  roomId: string,
  counter: number,
  plaintext: string
): Promise<{ counter: number; iv: string; ciphertext: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit random IV
  const aad = new TextEncoder().encode(`${roomId}:${counter}`);
  const encodedPlaintext = new TextEncoder().encode(plaintext);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
    },
    key,
    encodedPlaintext
  );

  return {
    counter,
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(encrypted),
  };
}

export async function decryptMessage(
  key: CryptoKey,
  roomId: string,
  counter: number,
  ivBase64: string,
  ciphertextBase64: string
): Promise<string> {
  const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const aad = new TextEncoder().encode(`${roomId}:${counter}`);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
    },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

export async function encryptSignal(
  signalingKey: CryptoKey,
  counter: number,
  payload: unknown
): Promise<{ iv: string; ciphertext: string; counter: number }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const text = JSON.stringify(payload);
  const aad = new TextEncoder().encode(`signal:${counter}`);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
    },
    signalingKey,
    new TextEncoder().encode(text)
  );

  return {
    counter,
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(encrypted),
  };
}

export async function decryptSignal(
  signalingKey: CryptoKey,
  counter: number,
  ivBase64: string,
  ciphertextBase64: string
): Promise<any> {
  const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
  const ciphertext = base64ToArrayBuffer(ciphertextBase64);
  const aad = new TextEncoder().encode(`signal:${counter}`);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
    },
    signalingKey,
    ciphertext
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

// Forward secrecy ratchet rotation: advances chain key and derives new message key
export async function ratchetChainStep(
  currentChainKey: ArrayBuffer
): Promise<{ nextChainKey: ArrayBuffer; messageKey: CryptoKey }> {
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    currentChainKey,
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const enc = new TextEncoder();

  const messageKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: enc.encode('talk-ratchet-msg'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const nextChainKey = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: enc.encode('talk-ratchet-chain'),
    },
    hkdfKey,
    256
  );

  return { nextChainKey, messageKey };
}
