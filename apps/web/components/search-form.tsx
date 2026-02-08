"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 1989 }, (_, i) => currentYear + 1 - i);

const ALL_SITES = [
  { key: "bat", label: "Bring a Trailer" },
  { key: "carsandbids", label: "Cars & Bids" },
  { key: "autotrader", label: "Autotrader" },
  { key: "hemmings", label: "Hemmings" },
  { key: "pcarmarket", label: "PCARMARKET" },
  { key: "hagerty", label: "Hagerty" },
  { key: "autohunter", label: "AutoHunter" },
  { key: "autotempest", label: "AutoTempest" },
] as const;

const ALL_SITE_KEYS = ALL_SITES.map(s => s.key);

interface EditData {
  id: string;
  make: string;
  model: string;
  trim: string | null;
  year_min: number;
  year_max: number;
  enabled_sites: string[] | null;
}

interface SearchFormProps {
  editData?: EditData;
  onSaved?: () => void;
}

export function SearchForm({ editData, onSaved }: SearchFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const isEditing = !!editData;

  const [form, setForm] = useState({
    make: "", model: "", trim: "",
    year_min: "2015", year_max: String(currentYear),
  });
  const [enabledSites, setEnabledSites] = useState<string[]>([...ALL_SITE_KEYS]);

  useEffect(() => {
    if (editData) {
      setForm({
        make: editData.make,
        model: editData.model,
        trim: editData.trim || "",
        year_min: String(editData.year_min),
        year_max: String(editData.year_max),
      });
      setEnabledSites(editData.enabled_sites || [...ALL_SITE_KEYS]);
    }
  }, [editData]);

  const toggleSite = (key: string) => {
    setEnabledSites(prev => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev;
        return prev.filter(s => s !== key);
      }
      return [...prev, key];
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        make: form.make, model: form.model,
        trim: form.trim || null,
        year_min: parseInt(form.year_min),
        year_max: parseInt(form.year_max),
        enabled_sites: enabledSites,
      };

      const url = isEditing ? `/api/searches/${editData.id}` : "/api/searches";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${isEditing ? "update" : "create"} search`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["searches"] });
      if (isEditing) {
        queryClient.invalidateQueries({ queryKey: ["search", editData.id] });
        onSaved?.();
      } else {
        setForm({ make: "", model: "", trim: "", year_min: "2015", year_max: String(currentYear) });
        setEnabledSites([...ALL_SITE_KEYS]);
        router.push(`/dashboard/searches/${data.id}`);
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const formContent = (
    <form
      onSubmit={(e) => { e.preventDefault(); setError(""); mutation.mutate(); }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="make">Make</Label>
          <Input id="make" placeholder="e.g. Toyota" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Input id="model" placeholder="e.g. Camry" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="trim">Trim (optional)</Label>
          <Input id="trim" placeholder="e.g. XSE" value={form.trim} onChange={(e) => setForm({ ...form, trim: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>Year Min</Label>
          <Select value={form.year_min} onValueChange={(v) => setForm({ ...form, year_min: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Year Max</Label>
          <Select value={form.year_max} onValueChange={(v) => setForm({ ...form, year_max: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending
              ? (isEditing ? "Saving..." : "Creating...")
              : (isEditing ? "Save Changes" : "Create Search")}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Websites to search</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_SITES.map(site => {
            const isActive = enabledSites.includes(site.key);
            return (
              <button
                key={site.key}
                type="button"
                onClick={() => toggleSite(site.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                }`}
              >
                {site.label}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );

  if (isEditing) {
    return formContent;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" /> New Search
        </CardTitle>
      </CardHeader>
      <CardContent>
        {formContent}
      </CardContent>
    </Card>
  );
}
