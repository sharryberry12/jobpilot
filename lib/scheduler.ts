/**
 * In-process sync scheduler (SPEC §2): a sync on app boot, on dashboard load
 * when the last run is older than POLL_MINUTES, and on a POLL_MINUTES timer
 * while the app is open. Guarded on globalThis so dev HMR never doubles timers.
 * The interval is re-read from settings on every tick, so changes apply live.
 */
import { getKv } from "./emails";
import { maybeSendDailyDigest } from "./notify";
import { getSettings } from "./settings";
import { KV_LAST_SYNC_AT, isSyncRunning, runSync } from "./sync";

type SchedulerGlobal = typeof globalThis & { __jobpilotScheduler?: { timer: NodeJS.Timeout | null; started: boolean } };
const g = globalThis as SchedulerGlobal;

const BOOT_DELAY_MS = 5_000;

function pollMs(): number {
  return Math.max(1, getSettings().pollMinutes) * 60_000;
}

async function tick(trigger: "boot" | "timer"): Promise<void> {
  try {
    await runSync({ trigger });
    await maybeSendDailyDigest();
  } catch (err) {
    console.error("[scheduler] tick failed:", err);
  } finally {
    if (g.__jobpilotScheduler) {
      const t = setTimeout(() => void tick("timer"), pollMs());
      t.unref();
      g.__jobpilotScheduler.timer = t;
    }
  }
}

export function startScheduler(): void {
  if (g.__jobpilotScheduler?.started) return;
  g.__jobpilotScheduler = { timer: null, started: true };
  const boot = setTimeout(() => void tick("boot"), BOOT_DELAY_MS);
  boot.unref();
  g.__jobpilotScheduler.timer = boot;
  console.log(`[scheduler] sync every ${getSettings().pollMinutes} min; first run in ${BOOT_DELAY_MS / 1000}s`);
}

export function lastSyncAt(): string | null {
  return getKv(KV_LAST_SYNC_AT);
}

/** Fire-and-forget: kick a sync if the last one is older than POLL_MINUTES. Never blocks a page render. */
export function maybeSyncStale(): boolean {
  if (isSyncRunning()) return false;
  const last = lastSyncAt();
  if (last && Date.now() - new Date(last).getTime() < pollMs()) return false;
  runSync({ trigger: "stale-load" }).catch((err) => console.error("[scheduler] stale-load sync failed:", err));
  return true;
}
