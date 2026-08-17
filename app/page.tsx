import Link from "next/link";
import { Plus } from "lucide-react";
import { KanbanBoard } from "@/components/kanban/board";
import { SyncButton } from "@/components/sync-button";
import { Button } from "@/components/ui/button";
import { listApplications } from "@/lib/applications";
import { hasGmailToken } from "@/lib/gmail";
import { lastSyncAt, maybeSyncStale } from "@/lib/scheduler";
import { ACTIVE_STATUSES } from "@/lib/stateMachine";

export default function BoardPage() {
  // SPEC §2: dashboard load kicks a sync when the last run is stale (fire-and-forget).
  maybeSyncStale();
  const apps = listApplications();
  const active = apps.filter((a) => ACTIVE_STATUSES.includes(a.status)).length;
  const ghosted = apps.filter((a) => a.ghosted).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Applications</h1>
          <p className="text-sm text-muted-foreground">
            {apps.length} total · {active} active
            {ghosted > 0 && ` · ${ghosted} ghosted`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncButton lastSyncAt={lastSyncAt()} gmailConnected={hasGmailToken()} />
          <Button asChild>
            <Link href="/applications/new">
              <Plus data-icon="inline-start" />
              New application
            </Link>
          </Button>
        </div>
      </div>

      {apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <h2 className="font-medium">No applications yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first application, or run <code className="rounded bg-muted px-1">npm run seed</code> for sample data.
          </p>
          <Button asChild className="mt-4">
            <Link href="/applications/new">
              <Plus data-icon="inline-start" />
              New application
            </Link>
          </Button>
        </div>
      ) : (
        <KanbanBoard initialItems={apps} />
      )}
    </div>
  );
}
