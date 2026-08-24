import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { countNewLeads } from "@/lib/leads";
import { countPendingReviews } from "@/lib/review";

// Every page reads the local SQLite DB — always render at request time.
export const dynamic = "force-dynamic";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "JobPilot", template: "%s · JobPilot" },
  description: "Personal job-application copilot",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const pendingReviews = countPendingReviews();
  const newLeads = countNewLeads();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TooltipProvider>
          <Nav pendingReviews={pendingReviews} newLeads={newLeads} />
          <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 py-6 sm:px-6">{children}</main>
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
