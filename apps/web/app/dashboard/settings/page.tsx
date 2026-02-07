"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";

interface Search {
  id: string;
  make: string;
  model: string;
  year_min: number;
  year_max: number;
}

interface NotificationSetting {
  search_id: string;
  price_drop_enabled: boolean;
  price_drop_pct: number;
  new_listing_enabled: boolean;
  sold_alert_enabled: boolean;
  email: string | null;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: searches } = useQuery<Search[]>({
    queryKey: ["searches"],
    queryFn: async () => {
      const res = await fetch("/api/searches");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: settings } = useQuery<NotificationSetting[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      search_id: string;
      price_drop_enabled: boolean;
      price_drop_pct: number;
      new_listing_enabled: boolean;
      sold_alert_enabled: boolean;
      email: string | null;
    }) => {
      const res = await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Configure notification preferences for each search
        </p>
      </div>
      {!searches?.length ? (
        <div className="py-12 text-center">
          <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No searches to configure</p>
        </div>
      ) : (
        searches.map((search) => (
          <NotificationCard
            key={search.id}
            search={search}
            setting={settings?.find((s) => s.search_id === search.id)}
            onSave={(data) => saveMutation.mutate({ search_id: search.id, ...data })}
            isSaving={saveMutation.isPending}
          />
        ))
      )}
    </div>
  );
}

function NotificationCard({
  search,
  setting,
  onSave,
  isSaving,
}: {
  search: Search;
  setting?: NotificationSetting;
  onSave: (data: {
    price_drop_enabled: boolean;
    price_drop_pct: number;
    new_listing_enabled: boolean;
    sold_alert_enabled: boolean;
    email: string | null;
  }) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    new_listing_enabled: setting?.new_listing_enabled ?? true,
    price_drop_enabled: setting?.price_drop_enabled ?? false,
    price_drop_pct: setting?.price_drop_pct ?? 5,
    sold_alert_enabled: setting?.sold_alert_enabled ?? false,
    email: setting?.email ?? "",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {search.make} {search.model} ({search.year_min}&ndash;{search.year_max})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.new_listing_enabled}
              onChange={(e) => setForm({ ...form, new_listing_enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">New listing alerts</span>
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.price_drop_enabled}
                onChange={(e) => setForm({ ...form, price_drop_enabled: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Price drop alerts</span>
            </label>
            {form.price_drop_enabled && (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={form.price_drop_pct}
                  onChange={(e) => setForm({ ...form, price_drop_pct: parseInt(e.target.value) || 5 })}
                  className="w-16 h-8"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.sold_alert_enabled}
              onChange={(e) => setForm({ ...form, sold_alert_enabled: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm">Sold alerts</span>
          </label>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label className="text-xs">Override email (optional)</Label>
            <Input
              type="email"
              placeholder="Leave blank to use account email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="h-8"
            />
          </div>
          <Button
            size="sm"
            onClick={() => onSave({ ...form, email: form.email || null })}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
