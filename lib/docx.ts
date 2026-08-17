/**
 * Render an approved tailored profile to DOCX (SPEC §6.2): one clean
 * single-column template — name header, summary, skills, experience,
 * projects, education. Saved under data/out/.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import type { MasterProfile, TailoredProfile } from "./profile";

const OUT_DIR = path.join(process.cwd(), "data", "out");
const FONT = "Calibri";

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, font: FONT, size: 22, color: "222222" })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, font: FONT, size: 21 })],
  });
}

function entryHeader(left: string, right: string, sub?: string): Paragraph[] {
  const out = [
    new Paragraph({
      spacing: { before: 120, after: 0 },
      tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
      children: [
        new TextRun({ text: left, bold: true, font: FONT, size: 22 }),
        new TextRun({ text: `\t${right}`, font: FONT, size: 20, color: "555555" }),
      ],
    }),
  ];
  if (sub) {
    out.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: sub, italics: true, font: FONT, size: 20, color: "444444" })],
      }),
    );
  }
  return out;
}

/** Resolve the tailored subset back onto master facts (company/title/dates always come from master). */
export function buildDocument(master: MasterProfile, tailored: TailoredProfile): Document {
  const children: Paragraph[] = [];
  const b = master.basics;

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: b.name || "Resume", bold: true, font: FONT, size: 36 })],
    }),
  );
  const contact = [b.email, b.phone, b.location, ...b.links].filter(Boolean).join("  ·  ");
  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [new TextRun({ text: contact, font: FONT, size: 20, color: "444444" })],
      }),
    );
  }

  if (tailored.summary.trim()) {
    children.push(heading("Summary"));
    children.push(new Paragraph({ children: [new TextRun({ text: tailored.summary.trim(), font: FONT, size: 21 })] }));
  }

  const skillById = new Map(master.skills.map((s) => [s.id, s]));
  const skills = tailored.skills.map((s) => skillById.get(s.source_id)?.name).filter((n): n is string => Boolean(n));
  if (skills.length) {
    children.push(heading("Skills"));
    children.push(new Paragraph({ children: [new TextRun({ text: skills.join("  ·  "), font: FONT, size: 21 })] }));
  }

  const expById = new Map(master.experience.map((e) => [e.id, e]));
  const expEntries = tailored.experience.filter((e) => expById.has(e.source_id) && e.bullets.length > 0);
  if (expEntries.length) {
    children.push(heading("Experience"));
    for (const entry of expEntries) {
      const src = expById.get(entry.source_id)!;
      const dates = [src.start, src.end].filter(Boolean).join(" – ");
      children.push(...entryHeader(src.title || src.company, dates, src.title ? src.company : undefined));
      for (const bl of entry.bullets) children.push(bullet(bl.text));
    }
  }

  const projById = new Map(master.projects.map((p) => [p.id, p]));
  const projEntries = tailored.projects.filter((p) => projById.has(p.source_id) && p.bullets.length > 0);
  if (projEntries.length) {
    children.push(heading("Projects"));
    for (const entry of projEntries) {
      const src = projById.get(entry.source_id)!;
      children.push(...entryHeader(src.name, ""));
      for (const bl of entry.bullets) children.push(bullet(bl.text));
    }
  }

  if (master.education.length) {
    children.push(heading("Education"));
    for (const ed of master.education) {
      const dates = [ed.start, ed.end].filter(Boolean).join(" – ");
      children.push(...entryHeader([ed.degree, ed.institution].filter(Boolean).join(", "), dates, ed.detail || undefined));
    }
  }
  if (master.certs.length) {
    children.push(heading("Certifications"));
    for (const c of master.certs) {
      children.push(bullet([c.name, c.issuer, c.year].filter(Boolean).join(" · ")));
    }
  }

  return new Document({
    creator: "JobPilot",
    title: `${b.name || "Resume"} — resume`,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 540, hanging: 270 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        children,
      },
    ],
  });
}

const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "resume";

/** Render and save; returns the path relative to the project root. */
export async function renderResumeDocx(
  master: MasterProfile,
  tailored: TailoredProfile,
  label: { company: string; roleTitle: string; versionId: string },
): Promise<string> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const filename = `${safe(master.basics.name || "resume")}_${safe(label.company)}_${safe(label.roleTitle)}_${label.versionId}.docx`;
  const abs = path.join(OUT_DIR, filename);
  const buffer = await Packer.toBuffer(buildDocument(master, tailored));
  await fs.writeFile(abs, buffer);
  return path.relative(process.cwd(), abs).split(path.sep).join("/");
}
