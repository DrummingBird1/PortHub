import type { Console } from "../lib/types";

/**
 * Generated, branded cover art. PortHub never uses copyrighted box art: every card gets a
 * console-themed gradient in the brand palette, a sailboat watermark and the port title.
 */
const PALETTE: Record<Console, [string, string]> = {
  n64: ["#0d9488", "#4f46e5"],
  gamecube: ["#4f46e5", "#7c3aed"],
  wii: ["#0ea5e9", "#6366f1"],
  ps1: ["#2563eb", "#0891b2"],
  ps2: ["#1d4ed8", "#4338ca"],
  snes: ["#7c3aed", "#db2777"],
  gba: ["#0891b2", "#7c3aed"],
  nds: ["#0f766e", "#2563eb"],
  other: ["#334155", "#4f46e5"],
};

const CONSOLE_SHORT: Record<Console, string> = {
  n64: "N64",
  gamecube: "GAMECUBE",
  wii: "WII",
  ps1: "PS1",
  ps2: "PS2",
  snes: "SNES",
  gba: "GBA",
  nds: "NDS",
  other: "PORT",
};

/** Stable hash of the port id, so cards of the same console still differ. */
function hash(id: string): number {
  let h = 7;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Rotate a #rrggbb colour's hue by `deg` degrees. */
export function rotateHue(hex: string, deg: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (((h * 60 + deg) % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

export function CoverArt({
  id,
  title,
  console: c,
  variant = "card",
}: {
  id: string;
  title: string;
  console: Console;
  variant?: "card" | "hero";
}) {
  const h = hash(id);
  const shiftDeg = (h % 50) - 25;
  const [from, to] = PALETTE[c].map((x) => rotateHue(x, shiftDeg)) as [string, string];
  const angle = h % 2 === 0;
  const sunX = 0.15 + ((h >> 3) % 50) / 100;
  const gid = `g-${variant}-${id}`;
  const hero = variant === "hero";
  const w = hero ? 1200 : 400;
  const ht = hero ? 360 : 225;
  return (
    <svg
      className={`cover cover-${variant}`}
      viewBox={`0 0 ${w} ${ht}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={title}
      direction="ltr"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1={angle ? "0" : "1"} x2="1" y2={angle ? "1" : "0"}>
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <radialGradient id={`${gid}-glow`} cx={sunX} cy="0.05" r="0.75">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={w} height={ht} fill={`url(#${gid})`} />
      <rect width={w} height={ht} fill={`url(#${gid}-glow)`} />
      {/* Sailboat watermark (brand mark) */}
      <g
        transform={
          hero ? `translate(${w * 0.56} 34) scale(3)` : `translate(${w - 150} 18) scale(1.45)`
        }
        fill="#ffffff"
        opacity="0.16"
      >
        <path d="M48 8 L48 62 L18 62 Z" />
        <path d="M54 18 L54 62 L80 62 Z" />
        <path d="M10 68 H90 L80 82 H20 Z" />
        <path d="M6 90 H94" stroke="#ffffff" strokeWidth="4" />
      </g>
      {/* Wave lines */}
      <path
        d={`M0 ${ht * 0.78} C ${w * 0.25} ${ht * 0.7}, ${w * 0.5} ${ht * 0.88}, ${w} ${ht * 0.74} V ${ht} H 0 Z`}
        fill="#000000"
        opacity="0.18"
      />
      <text
        direction="ltr"
        textAnchor="start"
        x={hero ? 48 : 22}
        y={hero ? 64 : 38}
        fill="#ffffff"
        opacity="0.75"
        fontSize={hero ? 22 : 13}
        fontWeight={700}
        letterSpacing="0.18em"
        fontFamily="Inter, 'Segoe UI', system-ui, sans-serif"
      >
        {CONSOLE_SHORT[c]}
      </text>
      {!hero && (
        <text
          direction="ltr"
          textAnchor="start"
          x={22}
          y={ht - 26}
          fill="#ffffff"
          fontSize={26}
          fontWeight={800}
          fontFamily="Inter, 'Segoe UI', system-ui, sans-serif"
        >
          {title.length > 24 ? `${title.slice(0, 23)}…` : title}
        </text>
      )}
    </svg>
  );
}
