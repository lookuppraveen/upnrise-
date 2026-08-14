// Dev-only floating pill that shows recent roleplay-turn timings.
// Fed by src/lib/roleplay/latency-telemetry.ts. Mounted from
// RoleplayPlayer; only renders when isDebugEnabled() returns true
// (NODE_ENV=development or NEXT_PUBLIC_LATENCY_DEBUG=1).

"use client";

import { useEffect, useState } from "react";
import {
  isDebugEnabled,
  subscribe,
  type TimingEntry,
} from "@/lib/roleplay/latency-telemetry";

export function LatencyDebugPill() {
  const [entries, setEntries] = useState<TimingEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isDebugEnabled());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return subscribe(setEntries);
  }, [enabled]);

  if (!enabled) return null;

  // Group by turn — one row per turn with columns for each stage.
  const byTurn = new Map<number, TimingEntry[]>();
  for (const e of entries) {
    const arr = byTurn.get(e.turn) ?? [];
    arr.push(e);
    byTurn.set(e.turn, arr);
  }
  const turns = Array.from(byTurn.keys()).sort((a, b) => b - a).slice(0, 8);

  const last = entries[entries.length - 1];

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 9999,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 11,
      }}
    >
      {open ? (
        <div
          style={{
            background: "rgba(20, 20, 24, 0.94)",
            color: "#e6e6e6",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
            padding: "10px 12px",
            minWidth: 320,
            maxWidth: 460,
            backdropFilter: "blur(8px)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span style={{ fontWeight: 600, opacity: 0.9 }}>
              Roleplay latency
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#e6e6e6",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                opacity: 0.7,
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
            }}
          >
            <thead>
              <tr style={{ color: "#888" }}>
                <th style={cellStyle}>#</th>
                <th style={cellStyle}>start</th>
                <th style={cellStyle}>stt</th>
                <th style={cellStyle}>turn</th>
                <th style={cellStyle}>tts</th>
                <th style={cellStyle}>adapt</th>
              </tr>
            </thead>
            <tbody>
              {turns.map((t) => {
                const es = byTurn.get(t) ?? [];
                const start = es.find((x) => x.kind === "start");
                const stt = es.find((x) => x.kind === "stt");
                const turn = es.find((x) => x.kind === "turn");
                const tts = es.find((x) => x.kind === "tts");
                const adapt = es.find((x) => x.kind === "adapt");
                return (
                  <tr key={t}>
                    <td style={{ ...cellStyle, opacity: 0.6 }}>
                      {t === 0 ? "op" : t}
                    </td>
                    <td style={cellStyle}>{fmtCell(start)}</td>
                    <td style={cellStyle}>{fmtCell(stt)}</td>
                    <td style={cellStyle}>{fmtCell(turn, true)}</td>
                    <td style={cellStyle}>{fmtCell(tts)}</td>
                    <td style={cellStyle}>{fmtAdapt(adapt)}</td>
                  </tr>
                );
              })}
              {turns.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...cellStyle, opacity: 0.5 }}>
                    no turns yet
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div
            style={{
              marginTop: 8,
              paddingTop: 6,
              borderTop: "1px solid rgba(255,255,255,0.1)",
              opacity: 0.6,
              fontSize: 10,
            }}
          >
            client_total (server_handler) · turn=ttfb/total · adapt=eff_ms(delta)
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: "rgba(20,20,24,0.9)",
            color: "#e6e6e6",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 999,
            padding: "6px 12px",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 11,
          }}
          title="Roleplay latency (dev)"
        >
          ⏱ {last ? `${last.kind}: ${last.totalMs}ms` : "latency"}
        </button>
      )}
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "3px 6px",
  textAlign: "left",
  fontSize: 11,
  fontFamily: "inherit",
};

function fmtCell(e: TimingEntry | undefined, showTtfb = false): string {
  if (!e) return "·";
  const total = `${e.totalMs}`;
  const server = e.serverMs !== undefined ? ` (${e.serverMs})` : "";
  const ttfb =
    showTtfb && e.ttfbMs !== undefined ? `${e.ttfbMs}/` : "";
  return `${ttfb}${total}${server}`;
}

// Adapt cells encode the effective silence gate in totalMs and the
// current delta in serverMs (positive = trainee needs more patience,
// negative = trainee is snappy). Render as `<eff>(<+/-delta>)`.
function fmtAdapt(e: TimingEntry | undefined): string {
  if (!e) return "·";
  const eff = e.totalMs;
  const delta = e.serverMs ?? 0;
  const sign = delta > 0 ? "+" : "";
  return `${eff}(${sign}${delta})`;
}
