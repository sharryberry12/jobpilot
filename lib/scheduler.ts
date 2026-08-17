/**
 * In-process sync scheduler (SPEC §2): a sync on app boot, on dashboard load
 * when the last run is older than POLL_MINUTES, and on a POLL_MINUTES timer
 * while the app is open. Guarded on globalThis so dev HMR never doubles timers.
 */
import { config } from "./config";
import { getKv } from "./emails";
import { KV_LAST_SYNC_AT, isSyncRunning, runSync } from "./sync";

type SchedulerGlobal = typeof globalThis & { __jobpilotScheduler?: { timer: NodeJS.Timeout; boot: NodeJS.Timeout } };
const g = globalThis as SchedulerGlobal;

const BOOT_DELAY_MS = 5_000;

export function startScheduler(): void {
  if (g.__jobpilotScheduler) return;
  const intervalMs = Math.max(1, config.pollMinutes) * 60_000;
  const boot = setTimeout(() => void runSync({ trigger: "boot" }), BOOT_DELAY_MS);
  const timer = setInterval(() => void runSync({ trigger: "timer" }), intervalMs);
  boot.unref();
  timer.unref();
  g.__jobpilotScheduler = { timer, boot };
  console.log(`[scheduler] sync every ${config.pollMinutes} min; first run in ${BOOT_DELAY_MS / 1000}s`);
}

export function lastSyncAt(): string | null {
  return getKv(KV_LAST_SYNC_AT);
}

/** Fire-and-forget: kick a sync if the last one is older than POLL_MINUTES. Never blocks a page render. */
export function maybeSyncStale(): boolean {
  if (isSyncRunning()) return false;
  const last = lastSyncAt();
  const staleMs = Math.max(1, config.pollMinutes) * 60_000;
  if (last && Date.now() - new Date(last).getTime() < staleMs) return false;
  void runSync({ trigger: "stale-load" });
  return true;
}
