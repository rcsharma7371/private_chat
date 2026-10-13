export interface StretchedCodeResult {
  salt: string;
  verifier: string;
  authKey: Uint8Array;
}

export function generateRandomSalt(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function stretchAccessCode(
  code: string,
  salt?: string
): Promise<StretchedCodeResult> {
  const chosenSalt = salt || generateRandomSalt(16);

  // In browser environments with DOM and valid URL origin, dynamically load WASM Argon2id
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined' && window.location.href) {
    try {
      const argonModule = await import('argon2-browser/dist/argon2-bundled.min.js');
      const argon2 = argonModule.default || argonModule;

      const result = await argon2.hash({
        pass: code,
        salt: chosenSalt,
        time: 2,
        mem: 19456, // 19 MiB memory cost
        hashLen: 64, // 64 bytes: 32 for verifier + 32 for authKey
        parallelism: 1,
        type: (argon2.ArgonType && argon2.ArgonType.Argon2id) ?? 2,
      });

      const rawBytes = result.hash;
      const verifierBytes = rawBytes.slice(0, 32);
      const authKeyBytes = rawBytes.slice(32, 64);

      const verifierHex = Array.from(verifierBytes)
        .map((b: number) => b.toString(16).padStart(2, '0'))
        .join('');

      return {
        salt: chosenSalt,
        verifier: verifierHex,
        authKey: authKeyBytes,
      };
    } catch (error) {
      console.warn('[Argon2 WASM] Fallback derivation triggered:', error);
    }
  }

  // Web Crypto PBKDF2 derivation (high-iteration fallback and Node test environment)
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(code),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(chosenSalt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    512
  );

  const rawBytes = new Uint8Array(derivedBits);
  const verifierBytes = rawBytes.slice(0, 32);
  const authKeyBytes = rawBytes.slice(32, 64);

  const verifierHex = Array.from(verifierBytes)
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    salt: chosenSalt,
    verifier: verifierHex,
    authKey: authKeyBytes,
  };
}
