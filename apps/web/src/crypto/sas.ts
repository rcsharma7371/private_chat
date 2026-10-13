// Curated set of 32 distinct, high-contrast emojis for visual SAS comparison
const EMOJI_PALETTE = [
  '🦊', '🦁', '🦉', '🐬', '🌲', '🍀', '🌸', '🌻',
  '🌙', '⭐', '⚡', '🔥', '💎', '🛡️', '🔑', '🚀',
  '🧭', '⛵', '🏔️', '🌊', '☕', '🍎', '🎸', '🎨',
  '🌈', '✨', '🛸', '⚓', '🏖️', '🪐', '💡', '🎵',
];

export async function computeConfirmationTag(
  authKey: Uint8Array,
  slotIndex: number,
  ecdhPubKeyJwk: string
): Promise<string> {
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    authKey as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const payload = new TextEncoder().encode(`${slotIndex}:${ecdhPubKeyJwk}`);
  const signature = await crypto.subtle.sign('HMAC', hmacKey, payload);

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function verifyConfirmationTag(
  authKey: Uint8Array,
  slotIndex: number,
  ecdhPubKeyJwk: string,
  tagBase64: string
): Promise<boolean> {
  try {
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      authKey as unknown as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const payload = new TextEncoder().encode(`${slotIndex}:${ecdhPubKeyJwk}`);
    const signatureBytes = Uint8Array.from(atob(tagBase64), (c) => c.charCodeAt(0));

    return await crypto.subtle.verify('HMAC', hmacKey, signatureBytes as unknown as BufferSource, payload);
  } catch {
    return false;
  }
}

export interface SASVerification {
  code: string; // 6-digit formatted: "123 456"
  emojis: string[]; // 4 emojis: ["🦊", "⚡", "💎", "🛡️"]
}

export async function computeSAS(
  sasSeed: ArrayBuffer,
  keyA: string,
  keyB: string
): Promise<SASVerification> {
  // Sort keys deterministically so both participants get identical SAS
  const [firstKey, secondKey] = [keyA, keyB].sort();
  const enc = new TextEncoder();
  const keyBytes = enc.encode(`${firstKey}|${secondKey}`);

  // Concatenate seed and sorted keys
  const combined = new Uint8Array(sasSeed.byteLength + keyBytes.byteLength);
  combined.set(new Uint8Array(sasSeed), 0);
  combined.set(keyBytes, sasSeed.byteLength);

  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  const hashArray = new Uint8Array(hashBuffer);

  // Derive 6-digit numeric code from first 4 bytes
  const dataView = new DataView(hashBuffer);
  const num32 = dataView.getUint32(0, false);
  const codeNum = (num32 % 1000000).toString().padStart(6, '0');
  const formattedCode = `${codeNum.slice(0, 3)} ${codeNum.slice(3, 6)}`;

  // Derive 4 emojis from next 4 bytes (indices 4..7)
  const emojis = [
    EMOJI_PALETTE[hashArray[4] % EMOJI_PALETTE.length],
    EMOJI_PALETTE[hashArray[5] % EMOJI_PALETTE.length],
    EMOJI_PALETTE[hashArray[6] % EMOJI_PALETTE.length],
    EMOJI_PALETTE[hashArray[7] % EMOJI_PALETTE.length],
  ];

  return {
    code: formattedCode,
    emojis,
  };
}
