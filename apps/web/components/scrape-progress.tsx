"use client";

const siteDisplayNames: Record<string, string> = {
  bat: "Bring a Trailer",
  carsandbids: "Cars & Bids",
  autotrader: "Autotrader",
  hemmings: "Hemmings",
  pcarmarket: "PCARMARKET",
  hagerty: "Hagerty",
  autohunter: "AutoHunter",
};

interface ScrapeProgressProps {
  status: string | null;
  currentSite: string | null;
  step: number;
  totalSteps: number;
}

export function ScrapeProgress({
  status,
  currentSite,
  step,
  totalSteps,
}: ScrapeProgressProps) {
  if (!status || status !== "running" || totalSteps === 0) return null;

  const pct = Math.round((step / totalSteps) * 100);
  const siteName = currentSite
    ? siteDisplayNames[currentSite] || currentSite
    : null;

  return (
    <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {siteName
            ? `Pulling data from ${siteName}...`
            : "Starting scrape..."}
        </span>
        <span className="text-muted-foreground font-medium">
          {step}/{totalSteps}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
