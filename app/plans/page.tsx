import type { Metadata } from "next";
import { Map } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Plans" };

export default function PlansPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Learning plans</h1>
        <p className="text-sm text-muted-foreground">Gap-driven roadmaps for roles where the resume is weak.</p>
      </div>
      <EmptyState
        icon={Map}
        title="No plans yet"
        description="Plans are generated for low-fit applications once the skill planner lands (phase 4)."
      />
    </div>
  );
}
