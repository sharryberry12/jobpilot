import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings-form";
import { hasApiKey, isMockMode, MODELS } from "@/lib/claude";
import { getKv } from "@/lib/emails";
import { fmtDateTime } from "@/lib/format";
import { gmailStatus } from "@/lib/gmail";
import { KV_LAST_HISTORY_ID, KV_LAST_SYNC_AT, KV_LAST_SYNC_SUMMARY } from "@/lib/sync";
import { getSettings } from "@/lib/settings";

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
  const gmail = gmailStatus();
  const lastSync = getKv(KV_LAST_SYNC_AT);
  const lastHistory = getKv(KV_LAST_HISTORY_ID);
  const lastSummary = getKv(KV_LAST_SYNC_SUMMARY);
  const settings = getSettings();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Thresholds, integrations and notifications. .env supplies the defaults; values saved here override them.</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Thresholds & notifications</CardTitle>
          <CardDescription>Applied on the next sync — no restart needed.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm settings={settings} />
        </CardContent>
      </Card>
      <Card className="max-w-3xl">
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

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>AI</CardTitle>
          <CardDescription>Models come from .env (CLAUDE_FAST_MODEL / CLAUDE_SMART_MODEL).</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border text-sm">
            <Row k="ANTHROPIC_API_KEY" v={hasApiKey() && !isMockMode() ? "set" : isMockMode() ? "mock mode (JOBPILOT_MOCK_AI=1)" : "not set"} />
            <Row k="classification / extraction" v={MODELS.fast} />
            <Row k="tailoring / plans" v={MODELS.smart} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
