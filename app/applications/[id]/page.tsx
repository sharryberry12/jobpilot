import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Ghost, MapPin } from "lucide-react";
import { FitCard } from "@/components/fit-card";
import { PlanCard } from "@/components/plan-card";
import { StatusControls } from "@/components/status-controls";
import { TailorPanel } from "@/components/tailor-panel";
import { Timeline } from "@/components/timeline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getApplication, getTimeline } from "@/lib/applications";
import { hasApiKey } from "@/lib/claude";
import { listEmailsForApplication } from "@/lib/emails";
import { STATUS_META, fmtDate, fmtDateTime, statusLabel } from "@/lib/format";
import { getPlanForApplication } from "@/lib/plans";
import { getMasterProfile, getRequirements, getStoredFit, listResumeVersions } from "@/lib/resume";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/applications/[id]">): Promise<Metadata> {
  const { id } = await params;
  const app = getApplication(id);
  return { title: app ? `${app.roleTitle} · ${app.company}` : "Application" };
}

export default async function ApplicationDetailPage({ params }: PageProps<"/applications/[id]">) {
  const { id } = await params;
  const app = getApplication(id);
  if (!app) notFound();
  const events = getTimeline(id);
  const meta = STATUS_META[app.status];
  const master = getMasterProfile();
  const requirements = getRequirements(id);
  const fit = getStoredFit(app.fitJson);
  const versions = listResumeVersions(id);
  const apiKey = hasApiKey();
  const matchedEmails = listEmailsForApplication(id);
  const plan = getPlanForApplication(id);

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Board
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{app.roleTitle}</h1>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", meta.badge)}>
              {statusLabel(app.status)}
            </span>
            {app.ghosted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                <Ghost className="size-3" /> Ghosted
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{app.company}</span>
            {app.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />
                {app.location}
              </span>
            )}
            <span>Applied {fmtDate(app.appliedAt)}</span>
            {app.sourceUrl && (
              <a
                href={app.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
              >
                Job posting <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        <StatusControls id={app.id} status={app.status} company={app.company} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>Every status change, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              <Timeline events={events} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Matched emails</CardTitle>
              <CardDescription>Inbox messages linked to this application.</CardDescription>
            </CardHeader>
            <CardContent>
              {matchedEmails.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet. Emails appear here once Gmail sync is connected.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {matchedEmails.map((e) => (
                    <li key={e.id} className="py-2">
                      <details>
                        <summary className="cursor-pointer text-sm">
                          <span className="font-medium">{e.subject || "(no subject)"}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {fmtDateTime(e.receivedAt)} · {e.eventType ?? "unclassified"} · {e.decidedBy ?? "pending"}
                          </span>
                        </summary>
                        <div className="mt-1 text-xs text-muted-foreground">{e.fromAddr}</div>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-sans text-xs">{e.bodyText}</pre>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tailored resume</CardTitle>
              <CardDescription>
                Rephrased and reordered from your master profile — never invented. Review each bullet, then approve to
                generate a DOCX.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TailorPanel
                applicationId={app.id}
                versions={versions}
                master={master?.profile ?? null}
                hasApiKey={apiKey}
                currentVersionId={app.resumeVersionId}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job description</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                {app.jdText}
              </pre>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Fit</CardTitle>
              <CardDescription>Deterministic match against extracted requirements.</CardDescription>
            </CardHeader>
            <CardContent>
              <FitCard
                applicationId={app.id}
                fit={fit}
                requirements={requirements}
                hasMaster={master !== null}
                hasApiKey={apiKey}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Learning plan</CardTitle>
              <CardDescription>Closes the gaps for this role; finishing a project grows your master profile.</CardDescription>
            </CardHeader>
            <CardContent>
              <PlanCard
                applicationId={app.id}
                plan={plan}
                canGenerate={Boolean(master && requirements && fit && fit.gaps.length > 0)}
                generateHint={
                  !master
                    ? "Upload your master resume first."
                    : !requirements
                      ? "Extract requirements first — the plan is built from the gap list."
                      : fit && fit.gaps.length === 0
                        ? "No gaps for this role — nothing to plan."
                        : "No plan yet. Build one from the current gap list."
                }
                hasApiKey={apiKey}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
