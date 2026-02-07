"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Heart, EyeOff, ExternalLink, Car } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

interface VehicleCardProps {
  listing: {
    id: string;
    url: string;
    current_price: number | null;
    sale_price: number | null;
    geography: string | null;
    source_site: string;
    status: string;
    image_url: string | null;
    first_seen: string;
    vehicles: {
      vin: string;
      make: string | null;
      model: string | null;
      trim: string | null;
      year: number | null;
      mileage: number | null;
    };
    user_prefs?: {
      is_hidden: boolean;
      is_favorited: boolean;
    };
  };
  searchId?: string;
}

function formatPrice(cents: number | null) {
  if (!cents) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const sourceLabels: Record<string, string> = {
  autotrader: "Autotrader",
  bat: "BaT",
  carsandbids: "Cars & Bids",
};

export function VehicleCard({ listing, searchId }: VehicleCardProps) {
  const queryClient = useQueryClient();
  const v = listing.vehicles;
  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  const isFavorited = listing.user_prefs?.is_favorited || false;
  const isHidden = listing.user_prefs?.is_hidden || false;

  const favMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/vehicles/${listing.id}/favorite`, { method: "POST" }),
    onSuccess: () => {
      if (searchId) queryClient.invalidateQueries({ queryKey: ["search", searchId] });
      queryClient.invalidateQueries({ queryKey: ["searches"] });
    },
  });

  const hideMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/vehicles/${listing.id}/hide`, { method: "POST" }),
    onSuccess: () => {
      if (searchId) queryClient.invalidateQueries({ queryKey: ["search", searchId] });
      queryClient.invalidateQueries({ queryKey: ["searches"] });
    },
  });

  if (isHidden) return null;

  return (
    <Card className="overflow-hidden">
      <div className="aspect-video bg-muted relative">
        {listing.image_url ? (
          <img
            src={listing.image_url}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={() => favMutation.mutate()}
          >
            <Heart className={`h-4 w-4 ${isFavorited ? "fill-red-500 text-red-500" : ""}`} />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8"
            onClick={() => hideMutation.mutate()}
          >
            <EyeOff className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold hover:text-blue-400 flex items-center gap-1"
          >
            {title || "Unknown Vehicle"}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg font-bold">
            {listing.status === "sold"
              ? formatPrice(listing.sale_price)
              : formatPrice(listing.current_price)}
          </span>
          {listing.status === "sold" && listing.sale_price && (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(listing.current_price)}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge status={listing.status} />
          <Badge variant="outline">{sourceLabels[listing.source_site] || listing.source_site}</Badge>
          {listing.geography && <span>{listing.geography}</span>}
          {v.mileage && <span>{v.mileage.toLocaleString()} mi</span>}
        </div>
        {v.vin && (
          <a
            href={`/vehicle/${v.vin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:underline mt-2 block"
          >
            VIN: {v.vin}
          </a>
        )}
      </CardContent>
    </Card>
  );
}
