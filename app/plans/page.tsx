import type { Metadata } from "next";
import Link from "next/link";
import { Map } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PlanCard } from "@/components/plan-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasApiKey } from "@/lib/claude";
import { fmtDate } from "@/lib/format";
import { listPlans } from "@/lib/plans";

export const metadata: Metadata = { title: "Plans" };

export default function PlansPage() {
  const plans = listPlans();
  const apiKey = hasApiKey();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Learning plans</h1>
        <p className="text-sm text-muted-foreground">Gap-driven roadmaps for roles where the resume is weak. Completing a project updates your master profile and re-scores matching open applications.</p>
      </div>
      {plans.length === 0 ? (
        <EmptyState
          icon={Map}
          title="No plans yet"
          description="Plans are generated automatically for low-fit applications, or from the “Build me a plan” button on an application page."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardHeader>
                <CardTitle>
                  {plan.application ? (
                    <Link href={`/applications/${plan.application.id}`} className="hover:underline">
                      {plan.application.roleTitle} · {plan.application.company}
                    </Link>
                  ) : (
                    "General plan"
                  )}
                </CardTitle>
                <CardDescription>
                  Created {fmtDate(plan.createdAt)}
                  {plan.application && ` · ${plan.application.status}`}
                  {plan.application?.fitScore !== null && plan.application?.fitScore !== undefined && ` · fit ${Math.round(plan.application.fitScore)}/100`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PlanCard applicationId={plan.applicationId} plan={plan} canGenerate={false} hasApiKey={apiKey} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
