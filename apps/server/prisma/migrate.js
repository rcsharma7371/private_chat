import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { setupMongoIndexes } from './seed.js';
dotenv.config();
export async function runMigration() {
    const url = process.env.DATABASE_URL;
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
        // Apply native schema constraints and indexes
        await setupMongoIndexes();
        console.log('[Migration] Migration 20261011000000_init_rooms_participants_messages successfully applied!');
    }
    catch (error) {
        console.error('[Migration Error] Failed to run migration:', error);
        throw error;
    }
    finally {
        await client.close();
    }
}
if (process.argv[1] && process.argv[1].includes('migrate.ts')) {
    runMigration()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
//# sourceMappingURL=migrate.js.map