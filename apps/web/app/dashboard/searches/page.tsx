"use client";

import { SearchList } from "@/components/search-list";

export default function SearchesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">My Searches</h1>
        <p className="text-muted-foreground text-sm">
          All your saved vehicle searches
        </p>
      </div>
      <SearchList />
    </div>
  );
}
