"use server";

import { revalidatePath } from "next/cache";
import { getLead, setLeadStatus } from "@/lib/leads";
import { idSchema } from "@/lib/validation";

type Result = { ok: true; message: string } | { ok: false; error: string };

function refresh() {
  revalidatePath("/leads");
  revalidatePath("/", "layout"); // nav badge
}

export async function dismissLeadAction(rawId: string): Promise<Result> {
  const id = idSchema.safeParse(rawId);
  if (!id.success) return { ok: false, error: "Invalid lead id." };
  const lead = getLead(id.data);
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.status === "applied") return { ok: false, error: "This lead already has an application." };
  setLeadStatus(id.data, "dismissed");
  refresh();
  return { ok: true, message: `Dismissed ${lead.title} at ${lead.company}.` };
}

export async function restoreLeadAction(rawId: string): Promise<Result> {
  const id = idSchema.safeParse(rawId);
  if (!id.success) return { ok: false, error: "Invalid lead id." };
  const lead = getLead(id.data);
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.status !== "dismissed") return { ok: false, error: "Only dismissed leads can be restored." };
  setLeadStatus(id.data, "new");
  refresh();
  return { ok: true, message: `Restored ${lead.title} at ${lead.company}.` };
}
