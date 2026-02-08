"use client";

import { useState, useEffect, useMemo } from "react";
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

const MAKES_AND_MODELS: Record<string, string[]> = {
  "Acura": ["Integra", "NSX", "RSX", "TL", "TLX", "TSX", "MDX", "RDX"],
  "Alfa Romeo": ["4C", "Giulia", "Stelvio", "GTV", "Spider"],
  "Aston Martin": ["DB9", "DB11", "DBS", "V8 Vantage", "Vanquish", "Rapide"],
  "Audi": ["A3", "A4", "A5", "A6", "A7", "A8", "Q5", "Q7", "Q8", "R8", "RS3", "RS4", "RS5", "RS6", "RS7", "S3", "S4", "S5", "S6", "TT", "e-tron GT"],
  "BMW": ["1 Series", "2 Series", "3 Series", "4 Series", "5 Series", "6 Series", "7 Series", "8 Series", "M2", "M3", "M4", "M5", "M6", "M8", "X1", "X3", "X5", "X6", "X7", "Z3", "Z4", "i4", "iX", "M340i", "M240i", "M550i"],
  "Buick": ["Grand National", "GNX", "Riviera", "Regal"],
  "Cadillac": ["ATS", "CT4", "CT5", "CTS", "CTS-V", "Escalade", "STS", "XLR"],
  "Chevrolet": ["Camaro", "Corvette", "C10", "Chevelle", "Impala", "Nova", "El Camino", "Blazer", "Tahoe", "Suburban", "Silverado", "Colorado", "SS", "Monte Carlo"],
  "Chrysler": ["300", "Crossfire"],
  "Dodge": ["Challenger", "Charger", "Viper", "Durango", "Dart", "Demon"],
  "Ferrari": ["348", "355", "360", "430", "458", "488", "F12", "812", "California", "Roma", "Portofino", "SF90", "296"],
  "Fiat": ["124 Spider", "500 Abarth"],
  "Ford": ["Bronco", "F-150", "F-250", "F-100", "Mustang", "GT", "Raptor", "Explorer", "Expedition", "Ranger", "Maverick", "Thunderbird", "Galaxie", "Fairlane"],
  "Genesis": ["G70", "G80", "G90", "GV70", "GV80"],
  "GMC": ["Sierra", "Yukon", "Canyon", "Jimmy", "Typhoon"],
  "Honda": ["Accord", "Civic", "CR-V", "S2000", "NSX", "Prelude", "Integra", "Fit", "HR-V", "Pilot"],
  "Hyundai": ["Elantra N", "Ioniq 5", "Ioniq 6", "Kona N", "Veloster N", "Genesis Coupe"],
  "Infiniti": ["G35", "G37", "Q50", "Q60"],
  "Jaguar": ["E-Type", "F-Type", "XJ", "XK", "XKR", "XE", "XF"],
  "Jeep": ["Wrangler", "Grand Cherokee", "Cherokee", "Gladiator", "CJ"],
  "Kia": ["Stinger", "EV6"],
  "Lamborghini": ["Aventador", "Diablo", "Gallardo", "Huracan", "Murcielago", "Urus", "Countach"],
  "Land Rover": ["Defender", "Range Rover", "Range Rover Sport", "Discovery"],
  "Lexus": ["GS", "GX", "IS", "LC", "LFA", "LS", "LX", "RC", "RC F", "SC"],
  "Lincoln": ["Continental", "Navigator"],
  "Lotus": ["Elise", "Evora", "Exige", "Emira", "Esprit"],
  "Maserati": ["GranTurismo", "Ghibli", "Levante", "Quattroporte", "MC20"],
  "Mazda": ["MX-5 Miata", "RX-7", "RX-8", "Mazda3", "Mazda6", "CX-5", "CX-9"],
  "McLaren": ["570S", "600LT", "620R", "650S", "675LT", "720S", "765LT", "P1", "Artura"],
  "Mercedes-Benz": ["A-Class", "C-Class", "E-Class", "S-Class", "G-Class", "GLE", "GLS", "AMG GT", "CLA", "CLS", "GLA", "GLB", "GLC", "SL", "SLC", "SLK", "CLK", "ML"],
  "Mini": ["Cooper", "Cooper S", "John Cooper Works", "Countryman"],
  "Mitsubishi": ["Lancer Evolution", "Eclipse", "3000GT"],
  "Nissan": ["350Z", "370Z", "Z", "GT-R", "Skyline", "Silvia", "240SX", "300ZX", "Frontier", "Pathfinder", "Titan"],
  "Oldsmobile": ["442", "Cutlass"],
  "Pontiac": ["Firebird", "Trans Am", "GTO", "G8"],
  "Porsche": ["911", "718 Boxster", "718 Cayman", "Cayenne", "Macan", "Panamera", "Taycan", "928", "944", "968", "356", "Carrera GT"],
  "Ram": ["1500", "2500", "3500", "TRX"],
  "Rivian": ["R1T", "R1S"],
  "Subaru": ["BRZ", "Impreza", "WRX", "STI", "Outback", "Forester", "Crosstrek"],
  "Tesla": ["Model 3", "Model S", "Model X", "Model Y", "Cybertruck", "Roadster"],
  "Toyota": ["4Runner", "Camry", "Celica", "Corolla", "GR86", "GR Corolla", "GR Supra", "Highlander", "Land Cruiser", "MR2", "RAV4", "Sequoia", "Supra", "Tacoma", "Tundra", "FJ Cruiser"],
  "Volkswagen": ["Golf", "Golf R", "GTI", "Jetta", "Passat", "Tiguan", "Atlas", "ID.4", "Beetle", "Bus", "Corrado"],
  "Volvo": ["240", "P1800", "S60", "V60", "XC40", "XC60", "XC90"],
};

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

  const makeNames = Object.keys(MAKES_AND_MODELS);

  const filteredModels = useMemo(() => {
    const typed = form.make.trim().toLowerCase();
    if (!typed) return [];
    const match = makeNames.find(m => m.toLowerCase() === typed);
    return match ? MAKES_AND_MODELS[match] : [];
  }, [form.make]);

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
          <Input id="make" list="makes-list" placeholder="e.g. Toyota" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <Input id="model" list="models-list" placeholder="e.g. Camry" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required />
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
      <datalist id="makes-list">
        {makeNames.map(m => <option key={m} value={m} />)}
      </datalist>
      <datalist id="models-list">
        {filteredModels.map(m => <option key={m} value={m} />)}
      </datalist>
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
