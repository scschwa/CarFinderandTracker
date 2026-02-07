"use client";

import { Card, CardContent } from "@/components/ui/card";

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

interface MarketStatsProps {
  listings: { current_price: number | null; status: string }[];
}

export function MarketStats({ listings }: MarketStatsProps) {
  const activePrices = listings
    .filter((l) => l.current_price && l.status !== "delisted")
    .map((l) => l.current_price!)
    .sort((a, b) => a - b);

  const total = listings.length;
  const activeCount = listings.filter((l) => l.status === "active").length;

  if (activePrices.length === 0) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Listings" value={String(total)} />
        <StatCard label="Active" value={String(activeCount)} />
        <StatCard label="Avg Price" value="--" />
        <StatCard label="Median Price" value="--" />
        <StatCard label="Lowest Price" value="--" />
      </div>
    );
  }

  const avg = activePrices.reduce((a, b) => a + b, 0) / activePrices.length;
  const median =
    activePrices.length % 2 === 0
      ? (activePrices[activePrices.length / 2 - 1] + activePrices[activePrices.length / 2]) / 2
      : activePrices[Math.floor(activePrices.length / 2)];
  const lowest = activePrices[0];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatCard label="Total Listings" value={String(total)} />
      <StatCard label="Active" value={String(activeCount)} />
      <StatCard label="Avg Price" value={formatPrice(avg)} />
      <StatCard label="Median Price" value={formatPrice(median)} />
      <StatCard label="Lowest Price" value={formatPrice(lowest)} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
