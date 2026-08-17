/**
 * Gmail access (SPEC §8). Read-only scope, token cached by scripts/gmail-auth.ts.
 * Sync algorithm helpers: incremental history.list with messages.list fallback,
 * idempotent fetch of full message bodies, HTML → text.
 */
import fs from "node:fs";
import path from "node:path";
import { google, type gmail_v1 } from "googleapis";
import { htmlToText } from "html-to-text";
import { config } from "./config";

/** The ONLY scope this app ever requests (hard rule 1). */
export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"] as const;

export const FALLBACK_QUERY = "newer_than:60d -in:chats";
const MAX_FALLBACK_MESSAGES = 500;

export type FetchedEmail = {
  id: string;
  threadId: string | null;
  fromAddr: string;
  subject: string;
  receivedAt: string;
  bodyText: string;
};

export type GmailStatus = {
  credentialsPresent: boolean;
  tokenPresent: boolean;
  credentialsPath: string;
  tokenPath: string;
};

export function gmailStatus(): GmailStatus {
  const credentialsPath = path.resolve(process.cwd(), config.googleCredentialsPath);
  const tokenPath = path.resolve(process.cwd(), config.googleTokenPath);
  return {
    credentialsPresent: fs.existsSync(credentialsPath),
    tokenPresent: fs.existsSync(tokenPath),
    credentialsPath: config.googleCredentialsPath,
    tokenPath: config.googleTokenPath,
  };
}

export function hasGmailToken(): boolean {
  return gmailStatus().tokenPresent;
}

export function getGmailClient(): gmail_v1.Gmail {
  const tokenPath = path.resolve(process.cwd(), config.googleTokenPath);
  const raw = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
  const auth = google.auth.fromJSON(raw);
  return google.gmail({ version: "v1", auth: auth as Parameters<typeof google.gmail>[0]["auth"] });
}

export async function currentHistoryId(gmail: gmail_v1.Gmail): Promise<string | null> {
  const profile = await gmail.users.getProfile({ userId: "me" });
  return profile.data.historyId ? String(profile.data.historyId) : null;
}

export type ListResult = { ids: string[]; mode: "history" | "full"; historyId: string | null };

/**
 * New message ids since `startHistoryId` via users.history.list; on 404 /
 * expired history (or no start id) fall back to users.messages.list(FALLBACK_QUERY).
 */
export async function listNewMessageIds(gmail: gmail_v1.Gmail, startHistoryId: string | null): Promise<ListResult> {
  const historyId = await currentHistoryId(gmail);
  if (startHistoryId) {
    try {
      const ids = new Set<string>();
      let pageToken: string | undefined;
      do {
        const res = await gmail.users.history.list({
          userId: "me",
          startHistoryId,
          historyTypes: ["messageAdded"],
          pageToken,
          maxResults: 500,
        });
        for (const h of res.data.history ?? []) {
          for (const m of h.messagesAdded ?? []) if (m.message?.id) ids.add(m.message.id);
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return { ids: [...ids], mode: "history", historyId };
    } catch (err) {
      const status = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
      if (status !== 404) throw err;
      console.warn("[gmail] history expired (404); falling back to a full 60-day listing");
    }
  }
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({ userId: "me", q: FALLBACK_QUERY, maxResults: 100, pageToken });
    for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < MAX_FALLBACK_MESSAGES);
  return { ids, mode: "full", historyId };
}

function header(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBody(data: string | null | undefined): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Depth-first: prefer text/plain, else text/html converted to text. */
export function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  let plain = "";
  let html = "";
  const walk = (part: gmail_v1.Schema$MessagePart) => {
    const mime = part.mimeType ?? "";
    if (mime === "text/plain" && part.body?.data && !plain) plain = decodeBody(part.body.data);
    else if (mime === "text/html" && part.body?.data && !html) html = decodeBody(part.body.data);
    for (const p of part.parts ?? []) walk(p);
  };
  walk(payload);
  if (plain.trim()) return normaliseText(plain);
  if (html.trim()) return normaliseText(htmlToText(html, { wordwrap: false, selectors: [{ selector: "a", options: { ignoreHref: true } }, { selector: "img", format: "skip" }] }));
  return "";
}

export function normaliseText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t\u00a0]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function fetchMessage(gmail: gmail_v1.Gmail, id: string): Promise<FetchedEmail | null> {
  const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const msg = res.data;
  if (!msg.id) return null;
  const headers = msg.payload?.headers;
  const receivedAt = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString();
  return {
    id: msg.id,
    threadId: msg.threadId ?? null,
    fromAddr: header(headers, "From"),
    subject: header(headers, "Subject"),
    receivedAt,
    bodyText: extractBody(msg.payload).slice(0, 20_000),
  };
}
