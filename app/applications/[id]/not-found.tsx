import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ApplicationNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold">Application not found</h1>
      <p className="mt-1 text-sm text-muted-foreground">It may have been deleted.</p>
      <Button asChild className="mt-4">
        <Link href="/">Back to board</Link>
      </Button>
    </div>
  );
}
