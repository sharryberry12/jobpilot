import type { Metadata } from "next";
import { createApplicationAction } from "@/app/actions/applications";
import { ApplicationForm } from "@/components/application-form";
import { toDateInput } from "@/lib/format";
import { getLead } from "@/lib/leads";

export const metadata: Metadata = { title: "New application" };

export default async function NewApplicationPage({ searchParams }: PageProps<"/applications/new">) {
  const params = await searchParams;
  const leadParam = Array.isArray(params.lead) ? params.lead[0] : params.lead;
  const lead = leadParam ? getLead(leadParam) : null;
  const initial = {
    appliedAt: toDateInput(new Date().toISOString()),
    ...(lead
      ? {
          leadId: lead.id,
          company: lead.company,
          roleTitle: lead.title,
          location: lead.location ?? undefined,
          sourceUrl: lead.url,
        }
      : {}),
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New application</h1>
        <p className="text-sm text-muted-foreground">
          Company, role and the pasted job description are required. Everything else is optional.
        </p>
        {lead && (
          <p className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            Started from a LinkedIn lead — company, role and link are prefilled.{" "}
            <a href={lead.url} target="_blank" rel="noopener noreferrer" className="underline">
              Open the posting
            </a>{" "}
            and paste its description below.
          </p>
        )}
      </div>
      <ApplicationForm action={createApplicationAction} initial={initial} submitLabel="Create application" cancelHref={lead ? "/leads" : "/"} />
    </div>
  );
}
