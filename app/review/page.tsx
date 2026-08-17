import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Review queue" };

export default function ReviewPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review queue</h1>
        <p className="text-sm text-muted-foreground">Emails the classifier was not confident enough to act on.</p>
      </div>
      <EmptyState
        icon={Inbox}
        title="Nothing to review"
        description="Connect Gmail in Settings and run a sync. Low-confidence classifications will show up here for a one-tap decision."
      />
    </div>
  );
}
