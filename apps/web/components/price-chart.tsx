"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";

interface PriceChartProps {
  data: { price: number; recorded_at: string }[];
}

export function PriceChart({ data }: PriceChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        No price history available
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: format(new Date(d.recorded_at), "MMM d"),
    price: d.price / 100,
    rawDate: d.recorded_at,
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickLine={false} />
        <YAxis
          stroke="#6b7280"
          fontSize={12}
          tickLine={false}
          tickFormatter={(v) => `$${v.toLocaleString()}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#111827",
            border: "1px solid #1f2937",
            borderRadius: "8px",
            color: "#f9fafb",
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [`$${Number(value).toLocaleString()}`, "Price"]}
        />
        <Line
          type="monotone"
          dataKey="price"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: "#3b82f6", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
