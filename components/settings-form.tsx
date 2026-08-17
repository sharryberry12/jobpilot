"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { resetSettingsAction, saveSettingsAction, testPushAction, type SettingsFormState } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Settings } from "@/lib/settings";

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveSettingsAction, null as SettingsFormState);
  const [busy, startTransition] = useTransition();
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      {state?.ok && <p className="text-sm text-emerald-700 dark:text-emerald-300">Saved — changes apply to the next sync.</p>}
      {errors._form && <p className="text-sm text-destructive">{errors._form}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Poll interval (minutes)" name="pollMinutes" error={errors.pollMinutes} hint="How often Gmail is synced while the app is open.">
          <Input name="pollMinutes" type="number" min={1} max={1440} defaultValue={settings.pollMinutes} />
        </Field>
        <Field label="Auto-apply confidence" name="autoApplyConfidence" error={errors.autoApplyConfidence} hint="0–1. Below this, emails go to the review queue.">
          <Input name="autoApplyConfidence" type="number" step="0.01" min={0} max={1} defaultValue={settings.autoApplyConfidence} />
        </Field>
        <Field label="Plan threshold (fit score)" name="planThreshold" error={errors.planThreshold} hint="Applications below this fit get a learning plan at create time.">
          <Input name="planThreshold" type="number" min={0} max={100} defaultValue={settings.planThreshold} />
        </Field>
        <Field label="Ghost days" name="ghostDays" error={errors.ghostDays} hint="Active applications with no event for this long are flagged ghosted.">
          <Input name="ghostDays" type="number" min={1} max={365} defaultValue={settings.ghostDays} />
        </Field>
        <Field label="Extra ATS domains" name="extraAtsDomains" error={errors.extraAtsDomains} hint="Comma-separated. Mail from these domains always passes the prefilter." className="sm:col-span-2">
          <Input name="extraAtsDomains" defaultValue={settings.extraAtsDomains.join(", ")} placeholder="jobs.example.com, careers.acme.io" />
        </Field>
        <Field label="ntfy topic (optional)" name="ntfyTopic" error={errors.ntfyTopic} hint="Topic name or full URL. Pushes on auto status changes and a daily digest.">
          <Input name="ntfyTopic" defaultValue={settings.ntfyTopic} placeholder="my-jobpilot-topic" />
        </Field>
        <Field label="Digest hour (0–23, -1 = off)" name="digestHour" error={errors.digestHour} hint="Local time after which the once-a-day digest is sent.">
          <Input name="digestHour" type="number" min={-1} max={23} defaultValue={settings.digestHour} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          Save settings
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              const r = await testPushAction();
              if (r.ok) toast.success("Test push sent");
              else toast.error("Push failed", { description: r.error });
            })
          }
        >
          <Bell data-icon="inline-start" />
          Send test push
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            startTransition(async () => {
              await resetSettingsAction();
              toast.success("Reset to .env defaults");
              router.refresh();
            })
          }
        >
          <RotateCcw data-icon="inline-start" />
          Reset to defaults
        </Button>
      </div>
    </form>
  );
}

function Field({ label, name, error, hint, className, children }: { label: string; name: string; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label htmlFor={name} className="mb-1.5">{label}</Label>
      {children}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
