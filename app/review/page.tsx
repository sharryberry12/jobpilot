import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ReviewQueue } from "@/components/review-queue";
import { listActiveApplications } from "@/lib/applications";
import { listPendingReviews } from "@/lib/emails";

export const metadata: Metadata = { title: "Review queue" };

export default function ReviewPage() {
  const items = listPendingReviews();
  const apps = listActiveApplications().map((a) => ({ id: a.id, company: a.company, roleTitle: a.roleTitle, status: a.status }));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          Emails the classifier was not confident enough to act on — or moves the state machine refused. Every correction
          teaches the classifier (it sees your 10 most recent decisions).
        </p>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing to review"
          description="Connect Gmail (npm run gmail:auth) and press Sync now. Low-confidence classifications will show up here for a one-tap decision."
        />
      ) : (
        <ReviewQueue items={items} applications={apps} />
      )}
    </div>
  );
}
