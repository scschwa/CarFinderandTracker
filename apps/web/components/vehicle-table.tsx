"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Heart, EyeOff, ExternalLink } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ListingRow {
  id: string;
  url: string;
  current_price: number | null;
  sale_price: number | null;
  geography: string | null;
  source_site: string;
  status: string;
  image_url: string | null;
  vehicles: {
    vin: string;
    make: string | null;
    model: string | null;
    trim: string | null;
    year: number | null;
    mileage: number | null;
  };
  user_prefs?: { is_hidden: boolean; is_favorited: boolean };
}

function formatPrice(cents: number | null) {
  if (!cents) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(cents / 100);
}

const sourceLabels: Record<string, string> = {
  autotrader: "Autotrader", bat: "BaT", carsandbids: "Cars & Bids",
  hemmings: "Hemmings", pcarmarket: "PCARMARKET", hagerty: "Hagerty", autohunter: "AutoHunter",
};

export function VehicleTable({ listings, searchId }: { listings: ListingRow[]; searchId?: string }) {
  const queryClient = useQueryClient();

  const favMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/listings/${id}/favorite`, { method: "POST" }),
    onSuccess: () => {
      if (searchId) queryClient.invalidateQueries({ queryKey: ["search", searchId] });
    },
  });

  const hideMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/listings/${id}/hide`, { method: "POST" }),
    onSuccess: () => {
      if (searchId) queryClient.invalidateQueries({ queryKey: ["search", searchId] });
    },
  });

  const visibleListings = listings.filter((l) => !l.user_prefs?.is_hidden);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Link</TableHead>
            <TableHead>VIN</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleListings.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No listings found
              </TableCell>
            </TableRow>
          )}
          {visibleListings.map((listing) => {
            const v = listing.vehicles;
            const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
            return (
              <TableRow key={listing.id}>
                <TableCell className="font-medium">{title || "Unknown"}</TableCell>
                <TableCell className="font-semibold">
                  {listing.status === "sold" ? formatPrice(listing.sale_price) : formatPrice(listing.current_price)}
                </TableCell>
                <TableCell className="text-sm">{sourceLabels[listing.source_site] || listing.source_site}</TableCell>
                <TableCell><StatusBadge status={listing.status} /></TableCell>
                <TableCell>
                  <a href={listing.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {v.vin && !v.vin.startsWith("UNKNOWN") ? v.vin : "--"}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => favMutation.mutate(listing.id)}>
                      <Heart className={`h-4 w-4 ${listing.user_prefs?.is_favorited ? "fill-red-500 text-red-500" : ""}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => hideMutation.mutate(listing.id)}>
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
