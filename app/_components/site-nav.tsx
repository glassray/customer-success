"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Chat" },
  { href: "/tickets", label: "Tickets" },
  { href: "/inbox", label: "Support Inbox" },
];

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      <span className="mr-3 flex items-center gap-2 font-medium">
        <span className="grid size-5 place-items-center rounded bg-foreground font-bold text-[10px] text-background">
          ▲
        </span>
        Vercel Support
      </span>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            "rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground",
            pathname === l.href && "bg-muted text-foreground",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
