import { Badge } from "@/components/ui/badge";

const statusConfig = {
  active: { label: "Active", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  sold: { label: "Sold", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  delisted: { label: "Delisted", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  cross_listed: { label: "Cross-listed", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.active;

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
