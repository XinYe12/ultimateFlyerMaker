// apps/desktop/src/renderer/settings/SerperLearningPanel.tsx

import { useState, useEffect } from "react";
import Card from "../components/ui/Card";

type Stats = {
  totalSignals: number;
  serperRunCount: number;
  dbFirstCount: number;
  recentRanks: number[];
  firstPickRate: number;
  topDomains: Array<{ domain: string; acceptRate: number; total: number }>;
};

const MIN_SIGNALS = 10;
const SPARKLINE_W = 320;
const SPARKLINE_H = 64;
const MAX_RANK = 5; // y-axis ceiling

function Sparkline({ ranks }: { ranks: number[] }) {
  if (ranks.length < 2) return null;

  const points = ranks.map((r, i) => {
    const x = (i / (ranks.length - 1)) * SPARKLINE_W;
    const clipped = r < 0 ? MAX_RANK : Math.min(r, MAX_RANK);
    const y = (clipped / MAX_RANK) * (SPARKLINE_H - 8) + 4;
    return { x, y, noResult: r < 0 };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(" ");

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
        Accepted rank over last {ranks.length} searches — lower is better
      </div>
      <svg
        width={SPARKLINE_W}
        height={SPARKLINE_H}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Gridlines at rank 0, 2, 4 */}
        {[0, 2, 4].map(rank => {
          const y = (rank / MAX_RANK) * (SPARKLINE_H - 8) + 4;
          return (
            <g key={rank}>
              <line x1={0} y1={y} x2={SPARKLINE_W} y2={y} stroke="#e2e8f0" strokeWidth={1} />
              <text x={SPARKLINE_W + 4} y={y + 4} fontSize={9} fill="#94a3b8">{rank}</text>
            </g>
          );
        })}
        {/* Trend line */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#6366f1"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Dots — grey for no-result, indigo for normal */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={3}
            fill={p.noResult ? "#cbd5e1" : "#6366f1"}
          />
        ))}
      </svg>
      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
        Grey dots = no result found
      </div>
    </div>
  );
}

export default function SerperLearningPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.ufm.getSerperLearningStats().then(result => {
      setStats(result ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const statCardStyle: React.CSSProperties = {
    flex: 1,
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: "12px 16px",
    textAlign: "center" as const,
  };

  return (
    <Card style={{ padding: 24, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 4px", fontSize: "var(--text-lg)", fontWeight: "var(--font-semibold)" }}>
        Search Learning
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: "var(--text-sm)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
        The app learns which image sources work best for your products. Over time it prioritises trusted domains and reuses previously accepted images.
      </p>

      {loading && (
        <span style={{ fontSize: 13, color: "#94a3b8" }}>Loading…</span>
      )}

      {!loading && !stats && (
        <span style={{ fontSize: 13, color: "#f59e0b" }}>
          Could not load learning stats — check Firestore connection.
        </span>
      )}

      {!loading && stats && stats.totalSignals < MIN_SIGNALS && (
        <div style={{ fontSize: 13, color: "#64748b", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 16px" }}>
          Not enough data yet — run more batch jobs to see learning progress.
          <span style={{ marginLeft: 8, color: "#94a3b8" }}>({stats.totalSignals}/{MIN_SIGNALS} searches recorded)</span>
        </div>
      )}

      {!loading && stats && stats.totalSignals >= MIN_SIGNALS && (
        <>
          {/* Stat cards */}
          <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
            <div style={statCardStyle}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#6366f1", lineHeight: 1.1 }}>
                {stats.firstPickRate}%
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                First-pick rate
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                last {stats.recentRanks.length} Serper runs
              </div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e", lineHeight: 1.1 }}>
                {stats.serperRunCount + stats.dbFirstCount > 0
                  ? Math.round((stats.dbFirstCount / (stats.serperRunCount + stats.dbFirstCount)) * 100)
                  : 0}%
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                DB-first rate
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                skipped web search entirely
              </div>
            </div>
            <div style={statCardStyle}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#0ea5e9", lineHeight: 1.1 }}>
                {stats.totalSignals}
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                Signals recorded
              </div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                searches + swaps
              </div>
            </div>
          </div>

          {/* Sparkline */}
          {stats.recentRanks.length >= 2 && (
            <Sparkline ranks={stats.recentRanks} />
          )}

          {/* Top domains */}
          {stats.topDomains.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 }}>
                Top trusted domains
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "#94a3b8" }}>
                    <th style={{ textAlign: "left" as const, paddingBottom: 6, fontWeight: 500 }}>Domain</th>
                    <th style={{ textAlign: "right" as const, paddingBottom: 6, fontWeight: 500 }}>Accept rate</th>
                    <th style={{ textAlign: "right" as const, paddingBottom: 6, fontWeight: 500 }}>Signals</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topDomains.map(d => (
                    <tr key={d.domain} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "5px 0", color: "#1e293b" }}>{d.domain}</td>
                      <td style={{ padding: "5px 0", textAlign: "right" as const }}>
                        <span style={{
                          color: d.acceptRate >= 75 ? "#22c55e" : d.acceptRate >= 50 ? "#f59e0b" : "#ef4444",
                          fontWeight: 600,
                        }}>
                          {d.acceptRate}%
                        </span>
                      </td>
                      <td style={{ padding: "5px 0", textAlign: "right" as const, color: "#64748b" }}>{d.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
