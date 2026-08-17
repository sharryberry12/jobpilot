import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Master resume" };

export default function ResumePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Master resume</h1>
        <p className="text-sm text-muted-foreground">The single source of truth every tailored resume is built from.</p>
      </div>
      <EmptyState
        icon={FileText}
        title="No master profile yet"
        description="Resume upload and the profile editor arrive with the resume engine (phase 2)."
      />
    </div>
  );
}
