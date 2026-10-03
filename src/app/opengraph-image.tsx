import { ImageResponse } from "next/og";
import { SITE } from "@/lib/config/site";

export const runtime = "nodejs";
export const alt = `${SITE.name} — post-quantum migration readiness instrument`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * OpenGraph card, drawn from the same palette as the app so a shared link looks
 * like the product rather than a generic template.
 */
export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(160deg, #1b1714 0%, #0e0c0b 70%)",
          padding: 64,
          color: "#e2dbcb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              border: "2px solid #a55c2d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              color: "#dc9558",
            }}
          >
            CT
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: "#f3ede1" }}>{SITE.name}</span>
            <span style={{ fontSize: 17, color: "#a2988a", letterSpacing: 2 }}>
              POST-QUANTUM READINESS SURVEY
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 58, fontWeight: 700, color: "#f3ede1", lineHeight: 1.1 }}>
            Your cryptography
          </span>
          <span style={{ fontSize: 58, fontWeight: 700, color: "#dc9558", lineHeight: 1.1 }}>
            has a rupture date.
          </span>
          <span style={{ fontSize: 24, color: "#c4bba9" }}>
            Shor + Grover resource estimates · rupture scrub · Grover-sequenced migration waves ·
            SHA-384 sealed audit chain
          </span>
        </div>

        <div style={{ display: "flex", gap: 40, fontSize: 18, color: "#7d746a" }}>
          <span>Shor attack costs</span>
          <span>Harvest-now-decrypt-later exposure</span>
          <span>NIST IR 8547 clock</span>
          <span>MCP agent tools</span>
        </div>
      </div>
    ),
    size,
  );
}