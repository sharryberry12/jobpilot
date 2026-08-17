/** Input validation at the system boundary (server actions / route handlers). */
import { z } from "zod";
import { STATUSES } from "./stateMachine";

const emptyToNull = (v: string | undefined) => (v && v.length > 0 ? v : null);

const optionalTrimmed = z.string().trim().max(500).optional().transform(emptyToNull);

export const applicationInputSchema = z.object({
  company: z.string().trim().min(1, "Company is required").max(200),
  roleTitle: z.string().trim().min(1, "Role title is required").max(200),
  jdText: z
    .string()
    .trim()
    .min(20, "Paste the job description (at least 20 characters)")
    .max(50_000),
  sourceUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform(emptyToNull)
    .refine((v) => v === null || /^https?:\/\//i.test(v), "URL must start with http:// or https://"),
  location: optionalTrimmed,
  companyDomains: optionalTrimmed,
  appliedAt: z
    .string()
    .trim()
    .optional()
    .transform(emptyToNull)
    .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), "Invalid date"),
});

export type ApplicationFormValues = z.input<typeof applicationInputSchema>;

export const statusSchema = z.enum(STATUSES);
export const idSchema = z.string().trim().min(1).max(64);

/** Flatten a zod error into { field: message } for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const flat = z.flattenError(error);
  const out: Record<string, string> = {};
  for (const [key, msgs] of Object.entries(flat.fieldErrors)) {
    const first = Array.isArray(msgs) ? msgs[0] : undefined;
    if (first) out[key] = first;
  }
  const formFirst = flat.formErrors[0];
  if (formFirst) out._form = formFirst;
  return out;
}

/** Read a FormData into a plain string record (empty strings preserved). */
export function formDataToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    // Skip Next.js internal action fields ($ACTION_ID, $ACTION_KEY, ...).
    if (k.startsWith("$")) continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
