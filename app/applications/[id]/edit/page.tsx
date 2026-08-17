import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateApplicationAction } from "@/app/actions/applications";
import { ApplicationForm } from "@/components/application-form";
import { getApplication } from "@/lib/applications";
import { toDateInput } from "@/lib/format";

export const metadata: Metadata = { title: "Edit application" };

export default async function EditApplicationPage({ params }: PageProps<"/applications/[id]/edit">) {
  const { id } = await params;
  const app = getApplication(id);
  if (!app) notFound();
  const action = updateApplicationAction.bind(null, app.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Edit application</h1>
        <p className="text-sm text-muted-foreground">
          {app.roleTitle} at {app.company}. Status changes are made from the detail page.
        </p>
      </div>
      <ApplicationForm
        action={action}
        initial={{
          company: app.company,
          roleTitle: app.roleTitle,
          jdText: app.jdText,
          sourceUrl: app.sourceUrl ?? "",
          location: app.location ?? "",
          companyDomains: app.companyDomains ?? "",
          appliedAt: toDateInput(app.appliedAt),
        }}
        submitLabel="Save changes"
        cancelHref={`/applications/${app.id}`}
      />
    </div>
  );
}
