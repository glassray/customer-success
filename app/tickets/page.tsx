"use client";

import { useEffect, useState } from "react";
import type { Ticket } from "@/lib/store";
import { SiteNav } from "@/app/_components/site-nav";
import { StatusBadge } from "@/app/_components/status-badge";

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/tickets", { cache: "no-store" });
      const data = (await res.json()) as { tickets: Ticket[] };
      if (alive) setTickets(data.tickets);
    };
    void load();
    const id = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-4xl px-4 py-8 sm:px-6">
      <SiteNav />
      <h1 className="mt-6 font-medium text-2xl tracking-tight">Tickets</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        Every ticket is logged by the Vercel Workflow, then triaged by Eve.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {tickets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tickets yet — start a chat.</p>
        ) : null}
        {tickets.map((t) => (
          <div
            key={t.id}
            className="rounded-lg border border-border bg-card p-4 text-card-foreground"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-muted-foreground text-xs">{t.id}</span>
              <StatusBadge status={t.status} />
              {t.classification ? (
                <span className="ml-auto flex items-center gap-1.5 text-muted-foreground text-xs">
                  <span className="capitalize">{t.classification.type}</span>
                  <span>·</span>
                  <span className="capitalize">{t.classification.severity}</span>
                  <span>·</span>
                  <span>{t.classification.area}</span>
                </span>
              ) : null}
            </div>
            <p className="mt-2 font-medium text-sm">{t.summary}</p>
            <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">{t.body}</p>
            {t.resolution ? (
              <p className="mt-2 text-emerald-600 text-xs dark:text-emerald-400">
                → {t.resolution}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}
