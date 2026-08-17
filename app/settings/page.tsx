import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { config } from "@/lib/config";
import { getKv } from "@/lib/emails";
import { fmtDateTime } from "@/lib/format";
import { gmailStatus } from "@/lib/gmail";
import { KV_LAST_HISTORY_ID, KV_LAST_SYNC_AT, KV_LAST_SYNC_SUMMARY } from "@/lib/sync";

export const metadata: Metadata = { title: "Settings" };

function Row({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 font-mono text-xs text-muted-foreground">{k}</dt>
      <dd className={mono ? "max-w-[22rem] break-all text-right font-mono text-[11px]" : "text-right text-xs"}>{v}</dd>
    </div>
  );
}

export default function SettingsPage() {
  const rows: Array<[string, string]> = [
    ["POLL_MINUTES", String(config.pollMinutes)],
    ["AUTO_APPLY_CONFIDENCE", String(config.autoApplyConfidence)],
    ["PLAN_THRESHOLD", String(config.planThreshold)],
    ["GHOST_DAYS", String(config.ghostDays)],
    ["ANTHROPIC_API_KEY", config.anthropicApiKey ? "set" : "not set"],
    ["GOOGLE_CREDENTIALS_PATH", config.googleCredentialsPath],
  ];
  const gmail = gmailStatus();
  const lastSync = getKv(KV_LAST_SYNC_AT);
  const lastHistory = getKv(KV_LAST_HISTORY_ID);
  const lastSummary = getKv(KV_LAST_SYNC_SUMMARY);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Thresholds and integrations. Values come from .env for now.</p>
      </div>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Gmail connection</CardTitle>
          <CardDescription>Read-only scope (gmail.readonly). Token cached locally in secrets/.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border text-sm">
            <Row k="credentials.json" v={gmail.credentialsPresent ? `found (${gmail.credentialsPath})` : `missing — save your Desktop-app OAuth client JSON to ${gmail.credentialsPath}`} />
            <Row k="token.json" v={gmail.tokenPresent ? "connected" : "not connected — run npm run gmail:auth"} />
            <Row k="last sync" v={lastSync ? fmtDateTime(lastSync) : "never"} />
            <Row k="last history id" v={lastHistory ?? "—"} />
            <Row k="last run" v={lastSummary ?? "—"} mono />
          </dl>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Current configuration</CardTitle>
          <CardDescription>Edit .env and restart the app to change these.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2">
                <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                <dd className="font-mono text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
