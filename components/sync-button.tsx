"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { syncNowAction } from "@/app/actions/sync";
import { Button } from "@/components/ui/button";
import { fmtAgo } from "@/lib/format";

export function SyncButton({ lastSyncAt, gmailConnected }: { lastSyncAt: string | null; gmailConnected: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function sync() {
    startTransition(async () => {
      const s = await syncNowAction();
      if (s.skippedReason) {
        toast.warning("Sync skipped", { description: s.skippedReason });
      } else if (s.errors.length) {
        toast.error(`Sync finished with ${s.errors.length} error(s)`, { description: s.errors[0] });
      } else {
        toast.success(`Synced: ${s.fetched} fetched, ${s.kept} kept`, {
          description: `${s.autoApplied} auto-applied · ${s.queued} queued for review · ${s.linked} linked`,
        });
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground sm:inline" title={lastSyncAt ?? undefined}>
        {gmailConnected ? (lastSyncAt ? `Synced ${fmtAgo(lastSyncAt)}` : "Not synced yet") : "Gmail not connected"}
      </span>
      <Button variant="outline" onClick={sync} disabled={pending} title={gmailConnected ? "Fetch new mail now" : "Run npm run gmail:auth first"}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
        Sync now
      </Button>
    </div>
  );
}
