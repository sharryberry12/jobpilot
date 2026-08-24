import type { Metadata } from "next";
import { Radar } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LeadsList } from "@/components/leads-list";
import { countLeadsByStatus, listLeads } from "@/lib/leads";
import type { LeadStatus } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Leads" };

const SHOW: readonly LeadStatus[] = ["new", "dismissed", "applied"];

function parseShow(v: string | string[] | undefined): LeadStatus {
  const s = Array.isArray(v) ? v[0] : v;
  return SHOW.includes(s as LeadStatus) ? (s as LeadStatus) : "new";
}

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const show = parseShow((await searchParams).show);
  const leads = listLeads({ status: show });
  const counts = countLeadsByStatus();
  const total = counts.new + counts.dismissed + counts.applied;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">
          Roles harvested from your LinkedIn job-alert emails, deduplicated by job id. Every sync adds new ones. Open the
          posting, and if it is worth applying to, <strong>Start application</strong> prefills the form — paste the job
          description and it enters the tracker as usual.
        </p>
      </div>
      {total === 0 ? (
        <EmptyState
          icon={Radar}
          title="No leads yet"
          description="Leads appear when a sync picks up a LinkedIn job-alert or recommendation email. To scan mail that was synced before this feature existed, run: npm run leads:backfill"
        />
      ) : (
        <LeadsList leads={leads} show={show} counts={counts} />
      )}
    </div>
  );
}
