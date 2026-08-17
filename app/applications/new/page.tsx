import type { Metadata } from "next";
import { createApplicationAction } from "@/app/actions/applications";
import { ApplicationForm } from "@/components/application-form";
import { toDateInput } from "@/lib/format";

export const metadata: Metadata = { title: "New application" };

export default function NewApplicationPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New application</h1>
        <p className="text-sm text-muted-foreground">
          Company, role and the pasted job description are required. Everything else is optional.
        </p>
      </div>
      <ApplicationForm
        action={createApplicationAction}
        initial={{ appliedAt: toDateInput(new Date().toISOString()) }}
        submitLabel="Create application"
        cancelHref="/"
      />
    </div>
  );
}
