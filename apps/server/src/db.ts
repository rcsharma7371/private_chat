import { PrismaClient } from '@prisma/client';
import { MongoClient } from 'mongodb';
import { runMigration } from './services/migrationService.js';

export let prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: process.env.DATABASE_URL
    ? { db: { url: process.env.DATABASE_URL } }
    : undefined,
});

export function setPrismaClient(client: PrismaClient) {
  prisma = client;
}

let devReplSet: { stop: () => Promise<boolean> } | null = null;

export async function connectDB() {
  const url = process.env.DATABASE_URL;

  if (process.env.NODE_ENV === 'development' && url) {
    let isReplicaSet = false;
    try {
      const client = new MongoClient(url, { serverSelectionTimeoutMS: 2000 });
      await client.connect();
      try {
        await client.db('admin').command({ replSetGetStatus: 1 });
        isReplicaSet = true;
      } catch {
        isReplicaSet = false;
      } finally {
        await client.close();
      }
    } catch {
      isReplicaSet = false;
    }

    if (!isReplicaSet) {
      console.warn('[DB] Configured MongoDB is not running as a replica set.');
      console.log('[DB] Initializing local Replica Set for transaction support...');
      const { MongoMemoryReplSet } = await import('mongodb-memory-server');
      const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      devReplSet = replSet;
      const devUri = replSet.getUri('talk_dev');
      process.env.DATABASE_URL = devUri;
      setPrismaClient(
        new PrismaClient({
          log: ['warn', 'error'],
          datasources: { db: { url: devUri } },
        })
      );
      await runMigration(devUri);
      console.log(`[DB] Local Replica Set ready at: ${devUri}`);
    }
  }

  await prisma.$connect();
}

export async function disconnectDB() {
  await prisma.$disconnect();
  if (devReplSet) {
    await devReplSet.stop();
    devReplSet = null;
  }
}
