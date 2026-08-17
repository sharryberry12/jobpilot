"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, FileText, Inbox, LayoutDashboard, Map, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const LINKS = [
  { href: "/", label: "Board", icon: LayoutDashboard },
  { href: "/review", label: "Review", icon: Inbox },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/plans", label: "Plans", icon: Map },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Nav({ pendingReviews }: { pendingReviews: number }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-12 w-full max-w-[1600px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <BriefcaseBusiness className="size-4" />
          JobPilot
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-muted text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
                {href === "/review" && pendingReviews > 0 && (
                  <Badge variant="destructive" className="ml-0.5 h-4 min-w-4 px-1 text-[10px]">
                    {pendingReviews}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
