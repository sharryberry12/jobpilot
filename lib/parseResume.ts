/** Extract plain text from an uploaded PDF or DOCX (SPEC §2: pdf-parse, mammoth). */
import path from "node:path";

export type ParsedUpload = { text: string; kind: "pdf" | "docx" | "txt"; pages?: number };

const MAX_BYTES = 15 * 1024 * 1024;

export function detectKind(filename: string, mime?: string | null): ParsedUpload["kind"] | null {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf" || mime === "application/pdf") return "pdf";
  if (
    ext === ".docx" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (ext === ".txt" || ext === ".md" || mime === "text/plain") return "txt";
  return null;
}

export async function extractResumeText(buffer: Buffer, filename: string, mime?: string | null): Promise<ParsedUpload> {
  if (buffer.byteLength === 0) throw new Error("The uploaded file is empty.");
  if (buffer.byteLength > MAX_BYTES) throw new Error("File is larger than 15 MB.");
  const kind = detectKind(filename, mime);
  if (!kind) throw new Error("Unsupported file type. Upload a PDF, DOCX or plain-text resume.");

  if (kind === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      const text = cleanText(result.text);
      if (!text) throw new Error("No selectable text found in the PDF (is it a scanned image?).");
      return { text, kind, pages: result.pages?.length };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = cleanText(result.value);
    if (!text) throw new Error("No text found in the DOCX.");
    return { text, kind };
  }
  const text = cleanText(buffer.toString("utf8"));
  if (!text) throw new Error("The text file is empty.");
  return { text, kind };
}

export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t\u00a0]{2,}/g, " ")
    .trim();
}
