import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { config } from "@/lib/config";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  const rows: Array<[string, string]> = [
    ["POLL_MINUTES", String(config.pollMinutes)],
    ["AUTO_APPLY_CONFIDENCE", String(config.autoApplyConfidence)],
    ["PLAN_THRESHOLD", String(config.planThreshold)],
    ["GHOST_DAYS", String(config.ghostDays)],
    ["ANTHROPIC_API_KEY", config.anthropicApiKey ? "set" : "not set"],
    ["GOOGLE_CREDENTIALS_PATH", config.googleCredentialsPath],
  ];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Thresholds and integrations. Values come from .env for now.</p>
      </div>
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
