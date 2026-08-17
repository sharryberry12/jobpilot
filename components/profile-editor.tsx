"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveMasterProfileAction } from "@/app/actions/resume";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MasterProfile } from "@/lib/profile";

type Props = {
  initial: MasterProfile;
  sourceFilename: string | null;
  /** "draft" = freshly parsed upload awaiting confirmation; "saved" = editing the stored profile */
  mode: "draft" | "saved";
  onSaved?: () => void;
  onDiscard?: () => void;
};

const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

export function ProfileEditor({ initial, sourceFilename, mode, onSaved, onDiscard }: Props) {
  const router = useRouter();
  const [profile, setProfile] = useState<MasterProfile>(initial);
  const [pending, startTransition] = useTransition();

  const set = (patch: Partial<MasterProfile>) => setProfile((p) => ({ ...p, ...patch }));

  function save() {
    startTransition(async () => {
      const result = await saveMasterProfileAction(JSON.stringify(profile), sourceFilename);
      if (!result.ok) {
        toast.error("Could not save profile", { description: result.error });
        return;
      }
      toast.success(mode === "draft" ? "Master profile saved" : "Profile updated", {
        description: result.recomputed > 0 ? `Fit recomputed for ${result.recomputed} application(s).` : undefined,
      });
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {mode === "draft" && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100">
          Review the parsed profile below, fix anything that was mis-read, then save. Nothing is stored until you save.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={profile.basics.name} onChange={(e) => set({ basics: { ...profile.basics, name: e.target.value } })} /></Field>
          <Field label="Email"><Input value={profile.basics.email} onChange={(e) => set({ basics: { ...profile.basics, email: e.target.value } })} /></Field>
          <Field label="Phone"><Input value={profile.basics.phone} onChange={(e) => set({ basics: { ...profile.basics, phone: e.target.value } })} /></Field>
          <Field label="Location"><Input value={profile.basics.location} onChange={(e) => set({ basics: { ...profile.basics, location: e.target.value } })} /></Field>
          <Field label="Links (one per line)" className="sm:col-span-2">
            <Textarea rows={2} value={profile.basics.links.join("\n")} onChange={(e) => set({ basics: { ...profile.basics, links: e.target.value.split("\n").map((l) => l.trim()).filter(Boolean) } })} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={3} value={profile.summary} onChange={(e) => set({ summary: e.target.value })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
          <CardDescription>Each skill gets a stable id (shown in mono) that tailored resumes and fit scores reference.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {profile.skills.map((s, i) => (
            <div key={s.id} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Input value={s.name} placeholder="Skill" onChange={(e) => set({ skills: profile.skills.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <Input value={s.level} placeholder="Level (e.g. used in production)" onChange={(e) => set({ skills: profile.skills.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)) })} />
              <RemoveButton onClick={() => set({ skills: profile.skills.filter((_, j) => j !== i) })} />
              <span className="col-span-3 -mt-1 font-mono text-[10px] text-muted-foreground">{s.id}</span>
            </div>
          ))}
          <AddButton label="Add skill" onClick={() => set({ skills: [...profile.skills, { id: newId("sk"), name: "", level: "" }] })} />
        </CardContent>
      </Card>

      <ExperienceSection profile={profile} set={set} />
      <ProjectsSection profile={profile} set={set} />
      <EducationSection profile={profile} set={set} />

      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          {mode === "draft" ? "Save as master profile" : "Save changes"}
        </Button>
        {onDiscard && (
          <Button variant="ghost" onClick={onDiscard} disabled={pending}>
            Discard
          </Button>
        )}
        {sourceFilename && <span className="ml-auto text-xs text-muted-foreground">Source: {sourceFilename}</span>}
      </div>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={onClick} aria-label="Remove">
      <Trash2 />
    </Button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Plus data-icon="inline-start" />
      {label}
    </Button>
  );
}

type SectionProps = { profile: MasterProfile; set: (patch: Partial<MasterProfile>) => void };

function BulletRows({
  bullets,
  onChange,
}: {
  bullets: { id: string; text: string }[];
  onChange: (next: { id: string; text: string }[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {bullets.map((b, i) => (
        <div key={b.id} className="grid grid-cols-[1fr_auto] items-start gap-2">
          <Textarea
            rows={2}
            value={b.text}
            placeholder="Achievement bullet"
            className="text-sm"
            onChange={(e) => onChange(bullets.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
          />
          <RemoveButton onClick={() => onChange(bullets.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton label="Add bullet" onClick={() => onChange([...bullets, { id: newId("b"), text: "" }])} />
    </div>
  );
}

function ExperienceSection({ profile, set }: SectionProps) {
  const update = (i: number, patch: Partial<MasterProfile["experience"][number]>) =>
    set({ experience: profile.experience.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Experience</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {profile.experience.map((e, i) => (
          <div key={e.id} className="space-y-2 rounded-lg border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_110px_110px_auto]">
              <Input value={e.company} placeholder="Company" onChange={(ev) => update(i, { company: ev.target.value })} />
              <Input value={e.title} placeholder="Title" onChange={(ev) => update(i, { title: ev.target.value })} />
              <Input value={e.start} placeholder="Start" onChange={(ev) => update(i, { start: ev.target.value })} />
              <Input value={e.end} placeholder="End / present" onChange={(ev) => update(i, { end: ev.target.value })} />
              <RemoveButton onClick={() => set({ experience: profile.experience.filter((_, j) => j !== i) })} />
            </div>
            <BulletRows bullets={e.bullets} onChange={(bullets) => update(i, { bullets })} />
            <span className="font-mono text-[10px] text-muted-foreground">{e.id}</span>
          </div>
        ))}
        <AddButton
          label="Add role"
          onClick={() => set({ experience: [...profile.experience, { id: newId("ex"), company: "", title: "", start: "", end: "", bullets: [] }] })}
        />
      </CardContent>
    </Card>
  );
}

function ProjectsSection({ profile, set }: SectionProps) {
  const update = (i: number, patch: Partial<MasterProfile["projects"][number]>) =>
    set({ projects: profile.projects.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {profile.projects.map((p, i) => (
          <div key={p.id} className="space-y-2 rounded-lg border border-border p-3">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input value={p.name} placeholder="Project name" onChange={(ev) => update(i, { name: ev.target.value })} />
              <RemoveButton onClick={() => set({ projects: profile.projects.filter((_, j) => j !== i) })} />
            </div>
            <BulletRows bullets={p.bullets} onChange={(bullets) => update(i, { bullets })} />
            <span className="font-mono text-[10px] text-muted-foreground">{p.id}</span>
          </div>
        ))}
        <AddButton label="Add project" onClick={() => set({ projects: [...profile.projects, { id: newId("pr"), name: "", bullets: [] }] })} />
      </CardContent>
    </Card>
  );
}

function EducationSection({ profile, set }: SectionProps) {
  const updateEd = (i: number, patch: Partial<MasterProfile["education"][number]>) =>
    set({ education: profile.education.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const updateCert = (i: number, patch: Partial<MasterProfile["certs"][number]>) =>
    set({ certs: profile.certs.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Education & certifications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {profile.education.map((ed, i) => (
            <div key={ed.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_90px_90px_1fr_auto]">
              <Input value={ed.institution} placeholder="Institution" onChange={(e) => updateEd(i, { institution: e.target.value })} />
              <Input value={ed.degree} placeholder="Degree" onChange={(e) => updateEd(i, { degree: e.target.value })} />
              <Input value={ed.start} placeholder="Start" onChange={(e) => updateEd(i, { start: e.target.value })} />
              <Input value={ed.end} placeholder="End" onChange={(e) => updateEd(i, { end: e.target.value })} />
              <Input value={ed.detail} placeholder="Detail (GPA, honours…)" onChange={(e) => updateEd(i, { detail: e.target.value })} />
              <RemoveButton onClick={() => set({ education: profile.education.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <AddButton
            label="Add education"
            onClick={() => set({ education: [...profile.education, { id: newId("ed"), institution: "", degree: "", start: "", end: "", detail: "" }] })}
          />
        </div>
        <div className="space-y-2">
          {profile.certs.map((c, i) => (
            <div key={c.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_90px_auto]">
              <Input value={c.name} placeholder="Certification" onChange={(e) => updateCert(i, { name: e.target.value })} />
              <Input value={c.issuer} placeholder="Issuer" onChange={(e) => updateCert(i, { issuer: e.target.value })} />
              <Input value={c.year} placeholder="Year" onChange={(e) => updateCert(i, { year: e.target.value })} />
              <RemoveButton onClick={() => set({ certs: profile.certs.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <AddButton label="Add certification" onClick={() => set({ certs: [...profile.certs, { id: newId("ce"), name: "", issuer: "", year: "" }] })} />
        </div>
      </CardContent>
    </Card>
  );
}
