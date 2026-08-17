import fs from "node:fs/promises";
import path from "node:path";
import { getResumeVersion } from "@/lib/resume";

const OUT_DIR = path.join(process.cwd(), "data", "out");

/** Serve a generated DOCX from data/out (local single-user app; files never leave the machine). */
export async function GET(_req: Request, ctx: RouteContext<"/api/resume-versions/[id]/download">) {
  const { id } = await ctx.params;
  const version = getResumeVersion(id);
  if (!version?.docxPath) return new Response("Not found", { status: 404 });
  const abs = path.resolve(/*turbopackIgnore: true*/ process.cwd(), version.docxPath);
  if (!abs.startsWith(OUT_DIR)) return new Response("Forbidden", { status: 403 });
  try {
    const buf = await fs.readFile(abs);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${path.basename(abs)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("File missing on disk", { status: 410 });
  }
}
