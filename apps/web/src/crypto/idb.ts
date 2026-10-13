import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface TalkDB extends DBSchema {
  device_keys: {
    key: string;
    value: {
      keyId: string;
      publicKeyJwk: string;
      keyPair: CryptoKeyPair;
      createdAt: number;
    };
  };
  room_keys: {
    key: string; // roomId
    value: {
      roomId: string;
      ecdhKeyPair: CryptoKeyPair;
      ecdhPubKeyJwk: string;
      authKeyRaw?: ArrayBuffer;
      sharedKey?: CryptoKey;
      signalingKey?: CryptoKey;
      sasSeed?: ArrayBuffer;
      outCounter: number;
      inCounter: number;
    };
  };
  messages: {
    key: string; // `${roomId}:${counter}`
    value: {
      id: string;
      roomId: string;
      counter: number;
      senderSlot: number;
      text: string;
      timestamp: number;
      isOutgoing: boolean;
      expiresAt?: number | null;
    };
    indexes: {
      by_room: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<TalkDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TalkDB>('talk_privacy_keystore', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('device_keys')) {
          db.createObjectStore('device_keys', { keyPath: 'keyId' });
        }
        if (!db.objectStoreNames.contains('room_keys')) {
          db.createObjectStore('room_keys', { keyPath: 'roomId' });
        }
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('by_room', 'roomId');
        }
      },
    });
  }
  return dbPromise;
}

// 1. Device Key Operations
export async function getStoredDeviceKey() {
  const db = await getDB();
  return db.get('device_keys', 'primary_device_key');
}

export async function saveStoredDeviceKey(publicKeyJwk: string, keyPair: CryptoKeyPair) {
  const db = await getDB();
  await db.put('device_keys', {
    keyId: 'primary_device_key',
    publicKeyJwk,
    keyPair,
    createdAt: Date.now(),
  });
}

// 2. Room Key Operations
export async function getStoredRoomKeys(roomId: string) {
  const db = await getDB();
  return db.get('room_keys', roomId);
}

export async function saveStoredRoomKeys(data: {
  roomId: string;
  ecdhKeyPair: CryptoKeyPair;
  ecdhPubKeyJwk: string;
  authKeyRaw?: ArrayBuffer;
  sharedKey?: CryptoKey;
  signalingKey?: CryptoKey;
  sasSeed?: ArrayBuffer;
  outCounter: number;
  inCounter: number;
}) {
  const db = await getDB();
  await db.put('room_keys', data);
}

export async function saveRoomSessionKeys(slug: string, data: {
  roomId: string;
  ecdhKeyPair: CryptoKeyPair;
  ecdhPubKeyJwk: string;
}) {
  const db = await getDB();
  await db.put('room_keys', {
    roomId: slug.toLowerCase(),
    ecdhKeyPair: data.ecdhKeyPair,
    ecdhPubKeyJwk: data.ecdhPubKeyJwk,
    outCounter: 0,
    inCounter: 0,
  });
}

export async function getRoomSessionKeys(slug: string) {
  const db = await getDB();
  return db.get('room_keys', slug.toLowerCase());
}

export async function clearRoomSessionKeys(slug: string) {
  const db = await getDB();
  await db.delete('room_keys', slug.toLowerCase());
}

// 3. Decrypted Message Storage (Ephemeral client cache)
export async function saveLocalMessage(msg: {
  id: string;
  roomId: string;
  counter: number;
  senderSlot: number;
  text: string;
  timestamp: number;
  isOutgoing: boolean;
  expiresAt?: number | null;
}) {
  const db = await getDB();
  await db.put('messages', msg);
}

export async function getLocalMessages(roomId: string) {
  const db = await getDB();
  const tx = db.transaction('messages', 'readonly');
  const index = tx.store.index('by_room');
  const msgs = await index.getAll(roomId);
  return msgs.sort((a, b) => a.counter - b.counter);
}

// 4. Crypto-Shredding: Immediate wipe of room keys & messages from local IndexedDB
export async function wipeRoom(roomId: string) {
  const db = await getDB();
  const tx = db.transaction(['room_keys', 'messages'], 'readwrite');
  await tx.objectStore('room_keys').delete(roomId);

  const msgIndex = tx.objectStore('messages').index('by_room');
  let cursor = await msgIndex.openCursor(roomId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
