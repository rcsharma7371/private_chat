import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

export async function setupMongoIndexes(targetUrl?: string) {
  const url = targetUrl || process.env.DATABASE_URL;
  if (!url) {
    console.warn('[DB Setup] DATABASE_URL is not set. Skipping index initialization.');
    return;
  }

  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db();

    console.log('[DB Setup] Connected to MongoDB. Configuring native indexes...');

    // 1. Message TTL index on expiresAt (Prisma cannot define TTL indexes directly)
    const messageCollection = db.collection('Message');
    await messageCollection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, sparse: true, name: 'Message_expiresAt_TTL' }
    );
    console.log('[DB Setup] Ensured TTL index on Message.expiresAt');

    // 2. Ensure compound indexes for Participant
    const participantCollection = db.collection('Participant');
    await participantCollection.createIndex(
      { roomId: 1, slotIndex: 1 },
      { unique: true, name: 'Participant_roomId_slotIndex_unique' }
    );
    await participantCollection.createIndex(
      { roomId: 1, devicePubKey: 1 },
      { unique: true, name: 'Participant_roomId_devicePubKey_unique' }
    );
    console.log('[DB Setup] Ensured compound unique indexes on Participant');

    // 3. Ensure lastActivityAt index on Room
    const roomCollection = db.collection('Room');
    await roomCollection.createIndex(
      { lastActivityAt: 1 },
      { name: 'Room_lastActivityAt_idx' }
    );
    console.log('[DB Setup] Ensured index on Room.lastActivityAt');

    console.log('[DB Setup] Native MongoDB indexing complete.');
  } catch (error) {
    console.error('[DB Setup] Error creating native MongoDB indexes:', error);
  } finally {
    await client.close();
  }
}

export async function runMigration(targetUrl?: string) {
  const url = targetUrl || process.env.DATABASE_URL;
  if (!url) {
    console.warn('[Migration] DATABASE_URL is not defined in environment. Skipping migration.');
    return;
  }

  console.log('[Migration] Applying migration: 20261011000000_init_rooms_participants_messages...');
  const client = new MongoClient(url);

  try {
    await client.connect();
    const db = client.db();

    // Ensure collections exist
    const existingCollections = await db.listCollections().toArray();
    const collectionNames = new Set(existingCollections.map((c) => c.name));

    if (!collectionNames.has('Room')) {
      await db.createCollection('Room');
      console.log('[Migration] Created collection: Room');
    }

    if (!collectionNames.has('Participant')) {
      await db.createCollection('Participant');
      console.log('[Migration] Created collection: Participant');
    }

    if (!collectionNames.has('Message')) {
      await db.createCollection('Message');
      console.log('[Migration] Created collection: Message');
    }

    // Configure native indexes
    await setupMongoIndexes(url);

    console.log('[Migration] Migration 20261011000000_init_rooms_participants_messages successfully applied!');
  } finally {
    await client.close();
  }
}
