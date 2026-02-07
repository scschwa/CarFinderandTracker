"use client";

import { useQuery } from "@tanstack/react-query";
import { VehicleCard } from "@/components/vehicle-card";
import { Heart } from "lucide-react";

export default function FavoritesPage() {
  const { data: searches } = useQuery({
    queryKey: ["searches"],
    queryFn: async () => {
      const res = await fetch("/api/searches");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allListings, isLoading } = useQuery<any[]>({
    queryKey: ["favorites", searches?.map((s: { id: string }) => s.id)],
    enabled: !!searches?.length,
    queryFn: async () => {
      const results = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        searches.map(async (s: any) => {
          const res = await fetch(`/api/searches/${s.id}`);
          if (!res.ok) return { listings: [] };
          return res.json();
        })
      );
      return results.flatMap((r: { listings: { user_prefs?: { is_favorited: boolean } }[] }) =>
        r.listings.filter((l) => l.user_prefs?.is_favorited)
      );
    },
  });

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Loading favorites...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Favorites</h1>
        <p className="text-muted-foreground text-sm">
          Your favorited vehicles across all searches
        </p>
      </div>
      {!allListings?.length ? (
        <div className="py-12 text-center">
          <Heart className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No favorites yet</p>
          <p className="text-sm text-muted-foreground">
            Heart a vehicle from your search results to see it here.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {allListings.map((listing: any) => (
            <VehicleCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
