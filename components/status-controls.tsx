"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteApplicationAction, moveApplicationAction } from "@/app/actions/applications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_META, statusLabel } from "@/lib/format";
import { allowedTargets, type Status } from "@/lib/stateMachine";
import { cn } from "@/lib/utils";

export function StatusControls({ id, status, company }: { id: string; status: Status; company: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const targets = allowedTargets(status, "manual");

  function move(to: Status) {
    startTransition(async () => {
      const result = await moveApplicationAction(id, to);
      if (!result.ok) {
        toast.error(`Can't move to ${statusLabel(to)}`, { description: result.reason });
        return;
      }
      toast.success(to === status ? "Logged another interview round" : `Moved to ${statusLabel(result.status)}`);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteApplicationAction(id);
      // On success the action redirects; we only get here on failure.
      if (result && !result.ok) toast.error("Delete failed", { description: result.reason });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={pending || targets.length === 0}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Change status
            <ChevronDown data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            From {statusLabel(status)}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {targets.map((to) => (
            <DropdownMenuItem key={to} onSelect={() => move(to)}>
              <span className={cn("size-2 rounded-full", STATUS_META[to].dot)} />
              {to === status ? "Log another interview round" : statusLabel(to)}
            </DropdownMenuItem>
          ))}
          {targets.length === 0 && (
            <DropdownMenuItem disabled>Final state — no moves available</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button asChild variant="outline">
        <Link href={`/applications/${id}/edit`}>
          <Pencil data-icon="inline-start" />
          Edit
        </Link>
      </Button>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">
            <Trash2 data-icon="inline-start" />
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this application?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {company} application, its timeline, matched emails and any tailored resume
              versions. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={pending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
