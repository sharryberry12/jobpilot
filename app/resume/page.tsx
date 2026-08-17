import type { Metadata } from "next";
import { ResumeWorkspace } from "@/components/resume-workspace";
import { hasApiKey } from "@/lib/claude";
import { fmtDateTime } from "@/lib/format";
import { getMasterProfile } from "@/lib/resume";

export const metadata: Metadata = { title: "Master resume" };

export default function ResumePage() {
  const saved = getMasterProfile();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Master resume</h1>
        <p className="text-sm text-muted-foreground">
          The single source of truth every tailored resume is built from.
          {saved && ` Last saved ${fmtDateTime(saved.updatedAt)}.`}
        </p>
      </div>
      <ResumeWorkspace saved={saved} hasApiKey={hasApiKey()} />
    </div>
  );
}
