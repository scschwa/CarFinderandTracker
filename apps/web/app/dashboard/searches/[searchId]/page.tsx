"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarketStats } from "@/components/market-stats";
import { VehicleCard } from "@/components/vehicle-card";
import { VehicleTable } from "@/components/vehicle-table";
import { Download, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrapeProgress } from "@/components/scrape-progress";

export default function SearchResultsPage() {
  const params = useParams();
  const searchId = params.searchId as string;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [isTriggering, setIsTriggering] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["search", searchId],
    queryFn: async () => {
      const res = await fetch(`/api/searches/${searchId}`);
      if (!res.ok) throw new Error("Failed to fetch search");
      return res.json();
    },
  });

  const scrapeStatus = data?.search?.scrape_status;

  // Poll every 3 seconds while scrape is running
  useEffect(() => {
    if (scrapeStatus === "running") {
      if (!pollRef.current) {
        pollRef.current = setInterval(() => {
          queryClient.invalidateQueries({ queryKey: ["search", searchId] });
        }, 3000);
      }
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        // Final refresh when scrape completes
        if (scrapeStatus === "complete") {
          queryClient.invalidateQueries({ queryKey: ["search", searchId] });
        }
      }
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [scrapeStatus, searchId, queryClient]);

  const handleTriggerScrape = async () => {
    setIsTriggering(true);
    try {
      const res = await fetch(`/api/searches/${searchId}/trigger`, { method: "POST" });
      const body = await res.json();

      if (!res.ok) {
        toast({
          title: "Scrape failed",
          description: body.error || body.detail || "Unknown error",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Scrape started",
        description: "Fetching new listings in the background.",
      });

      // Kick off an initial poll to pick up 'running' status
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["search", searchId] }), 2000);
    } catch {
      toast({
        title: "Connection error",
        description: "Could not reach the scraping worker. Check WORKER_URL configuration.",
        variant: "destructive",
      });
    } finally {
      setIsTriggering(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Loading search results...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Search not found
      </div>
    );
  }

  const { search, listings } = data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let filtered = listings.filter((l: any) => !l.user_prefs?.is_hidden);

  if (statusFilter !== "all") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filtered = filtered.filter((l: any) => l.status === statusFilter);
  }
  if (sourceFilter !== "all") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filtered = filtered.filter((l: any) => l.source_site === sourceFilter);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtered.sort((a: any, b: any) => {
    switch (sortBy) {
      case "price-asc":
        return (a.current_price || 0) - (b.current_price || 0);
      case "price-desc":
        return (b.current_price || 0) - (a.current_price || 0);
      case "oldest":
        return new Date(a.first_seen).getTime() - new Date(b.first_seen).getTime();
      case "newest":
      default:
        return new Date(b.first_seen).getTime() - new Date(a.first_seen).getTime();
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {search.make} {search.model}
            {search.trim ? ` ${search.trim}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm">
            {search.year_min}&ndash;{search.year_max} &middot; {search.zip_code} &middot;{" "}
            {search.search_radius} mi radius
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleTriggerScrape} disabled={isTriggering || scrapeStatus === "running"}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isTriggering || scrapeStatus === "running" ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <a href={`/api/searches/${searchId}/export`}>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </a>
        </div>
      </div>

      <MarketStats listings={listings} />

      <ScrapeProgress
        status={search.scrape_status}
        currentSite={search.scrape_current_site}
        step={search.scrape_step || 0}
        totalSteps={search.scrape_total_steps || 0}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="sold">Sold</SelectItem>
            <SelectItem value="delisted">Delisted</SelectItem>
            <SelectItem value="cross_listed">Cross-listed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="autotrader">Autotrader</SelectItem>
            <SelectItem value="bat">Bring a Trailer</SelectItem>
            <SelectItem value="carsandbids">Cars & Bids</SelectItem>
            <SelectItem value="hemmings">Hemmings</SelectItem>
            <SelectItem value="pcarmarket">PCARMARKET</SelectItem>
            <SelectItem value="hagerty">Hagerty</SelectItem>
            <SelectItem value="autohunter">AutoHunter</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="price-asc">Price: Low to High</SelectItem>
            <SelectItem value="price-desc">Price: High to Low</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-1">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("grid")}
          >
            Tile
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("table")}
          >
            Listing
          </Button>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {filtered.map((listing: any) => (
            <VehicleCard key={listing.id} listing={listing} searchId={searchId} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              No listings match your filters
            </div>
          )}
        </div>
      ) : (
        <VehicleTable listings={filtered} searchId={searchId} />
      )}
    </div>
  );
}
