"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FileText, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  approveResumeVersionAction,
  deleteResumeVersionAction,
  tailorResumeAction,
  updateResumeVersionAction,
} from "@/app/actions/resume";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { wordDiff } from "@/lib/diff";
import { fmtDateTime } from "@/lib/format";
import type { MasterProfile, TailoredProfile } from "@/lib/profile";
import type { ResumeVersionRow } from "@/lib/resume";
import type { ValidationError } from "@/lib/validate";
import { cn } from "@/lib/utils";

type Props = {
  applicationId: string;
  versions: ResumeVersionRow[];
  master: MasterProfile | null;
  hasApiKey: boolean;
  currentVersionId: string | null;
};

export function TailorPanel({ applicationId, versions, master, hasApiKey, currentVersionId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(currentVersionId ?? versions[0]?.id ?? null);
  const [edits, setEdits] = useState<Record<string, TailoredProfile>>({});
  const [errors, setErrors] = useState<ValidationError[] | null>(null);

  const selected = versions.find((v) => v.id === selectedId) ?? versions[0] ?? null;
  const working = selected ? edits[selected.id] ?? selected.tailored : null;
  const dirty = selected ? edits[selected.id] !== undefined : false;

  function generate() {
    setErrors(null);
    startTransition(async () => {
      const r = await tailorResumeAction(applicationId);
      if (!r.ok) {
        setErrors(r.validationErrors ?? null);
        toast.error("Tailoring failed", { description: r.error });
        return;
      }
      toast.success(`Tailored resume generated${r.attempts > 1 ? ` (passed validation on attempt ${r.attempts})` : ""}`);
      setSelectedId(r.versionId);
      router.refresh();
    });
  }

  function saveEdits() {
    if (!selected || !working) return;
    startTransition(async () => {
      const r = await updateResumeVersionAction(selected.id, JSON.stringify(working));
      if (!r.ok) {
        setErrors(r.validationErrors ?? null);
        toast.error("Could not save edits", { description: r.error });
        return;
      }
      setErrors(null);
      setEdits((e) => {
        const { [selected.id]: _drop, ...rest } = e;
        void _drop;
        return rest;
      });
      toast.success("Edits saved");
      router.refresh();
    });
  }

  function approve() {
    if (!selected) return;
    startTransition(async () => {
      if (dirty && working) {
        const saved = await updateResumeVersionAction(selected.id, JSON.stringify(working));
        if (!saved.ok) {
          setErrors(saved.validationErrors ?? null);
          toast.error("Could not save edits before approving", { description: saved.error });
          return;
        }
      }
      const r = await approveResumeVersionAction(selected.id);
      if (!r.ok) {
        setErrors(r.validationErrors ?? null);
        toast.error("Approval failed", { description: r.error });
        return;
      }
      setErrors(null);
      setEdits({});
      toast.success("Resume approved — DOCX generated");
      router.refresh();
    });
  }

  function remove() {
    if (!selected) return;
    startTransition(async () => {
      const r = await deleteResumeVersionAction(selected.id);
      if (!r.ok) return void toast.error(r.error ?? "Delete failed");
      setSelectedId(null);
      router.refresh();
    });
  }

  if (!master) {
    return <p className="text-sm text-muted-foreground">Upload your master resume first — tailoring builds from it.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={generate} disabled={pending || !hasApiKey}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
          {versions.length ? "Generate another version" : "Tailor resume"}
        </Button>
        {!hasApiKey && <span className="text-xs text-destructive">Set ANTHROPIC_API_KEY to enable tailoring.</span>}
      </div>

      {errors && errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <div className="font-medium text-destructive">No-fabrication check failed</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.path}</span>: {e.message}
                {e.detail && <span className="text-muted-foreground"> — {e.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {versions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedId(v.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                v.id === selected?.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
              )}
            >
              {v.approved ? <CheckCircle2 className="size-3 text-emerald-600" /> : <FileText className="size-3 text-muted-foreground" />}
              {fmtDateTime(v.createdAt)}
              {v.id === currentVersionId && <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">linked</span>}
            </button>
          ))}
        </div>
      )}

      {selected && working && (
        <div className="space-y-4 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            {selected.approved ? (
              <>
                <span className="inline-flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-4" /> Approved
                </span>
                {selected.docxPath && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/resume-versions/${selected.id}/download`}>
                      <Download data-icon="inline-start" />
                      Download DOCX
                    </a>
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button size="sm" onClick={approve} disabled={pending}>
                  <CheckCircle2 data-icon="inline-start" />
                  Approve & generate DOCX
                </Button>
                <Button size="sm" variant="outline" onClick={saveEdits} disabled={pending || !dirty}>
                  Save edits
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={remove} disabled={pending}>
              <Trash2 data-icon="inline-start" />
              Delete version
            </Button>
          </div>
          <VersionDiff
            master={master}
            tailored={working}
            editable={!selected.approved}
            onChange={(next) => setEdits((e) => ({ ...e, [selected.id]: next }))}
          />
        </div>
      )}
    </div>
  );
}

// ── Side-by-side diff with per-bullet accept/reject ─────────────────────────

function DiffText({ from, to }: { from: string; to: string }) {
  const ops = useMemo(() => wordDiff(from, to), [from, to]);
  return (
    <span>
      {ops.map((op, i) =>
        op.type === "same" ? (
          <span key={i}>{op.text}</span>
        ) : op.type === "add" ? (
          <mark key={i} className="rounded bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100">{op.text}</mark>
        ) : null,
      )}
    </span>
  );
}

function VersionDiff({
  master,
  tailored,
  editable,
  onChange,
}: {
  master: MasterProfile;
  tailored: TailoredProfile;
  editable: boolean;
  onChange: (next: TailoredProfile) => void;
}) {
  const skillName = new Map(master.skills.map((s) => [s.id, s.name]));
  const bulletsById = new Map<string, string>();
  for (const e of master.experience) for (const b of e.bullets) bulletsById.set(b.id, b.text);
  for (const p of master.projects) for (const b of p.bullets) bulletsById.set(b.id, b.text);

  return (
    <div className="space-y-5 text-sm">
      <section>
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summary</h4>
        <div className="mt-1 grid gap-2 md:grid-cols-2">
          <div className="rounded-md bg-muted/40 p-2 text-muted-foreground">{master.summary || <em>No master summary</em>}</div>
          {editable ? (
            <Textarea rows={3} value={tailored.summary} onChange={(e) => onChange({ ...tailored, summary: e.target.value })} />
          ) : (
            <div className="rounded-md border border-border p-2"><DiffText from={master.summary} to={tailored.summary} /></div>
          )}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Skills (relevance order)</h4>
        <ul className="mt-1 flex flex-wrap gap-1">
          {tailored.skills.map((s) => (
            <li key={s.source_id} className="rounded bg-muted px-1.5 py-0.5 text-xs">{skillName.get(s.source_id) ?? s.source_id}</li>
          ))}
        </ul>
      </section>

      <EntrySection
        title="Experience"
        section="experience"
        entries={master.experience.map((e) => ({ id: e.id, label: [e.title, e.company].filter(Boolean).join(" · "), bullets: e.bullets }))}
        tailored={tailored}
        editable={editable}
        onChange={onChange}
        bulletsById={bulletsById}
      />
      <EntrySection
        title="Projects"
        section="projects"
        entries={master.projects.map((p) => ({ id: p.id, label: p.name, bullets: p.bullets }))}
        tailored={tailored}
        editable={editable}
        onChange={onChange}
        bulletsById={bulletsById}
      />
    </div>
  );
}

function EntrySection({
  title,
  section,
  entries,
  tailored,
  editable,
  onChange,
  bulletsById,
}: {
  title: string;
  section: "experience" | "projects";
  entries: { id: string; label: string; bullets: { id: string; text: string }[] }[];
  tailored: TailoredProfile;
  editable: boolean;
  onChange: (next: TailoredProfile) => void;
  bulletsById: Map<string, string>;
}) {
  const list = tailored[section];
  const setList = (next: TailoredProfile[typeof section]) => onChange({ ...tailored, [section]: next });

  // Entries appear in tailored order; entries the tailor omitted are listed after (collapsed).
  const ordered = [
    ...list.map((t) => ({ tailored: t, master: entries.find((e) => e.id === t.source_id) })).filter((x) => x.master),
    ...entries.filter((e) => !list.some((t) => t.source_id === e.id)).map((e) => ({ tailored: null, master: e })),
  ];
  if (ordered.length === 0) return null;

  return (
    <section>
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="mt-1 space-y-3">
        {ordered.map(({ tailored: t, master: m }) => {
          if (!m) return null;
          const kept = t?.bullets ?? [];
          const omitted = m.bullets.filter((b) => !kept.some((k) => k.source_id === b.id));
          const setEntryBullets = (bullets: { source_id: string; text: string }[]) => {
            const exists = list.some((x) => x.source_id === m.id);
            const next = exists
              ? list.map((x) => (x.source_id === m.id ? { ...x, bullets } : x))
              : [...list, { source_id: m.id, bullets }];
            setList(next.filter((x) => x.bullets.length > 0)); // empty entries fall back to "omitted"
          };
          return (
            <div key={m.id} className={cn("rounded-md border border-border p-2", !t && "opacity-70")}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium">{m.label || m.id}</span>
                {!t && <span className="text-muted-foreground">omitted by tailor</span>}
              </div>
              {kept.map((b, i) => (
                <div key={b.source_id} className="grid gap-2 border-t border-border/60 py-2 md:grid-cols-[auto_1fr_1fr]">
                  {editable ? (
                    <Checkbox
                      checked
                      aria-label="Keep this bullet"
                      onCheckedChange={() => setEntryBullets(kept.filter((_, j) => j !== i))}
                    />
                  ) : (
                    <span />
                  )}
                  <div className="text-xs text-muted-foreground">{bulletsById.get(b.source_id) ?? <em>unknown source</em>}</div>
                  {editable ? (
                    <Textarea
                      rows={2}
                      className="text-xs"
                      value={b.text}
                      onChange={(e) => setEntryBullets(kept.map((k, j) => (j === i ? { ...k, text: e.target.value } : k)))}
                    />
                  ) : (
                    <div className="text-xs"><DiffText from={bulletsById.get(b.source_id) ?? ""} to={b.text} /></div>
                  )}
                </div>
              ))}
              {editable && omitted.length > 0 && (
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">{omitted.length} source bullet(s) not included</summary>
                  <ul className="mt-1 space-y-1">
                    {omitted.map((b) => (
                      <li key={b.id} className="flex items-start gap-2">
                        <Checkbox
                          checked={false}
                          aria-label="Include this bullet"
                          onCheckedChange={() => setEntryBullets([...kept, { source_id: b.id, text: b.text }])}
                        />
                        <span className="text-muted-foreground">{b.text}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
