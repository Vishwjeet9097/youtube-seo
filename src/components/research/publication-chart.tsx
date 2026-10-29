"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VideoRecord } from "@/types/research";

export function PublicationChart({ videos }: { videos: readonly VideoRecord[] }) {
  const data = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const video of videos) {
      const date = new Date(video.publishedAt);
      if (Number.isNaN(date.getTime())) continue;
      const key = date.toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets].sort(([left], [right]) => left.localeCompare(right)).map(([date, count]) => ({ date: date.slice(5), videos: count }));
  }, [videos]);

  if (!data.length) return <div className="grid h-64 place-items-center text-sm text-muted">No publish dates are available.</div>;
  return (
    <div className="h-64 w-full" role="img" aria-label="Videos in sample by UTC publish date">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "var(--muted)", fontSize: 11, fontWeight: 600 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "var(--brand-soft)", opacity: 0.52 }} contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-md)", color: "var(--foreground)", fontSize: 12 }} />
          <Bar dataKey="videos" name="Videos in sample" fill="var(--brand-bright)" radius={[7, 7, 2, 2]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
