import cron from 'node-cron';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { runInteractiveTx } from './roomService.js';

export async function runCleanupTask(): Promise<{
  inactiveRoomsDeleted: number;
  unclaimedLinksDeleted: number;
  expiredMessagesDeleted: number;
}> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let unclaimedLinksDeleted = 0;
  let inactiveRoomsDeleted = 0;
  let expiredMessagesDeleted = 0;

  try {
    // 1. Delete unclaimed links (codeVerifier is null) older than UNCLAIMED_LINK_TTL_HOURS
    if (config.UNCLAIMED_LINK_TTL_HOURS > 0) {
      const unclaimedThreshold = new Date(
        now.getTime() - config.UNCLAIMED_LINK_TTL_HOURS * 60 * 60 * 1000
      );

      const unclaimedRooms = await prisma.room.findMany({
        where: {
          codeVerifier: null,
          createdAt: { lt: unclaimedThreshold },
        },
        select: { id: true },
      });

      if (unclaimedRooms.length > 0) {
        const unclaimedIds = unclaimedRooms.map((r) => r.id);
        await runInteractiveTx(async (tx) => {
          await tx.message.deleteMany({ where: { roomId: { in: unclaimedIds } } });
          await tx.participant.deleteMany({ where: { roomId: { in: unclaimedIds } } });
          const res = await tx.room.deleteMany({ where: { id: { in: unclaimedIds } } });
          unclaimedLinksDeleted = res.count;
        });
      }
    }

    // 2. Delete rooms inactive for > 30 days
    const inactiveRooms = await prisma.room.findMany({
      where: {
        lastActivityAt: { lt: thirtyDaysAgo },
      },
      select: { id: true },
    });

    if (inactiveRooms.length > 0) {
      const inactiveIds = inactiveRooms.map((r) => r.id);
      await runInteractiveTx(async (tx) => {
        await tx.message.deleteMany({ where: { roomId: { in: inactiveIds } } });
        await tx.participant.deleteMany({ where: { roomId: { in: inactiveIds } } });
        const res = await tx.room.deleteMany({ where: { id: { in: inactiveIds } } });
        inactiveRoomsDeleted = res.count;
      });
    }

    // 3. Purge expired disappearing messages
    const expiredRes = await prisma.message.deleteMany({
      where: {
        expiresAt: { lte: now },
      },
    });
    expiredMessagesDeleted = expiredRes.count;

    if (inactiveRoomsDeleted > 0 || unclaimedLinksDeleted > 0 || expiredMessagesDeleted > 0) {
      console.log(
        `[Cron Cleanup] Inactive rooms: ${inactiveRoomsDeleted}, Unclaimed links: ${unclaimedLinksDeleted}, Expired msgs: ${expiredMessagesDeleted}`
      );
    }
  } catch (error) {
    console.error('[Cron Cleanup Error]', error);
  }

  return {
    inactiveRoomsDeleted,
    unclaimedLinksDeleted,
    expiredMessagesDeleted,
  };
}

export function initCronJobs() {
  console.log(`[Cron] Initializing room cleanup cron (${config.INACTIVE_ROOM_CRON})`);

  // Run immediately on boot
  runCleanupTask().catch((err) => console.error('[Cron Boot Error]', err));

  // Schedule recurring cron
  return cron.schedule(config.INACTIVE_ROOM_CRON, async () => {
    await runCleanupTask();
  });
}
