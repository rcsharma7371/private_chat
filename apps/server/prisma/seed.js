import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();
export async function setupMongoIndexes() {
    const url = process.env.DATABASE_URL;
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
        await messageCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true, name: 'Message_expiresAt_TTL' });
        console.log('[DB Setup] Ensured TTL index on Message.expiresAt');
        // 2. Ensure compound indexes for Participant
        const participantCollection = db.collection('Participant');
        await participantCollection.createIndex({ roomId: 1, slotIndex: 1 }, { unique: true, name: 'Participant_roomId_slotIndex_unique' });
        await participantCollection.createIndex({ roomId: 1, devicePubKey: 1 }, { unique: true, name: 'Participant_roomId_devicePubKey_unique' });
        console.log('[DB Setup] Ensured compound unique indexes on Participant');
        // 3. Ensure lastActivityAt index on Room
        const roomCollection = db.collection('Room');
        await roomCollection.createIndex({ lastActivityAt: 1 }, { name: 'Room_lastActivityAt_idx' });
        console.log('[DB Setup] Ensured index on Room.lastActivityAt');
        console.log('[DB Setup] Native MongoDB indexing complete.');
    }
    catch (error) {
        console.error('[DB Setup] Error creating native MongoDB indexes:', error);
    }
    finally {
        await client.close();
    }
}
if (process.argv[1] && process.argv[1].includes('seed.ts')) {
    setupMongoIndexes()
        .then(() => process.exit(0))
        .catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=seed.js.map