/**
 * `npm run gmail:auth` — one-time Google OAuth (desktop-app loopback flow).
 * SPEC §8: requests ONLY https://www.googleapis.com/auth/gmail.readonly and
 * caches the token at secrets/token.json. Never request send/modify scopes.
 */
import fs from "node:fs";
import path from "node:path";
import { authenticate } from "@google-cloud/local-auth";
import { config } from "../lib/config";
import { GMAIL_SCOPES, getGmailClient } from "../lib/gmail";

async function main() {
  const credPath = path.resolve(process.cwd(), config.googleCredentialsPath);
  const tokenPath = path.resolve(process.cwd(), config.googleTokenPath);

  if (!fs.existsSync(credPath)) {
    console.error(`Missing ${credPath}.\n\nOne-time setup (SPEC §8):\n` +
      `  1. console.cloud.google.com → new project → enable the Gmail API\n` +
      `  2. OAuth consent screen → External → add your address as a test user → publishing status "In production"\n` +
      `  3. Credentials → OAuth client ID → type "Desktop app" → download JSON → save as ${config.googleCredentialsPath}\n` +
      `  4. re-run: npm run gmail:auth`);
    process.exit(1);
  }

  console.log(`Requesting scope: ${GMAIL_SCOPES.join(", ")} (read-only)`);
  const client = await authenticate({ scopes: [...GMAIL_SCOPES], keyfilePath: credPath });

  const keys = JSON.parse(fs.readFileSync(credPath, "utf8"));
  const key = keys.installed ?? keys.web;
  if (!key) throw new Error("credentials.json has neither 'installed' nor 'web' section — download a Desktop app client.");
  if (!client.credentials.refresh_token) {
    console.warn("Warning: no refresh_token returned. Revoke the app at myaccount.google.com/permissions and re-run so Google issues one.");
  }
  const payload = {
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  };
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(payload, null, 2), { mode: 0o600 });

  // Verify using the saved token (the same path the app uses).
  const gmail = getGmailClient();
  const profile = await gmail.users.getProfile({ userId: "me" });
  console.log(`Connected as ${profile.data.emailAddress} (historyId ${profile.data.historyId}). Token saved to ${config.googleTokenPath}.`);
}

main().catch((err) => {
  console.error("gmail:auth failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
