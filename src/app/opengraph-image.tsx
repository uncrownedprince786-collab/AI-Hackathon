import { ImageResponse } from "next/og";
import { getStats } from "@/lib/hackathons";
import { formatUsd } from "@/lib/format";

export const alt = "AI Hackathons — find real AI hackathons worldwide";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 21600;

const ACCENT = "#3b5bdb";
const INK = "#1f2937";
const MUTED = "#6b7280";

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
          background: "#faf8f3",
          color: INK,
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
              border: "5px solid " + ACCENT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 800,
              color: ACCENT,
            }}
          >
            AI
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>AI Hackathons</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.1, letterSpacing: -2 }}>
            Find real AI hackathons worldwide
          </div>
          <div style={{ fontSize: 30, color: MUTED }}>Verified events, real prizes, actual winners.</div>
        </div>

        <div style={{ display: "flex", gap: 44 }}>
          <Stat value={String(stats.ongoing)} label="Ongoing now" color={ACCENT} />
          <Stat value={String(stats.upcoming)} label="Upcoming" color={ACCENT} />
          <Stat value={formatUsd(stats.totalPrizeUsd)} label="Prize money" color={ACCENT} />
          <Stat value={String(stats.total)} label="Hackathons" color={MUTED} />
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
      <div style={{ fontSize: 20, color: MUTED }}>{label}</div>
    </div>
  );
}