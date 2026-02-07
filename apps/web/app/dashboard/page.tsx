"use client";

import { SearchForm } from "@/components/search-form";
import { SearchList } from "@/components/search-list";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Create and manage your vehicle searches
        </p>
      </div>
      <SearchForm />
      <div>
        <h2 className="text-lg font-semibold mb-4">Your Searches</h2>
        <SearchList />
      </div>
    </div>
  );
}
