"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PriceChart } from "@/components/price-chart";
import { StatusBadge } from "@/components/status-badge";
import { ExternalLink, Car } from "lucide-react";

const sourceLabels: Record<string, string> = {
  autotrader: "Autotrader",
  bat: "BaT",
  carsandbids: "Cars & Bids",
};

function formatPrice(cents: number | null) {
  if (!cents) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function VehicleDetailPage() {
  const params = useParams();
  const vin = params.vin as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["vehicle", vin],
    queryFn: async () => {
      const res = await fetch(`/api/vehicles/${vin}`);
      if (!res.ok) throw new Error("Failed to fetch vehicle");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto py-12 text-center text-muted-foreground">
          Loading vehicle data...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-4xl mx-auto py-12 text-center text-muted-foreground">
          Failed to load vehicle data
        </div>
      </div>
    );
  }

  const { vin_data, listings, price_history } = data;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Car className="h-8 w-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold">
              {vin_data.year} {vin_data.make} {vin_data.model}
              {vin_data.trim ? ` ${vin_data.trim}` : ""}
            </h1>
            <p className="text-muted-foreground text-sm font-mono">VIN: {vin}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <InfoRow label="Year" value={vin_data.year} />
              <InfoRow label="Make" value={vin_data.make} />
              <InfoRow label="Model" value={vin_data.model} />
              <InfoRow label="Trim" value={vin_data.trim} />
              <InfoRow label="Series" value={vin_data.series} />
              <InfoRow label="Body Style" value={vin_data.bodyClass} />
              <InfoRow label="Doors" value={vin_data.doors} />
              <InfoRow label="Drive Type" value={vin_data.driveType} />
              <InfoRow label="Vehicle Type" value={vin_data.vehicleType} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Engine & Transmission</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <InfoRow label="Cylinders" value={vin_data.engineCylinders} />
              <InfoRow label="Displacement" value={vin_data.engineDisplacement ? `${vin_data.engineDisplacement}L` : null} />
              <InfoRow label="Horsepower" value={vin_data.engineHP ? `${vin_data.engineHP} HP` : null} />
              <InfoRow label="Fuel Type" value={vin_data.fuelType} />
              <InfoRow label="Transmission" value={vin_data.transmission} />
              <InfoRow label="GVWR" value={vin_data.gvwr} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manufacturing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <InfoRow label="Plant City" value={vin_data.plantCity} />
              <InfoRow label="Plant State" value={vin_data.plantState} />
              <InfoRow label="Plant Country" value={vin_data.plantCountry} />
            </CardContent>
          </Card>
        </div>

        {price_history?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Price History</CardTitle>
            </CardHeader>
            <CardContent>
              <PriceChart data={price_history} />
            </CardContent>
          </Card>
        )}

        {listings?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Listings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {listings.map((listing: any) => (
                <div
                  key={listing.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">
                      {sourceLabels[listing.source_site] || listing.source_site}
                    </Badge>
                    <StatusBadge status={listing.status} />
                    <span className="font-semibold">
                      {listing.status === "sold"
                        ? formatPrice(listing.sale_price)
                        : formatPrice(listing.current_price)}
                    </span>
                    {listing.geography && (
                      <span className="text-sm text-muted-foreground">
                        {listing.geography}
                      </span>
                    )}
                  </div>
                  <a
                    href={listing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
