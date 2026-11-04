import type { ItemStatus } from "@/lib/db/types";
import { Badge } from "@/components/ui/badge";

const labels: Record<ItemStatus, string> = {
  captured: "Saved",
  processing: "Processing",
  ready: "Ready",
  needs_content: "Needs text",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <Badge data-testid="item-status" data-status={status}>
      {labels[status]}
    </Badge>
  );
}
