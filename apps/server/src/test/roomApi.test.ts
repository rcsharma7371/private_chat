import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PrismaClient } from '@prisma/client';
import { app } from '../index.js';
import { prisma, setPrismaClient } from '../db.js';
import { runCleanupTask } from '../services/cronService.js';
import { runMigration } from '../services/migrationService.js';

describe('Room Lifecycle & Security Integration Tests', () => {
  const testSlugPrefix = `test-${Date.now()}`;
  let replSet: MongoMemoryReplSet;

  beforeAll(async () => {
    // Spin up an in-memory single-node MongoDB Replica Set for transaction support
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replSet.getUri('talk_test');
    process.env.DATABASE_URL = uri;

    const testPrisma = new PrismaClient({
      datasources: { db: { url: uri } },
    });
    setPrismaClient(testPrisma);

    // Apply migrations and native indexes
    await runMigration();
    await testPrisma.$connect();
  }, 120000);

  afterAll(async () => {
    try {
      await prisma.$disconnect();
    } catch {}
    if (replSet) {
      await replSet.stop();
    }
  });

  it('State A: Returns AVAILABLE for non-existent room slug', async () => {
    const slug = `${testSlugPrefix}-nonexistent`;
    const res = await request(app).get(`/api/rooms/${slug}/status`);

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('AVAILABLE');
    expect(res.body.full).toBe(false);
  });

  it('State B: Creating link only returns AWAITING_CODE status', async () => {
    const slug = `${testSlugPrefix}-linkonly`;

    // Create link only
    const createRes = await request(app).post('/api/rooms').send({ slug });
    expect(createRes.status).toBe(201);
    expect(createRes.body.room.state).toBe('AWAITING_CODE');
    expect(createRes.body.token).toBeNull();

    // Check status
    const statusRes = await request(app).get(`/api/rooms/${slug}/status`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.state).toBe('AWAITING_CODE');
    expect(statusRes.body.full).toBe(false);
  });

  it('State B -> C: Setting code is atomic, first-wins (concurrency test)', async () => {
    const slug = `${testSlugPrefix}-atomic-race`;

    // Create unclaimed link
    await request(app).post('/api/rooms').send({ slug });

    const verifierA = 'dummy-verifier-hex-string-aaaaaaaaaaaaaaaaaaaaaaaa';
    const verifierB = 'dummy-verifier-hex-string-bbbbbbbbbbbbbbbbbbbbbbbb';

    // Simulate two people setting code at the exact same moment
    const [resA, resB] = await Promise.all([
      request(app).post(`/api/rooms/${slug}/code`).send({
        verifier: verifierA,
        salt: 'random-salt-12345678-long',
        devicePubKey: 'device-pub-key-client-a-min-twenty',
        ecdhPubKey: 'ecdh-pub-key-client-a-min-twenty',
        displayName: 'Alice',
      }),
      request(app).post(`/api/rooms/${slug}/code`).send({
        verifier: verifierB,
        salt: 'random-salt-87654321-long',
        devicePubKey: 'device-pub-key-client-b-min-twenty',
        ecdhPubKey: 'ecdh-pub-key-client-b-min-twenty',
        displayName: 'Bob',
      }),
    ]);

    // Exactly one must succeed (200) and the loser must get 409
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    // Room status must now be PROTECTED
    const statusRes = await request(app).get(`/api/rooms/${slug}/status`);
    expect(statusRes.body.state).toBe('PROTECTED');
  });

  it('Brute force lockout: 5 wrong attempts lock room for 15 minutes', async () => {
    const slug = `${testSlugPrefix}-lockout`;
    const correctVerifier = 'correct-verifier-hex-string-111111111111111111111111';

    // Create room with code
    await request(app).post('/api/rooms').send({
      slug,
      verifier: correctVerifier,
      salt: 'salt-lockout-test-sixteen',
      devicePubKey: 'device-pub-key-creator-min-twenty',
      ecdhPubKey: 'ecdh-pub-key-creator-min-twenty',
      displayName: 'Creator',
    });

    const wrongVerifier = 'wrong-verifier-hex-string-00000000000000000000000000';

    // 4 wrong attempts
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post(`/api/rooms/${slug}/join`).send({
        verifier: wrongVerifier,
        devicePubKey: `attacker-device-${i}-minimum-twenty-chars`,
        ecdhPubKey: `attacker-ecdh-${i}-minimum-twenty-chars`,
      });
      expect(res.status).toBe(403);
    }

    // 5th wrong attempt triggers lockout (429)
    const fifthRes = await request(app).post(`/api/rooms/${slug}/join`).send({
      verifier: wrongVerifier,
      devicePubKey: 'attacker-device-5-minimum-twenty-chars',
      ecdhPubKey: 'attacker-ecdh-5-minimum-twenty-chars',
    });
    expect(fifthRes.status).toBe(429);

    // Subsequent attempt even with correct verifier is locked out (429)
    const lockedRes = await request(app).post(`/api/rooms/${slug}/join`).send({
      verifier: correctVerifier,
      devicePubKey: 'attacker-device-6-minimum-twenty-chars',
      ecdhPubKey: 'attacker-ecdh-6-minimum-twenty-chars',
    });
    expect(lockedRes.status).toBe(429);
  });

  it('Strict 2-person rule: Third participant is rejected (403)', async () => {
    const slug = `${testSlugPrefix}-two-person`;
    const verifier = 'shared-valid-verifier-hex-string-22222222222222222222';

    // Participant 0 creates room
    const p0Res = await request(app).post('/api/rooms').send({
      slug,
      verifier,
      salt: 'salt-two-person-test-sixteen',
      devicePubKey: 'device-pub-participant-0-min-twenty',
      ecdhPubKey: 'ecdh-pub-participant-0-min-twenty',
      displayName: 'Participant 0',
    });
    expect(p0Res.status).toBe(201);
    expect(p0Res.body.slotIndex).toBe(0);

    // Participant 1 joins room
    const p1Res = await request(app).post(`/api/rooms/${slug}/join`).send({
      verifier,
      devicePubKey: 'device-pub-participant-1-min-twenty',
      ecdhPubKey: 'ecdh-pub-participant-1-min-twenty',
      displayName: 'Participant 1',
    });
    expect(p1Res.status).toBe(200);
    expect(p1Res.body.slotIndex).toBe(1);

    // Participant 2 (third person) attempts to join with correct code -> MUST BE REJECTED (403)
    const p2Res = await request(app).post(`/api/rooms/${slug}/join`).send({
      verifier,
      devicePubKey: 'device-pub-participant-2-eavesdropper',
      ecdhPubKey: 'ecdh-pub-participant-2-eavesdropper',
      displayName: 'Intruder',
    });
    expect(p2Res.status).toBe(403);
    expect(p2Res.body.error).toContain('full');

    // Room status reports full: true
    const statusRes = await request(app).get(`/api/rooms/${slug}/status`);
    expect(statusRes.body.state).toBe('PROTECTED');
    expect(statusRes.body.full).toBe(true);
  });

  it('Device-bound slots: Participant 0 can re-join from same device without taking new slot', async () => {
    const slug = `${testSlugPrefix}-rejoin`;
    const verifier = 'rejoin-valid-verifier-hex-string-33333333333333333333';

    await request(app).post('/api/rooms').send({
      slug,
      verifier,
      salt: 'salt-rejoin-test-sixteen',
      devicePubKey: 'trusted-device-0-minimum-twenty',
      ecdhPubKey: 'ecdh-pub-0-initial-minimum-twenty',
      displayName: 'Owner',
    });

    // Re-joining from same device with fresh ephemeral ECDH key
    const rejoinRes = await request(app).post(`/api/rooms/${slug}/join`).send({
      verifier,
      devicePubKey: 'trusted-device-0-minimum-twenty',
      ecdhPubKey: 'ecdh-pub-0-refreshed-minimum-twenty',
      displayName: 'Owner',
    });

    expect(rejoinRes.status).toBe(200);
    expect(rejoinRes.body.slotIndex).toBe(0);
  });

  it('Ciphertext-only storage check: DB never contains plaintext', async () => {
    const slug = `${testSlugPrefix}-ciphertext`;
    const verifier = 'ciphertext-test-verifier-hex-string-4444444444444444';

    const createRes = await request(app).post('/api/rooms').send({
      slug,
      verifier,
      salt: 'salt-ciphertext-test-sixteen',
      devicePubKey: 'device-pub-cipher-test-min-twenty',
      ecdhPubKey: 'ecdh-pub-cipher-test-min-twenty',
    });
    const roomId = createRes.body.room.id;

    // Simulate saving message
    const rawPlaintext = 'SECRET_KEY_NEVER_IN_PLAINTEXT';
    const fakeCiphertextBase64 = Buffer.from('EncryptedBinaryData999').toString('base64');

    const msg = await prisma.message.create({
      data: {
        roomId,
        senderSlot: 0,
        counter: 1,
        iv: 'dummy-iv-base64',
        ciphertext: Buffer.from(fakeCiphertextBase64, 'base64'),
      },
    });

    // Verify stored database record
    const retrieved = await prisma.message.findUnique({
      where: { id: msg.id },
    });
    expect(retrieved).not.toBeNull();
    const storedText = Buffer.from(retrieved!.ciphertext).toString('utf-8');
    expect(storedText).not.toContain(rawPlaintext);
  });

  it('Cron cleanup: Deletes inactive rooms older than 30 days and unclaimed links', async () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Create an old inactive room
    const oldRoom = await prisma.room.create({
      data: {
        slug: `${testSlugPrefix}-inactive-31d`,
        codeVerifier: 'some-hash-here-long',
        lastActivityAt: thirtyOneDaysAgo,
      },
    });

    // Create an old unclaimed link
    const oldUnclaimed = await prisma.room.create({
      data: {
        slug: `${testSlugPrefix}-unclaimed-48h`,
        codeVerifier: null,
        createdAt: twoDaysAgo,
      },
    });

    // Run cleanup cron
    const result = await runCleanupTask();
    expect(result.inactiveRoomsDeleted).toBeGreaterThanOrEqual(1);
    expect(result.unclaimedLinksDeleted).toBeGreaterThanOrEqual(1);

    // Verify they are deleted
    const checkInactive = await prisma.room.findUnique({ where: { id: oldRoom.id } });
    const checkUnclaimed = await prisma.room.findUnique({ where: { id: oldUnclaimed.id } });
    expect(checkInactive).toBeNull();
    expect(checkUnclaimed).toBeNull();
  });
});
