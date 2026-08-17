"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadResumeAction } from "@/app/actions/resume";
import { ProfileEditor } from "@/components/profile-editor";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MasterProfile } from "@/lib/profile";

type Props = {
  saved: { profile: MasterProfile; sourceFilename: string | null; updatedAt: string } | null;
  hasApiKey: boolean;
};

type Draft = { profile: MasterProfile; sourceFilename: string; textPreview: string; chars: number };

export function ResumeWorkspace({ saved, hasApiKey }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [uploading, startUpload] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function beginUpload(file: File) {
    if (saved && !confirmReplace) {
      setPendingFile(file);
      setConfirmReplace(true);
      return;
    }
    runUpload(file);
  }

  function runUpload(file: File) {
    setConfirmReplace(false);
    setPendingFile(null);
    startUpload(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadResumeAction(fd);
      if (!result.ok) {
        toast.error("Upload failed", { description: result.error });
        return;
      }
      setDraft({ profile: result.draft, sourceFilename: result.sourceFilename, textPreview: result.textPreview, chars: result.chars });
      toast.success("Resume parsed", { description: `${result.chars.toLocaleString()} characters extracted — review the draft below.` });
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{saved ? "Replace master resume" : "Upload your resume"}</CardTitle>
          <CardDescription>
            PDF, DOCX or TXT. The text is extracted locally, then Claude normalises it into an editable profile.
            {saved && " Saving a new upload replaces the current profile."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm hover:file:bg-muted/70"
            disabled={uploading || !hasApiKey}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) beginUpload(f);
            }}
          />
          {uploading && (
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Parsing and normalising…
            </span>
          )}
          {!hasApiKey && (
            <span className="text-sm text-destructive">Set ANTHROPIC_API_KEY in .env to enable parsing.</span>
          )}
        </CardContent>
      </Card>

      {draft ? (
        <div className="space-y-3">
          <details className="rounded-md border border-border bg-muted/30 p-3 text-xs">
            <summary className="cursor-pointer text-sm font-medium">Extracted text preview ({draft.chars.toLocaleString()} chars)</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono">{draft.textPreview}</pre>
          </details>
          <ProfileEditor
            key={`draft-${draft.sourceFilename}-${draft.chars}`}
            initial={draft.profile}
            sourceFilename={draft.sourceFilename}
            mode="draft"
            onSaved={() => setDraft(null)}
            onDiscard={() => setDraft(null)}
          />
        </div>
      ) : saved ? (
        <ProfileEditor key={saved.updatedAt} initial={saved.profile} sourceFilename={saved.sourceFilename} mode="saved" />
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <FileText className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-3 font-medium">No master profile yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Upload a resume above, or start from scratch and fill the form in.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => setDraft({ profile: emptyDraft(), sourceFilename: "manual", textPreview: "", chars: 0 })}>
            <Upload data-icon="inline-start" />
            Start from a blank profile
          </Button>
        </div>
      )}

      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the current master profile?</AlertDialogTitle>
            <AlertDialogDescription>
              The new file will be parsed into a draft you can review. Your existing profile stays until you save the
              draft — but saving will overwrite it, and existing tailored versions may reference ids that no longer exist.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFile(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingFile && runUpload(pendingFile)}>Parse new file</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function emptyDraft(): MasterProfile {
  return {
    basics: { name: "", email: "", phone: "", location: "", links: [] },
    summary: "",
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certs: [],
  };
}
