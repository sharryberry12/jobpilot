import { customAlphabet } from "nanoid";

/** URL-safe, no look-alike characters, 12 chars ≈ 62 bits of entropy. */
const nano = customAlphabet("0123456789abcdefghijkmnpqrstuvwxyz", 12);

export const ID_PREFIX = {
  application: "app",
  statusEvent: "ev",
  reviewItem: "rq",
  resumeVersion: "rv",
  requirement: "req",
  plan: "pl",
  planItem: "pi",
  lead: "ld",
} as const;

export type IdKind = keyof typeof ID_PREFIX;

export function newId(kind: IdKind): string {
  return `${ID_PREFIX[kind]}_${nano()}`;
}
