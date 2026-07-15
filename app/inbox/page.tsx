"use client";

import { useEffect, useState } from "react";
import type { Ticket } from "@/lib/store";
import { SiteNav } from "@/app/_components/site-nav";
import { StatusBadge } from "@/app/_components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default function InboxPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

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

  const send = async (ticketId: string) => {
    const message = drafts[ticketId]?.trim();
    if (!message) return;
    setSending(ticketId);
    try {
      await fetch("/api/relay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketId, message }),
      });
      setDrafts((d) => ({ ...d, [ticketId]: "" }));
    } finally {
      setSending(null);
    }
  };

  const queue = tickets.filter((t) => t.status === "escalated" || t.status === "answered");

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-8 sm:px-6">
      <SiteNav />
      <h1 className="mt-6 font-medium text-2xl tracking-tight">Support Inbox</h1>
      <p className="mt-1 text-muted-foreground text-sm">
        Escalations land here (this is the local stand-in for your team's Slack channel). Reply and
        Eve relays it straight into the customer's live chat.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {queue.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing escalated yet.</p>
        ) : null}
        {queue.map((t) => (
          <div key={t.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-muted-foreground text-xs">{t.id}</span>
              <StatusBadge status={t.status} />
              {t.classification ? (
                <span className="ml-auto text-muted-foreground text-xs">
                  {t.classification.severity} · {t.classification.area}
                </span>
              ) : null}
            </div>
            <p className="mt-2 font-medium text-sm">{t.summary}</p>
            <p className="mt-1 text-muted-foreground text-sm">{t.body}</p>
            {t.escalationReason ? (
              <p className="mt-2 text-amber-600 text-xs dark:text-amber-400">
                Escalated: {t.escalationReason}
              </p>
            ) : null}

            {t.status === "answered" ? (
              <p className="mt-3 text-blue-600 text-sm dark:text-blue-400">
                ✓ Relayed to customer: “{t.resolution}”
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                <Textarea
                  placeholder="Write the specialist's reply…"
                  value={drafts[t.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                  rows={2}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={sending === t.id || !(drafts[t.id]?.trim())}
                    onClick={() => send(t.id)}
                  >
                    {sending === t.id ? "Relaying…" : "Relay to customer"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
