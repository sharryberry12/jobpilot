"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { FormState } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Values = Partial<
  Record<"company" | "roleTitle" | "jdText" | "sourceUrl" | "location" | "companyDomains" | "appliedAt", string>
>;

export function ApplicationForm({
  action,
  initial = {},
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: Values;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const values: Values = { ...initial, ...(state?.values ?? {}) };
  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {errors._form && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errors._form}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" name="company" error={errors.company} required>
          <Input id="company" name="company" defaultValue={values.company} required autoFocus />
        </Field>
        <Field label="Role title" name="roleTitle" error={errors.roleTitle} required>
          <Input id="roleTitle" name="roleTitle" defaultValue={values.roleTitle} required />
        </Field>
        <Field label="Location" name="location" error={errors.location}>
          <Input id="location" name="location" defaultValue={values.location} placeholder="Remote · Sydney · …" />
        </Field>
        <Field label="Applied on" name="appliedAt" error={errors.appliedAt}>
          <Input id="appliedAt" name="appliedAt" type="date" defaultValue={values.appliedAt} />
        </Field>
        <Field label="Job URL" name="sourceUrl" error={errors.sourceUrl} className="sm:col-span-2">
          <Input id="sourceUrl" name="sourceUrl" defaultValue={values.sourceUrl} placeholder="https://…" inputMode="url" />
        </Field>
        <Field
          label="Company email domains"
          name="companyDomains"
          error={errors.companyDomains}
          hint="Optional, comma-separated. Helps match inbound email (e.g. acme.com, mail.acme.com)."
          className="sm:col-span-2"
        >
          <Input id="companyDomains" name="companyDomains" defaultValue={values.companyDomains} placeholder="acme.com" />
        </Field>
      </div>

      <Field label="Job description" name="jdText" error={errors.jdText} required hint="Paste the full JD text. Used for requirement extraction and fit scoring.">
        <Textarea id="jdText" name="jdText" defaultValue={values.jdText} required rows={14} className="font-mono text-xs leading-relaxed" />
      </Field>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {submitLabel}
        </Button>
        <Button asChild variant="ghost" type="button">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={name} className="mb-1.5">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
