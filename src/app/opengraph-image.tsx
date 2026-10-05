import { ImageResponse } from "next/og";
import { getStats } from "@/lib/hackathons";
import { formatUsd } from "@/lib/format";

export const alt = "AI Hackathons — all AI hackathons in one place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 21600;

export default async function OpengraphImage() {
  const stats = await getStats();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b1220",
          color: "#e6f6ff",
          padding: 64,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              border: "5px solid #22d3ee",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 800,
              color: "#22d3ee",
            }}
          >
            AI
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
            AI Hackathons
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.1, letterSpacing: -2 }}>
            All AI hackathons in one place
          </div>
          <div style={{ fontSize: 30, color: "#93a7bd" }}>
            Prizes, winners and upcoming events. No login.
          </div>
        </div>

        <div style={{ display: "flex", gap: 44 }}>
          <Stat value={String(stats.ongoing)} label="Ongoing now" color="#4ade80" />
          <Stat value={String(stats.upcoming)} label="Upcoming" color="#22d3ee" />
          <Stat value={formatUsd(stats.totalPrizeUsd)} label="Prize money" color="#22d3ee" />
          <Stat value={String(stats.total)} label="Hackathons" color="#93a7bd" />
        </div>
      </div>
    ),
    size,
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 40, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 20, color: "#93a7bd" }}>{label}</div>
    </div>
  );
}
