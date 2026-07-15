import { cn } from "@/lib/utils";
import type { TicketStatus } from "@/lib/store";

const STYLES: Record<TicketStatus, string> = {
  open: "bg-muted text-muted-foreground",
  resolved: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  escalated: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  answered: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

export function StatusBadge({ status }: { readonly status: TicketStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs capitalize",
        STYLES[status],
      )}
    >
      {status}
    </span>
  );
}
