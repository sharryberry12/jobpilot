"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { extractRequirements } from "@/lib/ai/jd";
import { normaliseResumeText } from "@/lib/ai/resume";
import { tailorResume } from "@/lib/ai/tailor";
import { getApplication } from "@/lib/applications";
import { hasApiKey } from "@/lib/claude";
import { renderResumeDocx } from "@/lib/docx";
import { extractResumeText } from "@/lib/parseResume";
import { normaliseProfile, tailoredProfileSchema, type MasterProfile } from "@/lib/profile";
import {
  approveResumeVersion,
  createResumeVersion,
  deleteResumeVersion,
  getMasterProfile,
  getRequirements,
  getResumeVersion,
  refreshAllFits,
  refreshFit,
  saveMasterProfile,
  saveRequirements,
  updateResumeVersion,
} from "@/lib/resume";
import { validateTailored, type ValidationError } from "@/lib/validate";
import { idSchema } from "@/lib/validation";

type Fail = { ok: false; error: string };

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export type UploadResult =
  | { ok: true; draft: MasterProfile; sourceFilename: string; textPreview: string; chars: number }
  | Fail;

/** Step 1 of upload: parse + normalise. Nothing is saved until the user confirms the draft. */
export async function uploadResumeAction(formData: FormData): Promise<UploadResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a PDF, DOCX or TXT file first." };
  if (!hasApiKey()) return { ok: false, error: "ANTHROPIC_API_KEY is not set — add it to .env and restart." };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await extractResumeText(buffer, file.name, file.type);
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const safeName = `${Date.now()}_${path.basename(file.name).replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
    await fs.writeFile(path.join(UPLOAD_DIR, safeName), buffer);

    const result = await normaliseResumeText(parsed.text);
    if (!result.ok) return { ok: false, error: `Could not normalise the resume: ${result.error}` };
    return {
      ok: true,
      draft: result.data,
      sourceFilename: file.name,
      textPreview: parsed.text.slice(0, 1200),
      chars: parsed.text.length,
    };
  } catch (err) {
    console.error("[uploadResume]", err);
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }
}

/** Save (or replace) the singleton master profile and recompute fit for open applications. */
export async function saveMasterProfileAction(
  profileJson: string,
  sourceFilename?: string | null,
): Promise<{ ok: true; recomputed: number } | Fail> {
  let input: unknown;
  try {
    input = JSON.parse(profileJson);
  } catch {
    return { ok: false, error: "Profile payload was not valid JSON." };
  }
  try {
    normaliseProfile(input); // throws on shape errors before we touch the DB
    saveMasterProfile(input, sourceFilename !== undefined ? { sourceFilename } : {});
    const recomputed = refreshAllFits();
    revalidatePath("/resume");
    revalidatePath("/");
    return { ok: true, recomputed };
  } catch (err) {
    console.error("[saveMasterProfile]", err);
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the profile." };
  }
}

/** Run (or re-run) JD extraction for an application, then refresh its fit. */
export async function extractRequirementsAction(applicationId: string): Promise<{ ok: true; fitScore: number | null } | Fail> {
  const id = idSchema.safeParse(applicationId);
  if (!id.success) return { ok: false, error: "Invalid application id" };
  const app = getApplication(id.data);
  if (!app) return { ok: false, error: "Application not found" };
  const master = getMasterProfile();
  const result = await extractRequirements(app.jdText, master?.profile ?? null);
  if (!result.ok) return { ok: false, error: result.error };
  saveRequirements(app.id, result.data);
  const fit = refreshFit(app.id);
  revalidatePath(`/applications/${app.id}`);
  revalidatePath("/");
  return { ok: true, fitScore: fit?.score ?? null };
}

export async function refreshFitAction(applicationId: string): Promise<{ ok: true; fitScore: number | null } | Fail> {
  const id = idSchema.safeParse(applicationId);
  if (!id.success) return { ok: false, error: "Invalid application id" };
  const fit = refreshFit(id.data);
  revalidatePath(`/applications/${id.data}`);
  revalidatePath("/");
  return { ok: true, fitScore: fit?.score ?? null };
}

export type TailorActionResult =
  | { ok: true; versionId: string; attempts: number }
  | { ok: false; error: string; validationErrors?: ValidationError[] };

/** Generate a tailored resume version for an application (extracting requirements first if needed). */
export async function tailorResumeAction(applicationId: string): Promise<TailorActionResult> {
  const id = idSchema.safeParse(applicationId);
  if (!id.success) return { ok: false, error: "Invalid application id" };
  const app = getApplication(id.data);
  if (!app) return { ok: false, error: "Application not found" };
  const master = getMasterProfile();
  if (!master) return { ok: false, error: "Upload your master resume first (Resume page)." };

  let reqs = getRequirements(app.id);
  if (!reqs) {
    const extracted = await extractRequirements(app.jdText, master.profile);
    if (!extracted.ok) return { ok: false, error: `Requirement extraction failed: ${extracted.error}` };
    reqs = extracted.data;
    saveRequirements(app.id, reqs);
    refreshFit(app.id);
  }

  const outcome = await tailorResume(master.profile, reqs, { company: app.company, roleTitle: app.roleTitle });
  if (!outcome.ok) {
    return { ok: false, error: outcome.error, validationErrors: outcome.validationErrors };
  }
  const version = createResumeVersion(app.id, outcome.tailored);
  revalidatePath(`/applications/${app.id}`);
  return { ok: true, versionId: version.id, attempts: outcome.attempts };
}

/** Persist per-bullet accept/reject edits. Re-validated against the master profile. */
export async function updateResumeVersionAction(
  versionId: string,
  tailoredJson: string,
): Promise<{ ok: true } | { ok: false; error: string; validationErrors?: ValidationError[] }> {
  const id = idSchema.safeParse(versionId);
  if (!id.success) return { ok: false, error: "Invalid version id" };
  const existing = getResumeVersion(id.data);
  if (!existing) return { ok: false, error: "Resume version not found" };
  if (existing.approved) return { ok: false, error: "Approved versions are frozen. Generate a new one to change it." };
  const master = getMasterProfile();
  if (!master) return { ok: false, error: "Master profile missing" };
  let tailored;
  try {
    tailored = tailoredProfileSchema.parse(JSON.parse(tailoredJson));
  } catch (err) {
    return { ok: false, error: `Invalid tailored payload: ${err instanceof Error ? err.message : String(err)}` };
  }
  const validation = validateTailored(master.profile, tailored);
  if (!validation.ok) return { ok: false, error: "Edits failed the no-fabrication check.", validationErrors: validation.errors };
  updateResumeVersion(id.data, tailored);
  revalidatePath(`/applications/${existing.applicationId}`);
  return { ok: true };
}

/** Approve: re-validate, render DOCX to data/out, link as the application's resume version. */
export async function approveResumeVersionAction(
  versionId: string,
): Promise<{ ok: true; docxPath: string } | { ok: false; error: string; validationErrors?: ValidationError[] }> {
  const id = idSchema.safeParse(versionId);
  if (!id.success) return { ok: false, error: "Invalid version id" };
  const version = getResumeVersion(id.data);
  if (!version) return { ok: false, error: "Resume version not found" };
  const app = getApplication(version.applicationId);
  const master = getMasterProfile();
  if (!app || !master) return { ok: false, error: "Application or master profile missing" };
  const validation = validateTailored(master.profile, version.tailored);
  if (!validation.ok) return { ok: false, error: "This version no longer passes the no-fabrication check.", validationErrors: validation.errors };
  try {
    const docxPath = await renderResumeDocx(master.profile, version.tailored, {
      company: app.company,
      roleTitle: app.roleTitle,
      versionId: version.id,
    });
    approveResumeVersion(version.id, docxPath);
    revalidatePath(`/applications/${app.id}`);
    revalidatePath("/");
    return { ok: true, docxPath };
  } catch (err) {
    console.error("[approveResumeVersion]", err);
    return { ok: false, error: err instanceof Error ? err.message : "Could not render the DOCX." };
  }
}

export async function deleteResumeVersionAction(versionId: string): Promise<{ ok: boolean; error?: string }> {
  const id = idSchema.safeParse(versionId);
  if (!id.success) return { ok: false, error: "Invalid version id" };
  const version = getResumeVersion(id.data);
  if (!version) return { ok: false, error: "Not found" };
  if (version.docxPath) {
    await fs.rm(path.join(process.cwd(), version.docxPath), { force: true }).catch(() => undefined);
  }
  deleteResumeVersion(id.data);
  revalidatePath(`/applications/${version.applicationId}`);
  return { ok: true };
}
