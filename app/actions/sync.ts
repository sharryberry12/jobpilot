"use server";

import { revalidatePath } from "next/cache";
import { runSync, type SyncSummary } from "@/lib/sync";

/** "Sync now" button — runs a full cycle and returns the per-run summary. */
export async function syncNowAction(): Promise<SyncSummary> {
  const summary = await runSync({ trigger: "manual" });
  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath("/leads");
  revalidatePath("/settings");
  return summary;
}
