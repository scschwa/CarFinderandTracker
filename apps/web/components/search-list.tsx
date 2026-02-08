"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SearchForm } from "@/components/search-form";
import { Search, Trash2, Pause, Play, Pencil } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SavedSearch {
  id: string;
  make: string;
  model: string;
  trim: string | null;
  year_min: number;
  year_max: number;
  enabled_sites: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  listings: { count: number }[];
}

export function SearchList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null);

  const { data: searches, isLoading } = useQuery<SavedSearch[]>({
    queryKey: ["searches"],
    queryFn: async () => {
      const res = await fetch("/api/searches");
      if (!res.ok) throw new Error("Failed to fetch searches");
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await fetch(`/api/searches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["searches"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/searches/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["searches"] }),
  });

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading searches...</div>;
  }

  if (!searches?.length) {
    return (
      <div className="py-12 text-center">
        <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground">No saved searches yet</p>
        <p className="text-sm text-muted-foreground">Create your first search above to start tracking vehicles.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {searches.map((search) => {
          const listingCount = search.listings?.[0]?.count ?? 0;
          return (
            <Card key={search.id} className="cursor-pointer hover:border-blue-500/50 transition-colors" onClick={() => router.push(`/dashboard/searches/${search.id}`)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{search.make} {search.model}{search.trim ? ` ${search.trim}` : ""}</h3>
                    <p className="text-sm text-muted-foreground">{search.year_min}–{search.year_max}</p>
                  </div>
                  <Badge variant="outline" className={search.is_active ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-muted text-muted-foreground"}>
                    {search.is_active ? "Active" : "Paused"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  <span>{search.enabled_sites?.length || 7} sites</span>
                  <span>{listingCount} listings</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Updated {formatDistanceToNow(new Date(search.updated_at), { addSuffix: true })}</span>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingSearch(search)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleMutation.mutate({ id: search.id, is_active: !search.is_active })}>
                      {search.is_active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => { if (confirm("Delete this search and all its listings?")) deleteMutation.mutate(search.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editingSearch} onOpenChange={(open) => { if (!open) setEditingSearch(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Search</DialogTitle>
          </DialogHeader>
          {editingSearch && (
            <SearchForm
              editData={editingSearch}
              onSaved={() => setEditingSearch(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
