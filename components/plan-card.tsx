"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ExternalLink, Hammer, Loader2, Map, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { completeProjectAction, deletePlanAction, generatePlanAction, setPlanItemStatusAction } from "@/app/actions/plans";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PlanItem } from "@/lib/db/schema";
import type { PlanWithItems } from "@/lib/plans";
import { parseSkills } from "@/lib/plan-utils";
import { cn } from "@/lib/utils";

type Props = {
  applicationId: string | null;
  plan: PlanWithItems | null;
  canGenerate: boolean;
  generateHint?: string;
  hasApiKey: boolean;
  compact?: boolean;
};

export function PlanCard({ applicationId, plan, canGenerate, generateHint, hasApiKey, compact = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmItem, setConfirmItem] = useState<PlanItem | null>(null);

  function generate() {
    if (!applicationId) return;
    startTransition(async () => {
      const r = await generatePlanAction(applicationId);
      if (!r.ok) return void toast.error("Could not build a plan", { description: r.error });
      toast.success(`Plan ready — ${r.items} items`);
      router.refresh();
    });
  }

  function toggleLearn(item: PlanItem, done: boolean) {
    startTransition(async () => {
      const r = await setPlanItemStatusAction(item.id, done ? "done" : "todo");
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  }

  function completeProject(item: PlanItem) {
    startTransition(async () => {
      const r = await completeProjectAction(item.id);
      setConfirmItem(null);
      if (!r.ok) return void toast.error("Could not complete project", { description: r.error });
      toast.success("Project marked done — master profile updated", {
        description: `${r.addedBullet ? "Evidence bullet added. " : ""}${r.addedSkills.length ? `New skills: ${r.addedSkills.join(", ")}. ` : ""}Fit recomputed for ${r.refreshedApplications} open application(s).`,
      });
      router.refresh();
    });
  }

  function remove() {
    if (!plan) return;
    startTransition(async () => {
      const r = await deletePlanAction(plan.id);
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });
  }

  if (!plan) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{generateHint ?? "No plan for this application."}</p>
        {applicationId && (
          <Button size="sm" variant="outline" onClick={generate} disabled={pending || !canGenerate || !hasApiKey}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
            Build me a plan
          </Button>
        )}
      </div>
    );
  }

  const done = plan.items.filter((i) => i.status === "done").length;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{plan.goal}</div>
          <div className="text-xs text-muted-foreground">{done}/{plan.items.length} done</div>
        </div>
        {!compact && (
          <div className="flex gap-1">
            {applicationId && (
              <Button size="sm" variant="ghost" onClick={generate} disabled={pending || !hasApiKey} title="Rebuild the plan from current gaps">
                <Sparkles data-icon="inline-start" /> Rebuild
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={pending} title="Delete plan">
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      <PlanItems items={plan.items} pending={pending} onToggleLearn={toggleLearn} onProject={setConfirmItem} />
      <CompleteDialog item={confirmItem} pending={pending} onCancel={() => setConfirmItem(null)} onConfirm={completeProject} />
    </div>
  );
}

function PlanItems({
  items,
  pending,
  onToggleLearn,
  onProject,
}: {
  items: PlanItem[];
  pending: boolean;
  onToggleLearn: (item: PlanItem, done: boolean) => void;
  onProject: (item: PlanItem) => void;
}) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className={cn("rounded-md border border-border p-2", item.status === "done" && "opacity-70")}>
          <div className="flex items-start gap-2">
            <Checkbox
              className="mt-0.5"
              checked={item.status === "done"}
              disabled={pending || (item.kind === "project" && item.status === "done")}
              onCheckedChange={(v) => (item.kind === "project" ? v && onProject(item) : onToggleLearn(item, v === true))}
              aria-label={item.kind === "project" ? "Mark project done" : "Mark learned"}
            />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                {item.kind === "project" ? <Hammer className="size-3.5 text-amber-600" /> : <BookOpen className="size-3.5 text-sky-600" />}
                <span className={cn("font-medium", item.status === "done" && "line-through")}>{item.title}</span>
                {parseSkills(item.skillsJson).map((s) => (
                  <span key={s} className="rounded bg-muted px-1 font-mono text-[10px]">{s}</span>
                ))}
              </div>
              {item.detail && <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>}
              {item.resourceUrl && (
                <a href={item.resourceUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  Resource <ExternalLink className="size-3" />
                </a>
              )}
              {item.kind === "project" && item.definitionOfDone && (
                <p className="mt-1 text-xs"><span className="font-medium">Done when:</span> {item.definitionOfDone}</p>
              )}
              {item.kind === "project" && item.evidenceBullet && (
                <p className="mt-1 rounded bg-muted/50 p-1.5 text-xs italic">“{item.evidenceBullet}”</p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CompleteDialog({
  item,
  pending,
  onCancel,
  onConfirm,
}: {
  item: PlanItem | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (item: PlanItem) => void;
}) {
  const skills = item ? parseSkills(item.skillsJson) : [];
  return (
    <AlertDialog open={item !== null} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark “{item?.title}” as done?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>This appends the evidence bullet below to your master profile as a project, adds any new skills, and recomputes fit for open applications in the same role family.</p>
              {item?.evidenceBullet && <p className="rounded bg-muted p-2 italic">“{item.evidenceBullet}”</p>}
              {skills.length > 0 && <p>Skills: {skills.join(", ")}</p>}
              <p className="text-muted-foreground">Only do this once the definition of done is genuinely met — the bullet becomes a claim on your resume.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction onClick={() => item && onConfirm(item)} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Map data-icon="inline-start" />}
            Mark done & update profile
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
