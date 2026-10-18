import { formatBytes } from "./format";

export interface Sample {
  at: number;
  bytes: number;
}

export interface Rate {
  /** Bytes per second, smoothed over the sample window. */
  speed: number;
  /** Seconds remaining, or null when unknown. */
  eta: number | null;
  /** 0..1, or null when the total size is unknown. */
  fraction: number | null;
}

/** Keeps the last few seconds of samples. Pure: returns a new array. */
export function pushSample(samples: Sample[], s: Sample, windowMs = 4000): Sample[] {
  const kept = samples.filter((x) => s.at - x.at <= windowMs && x.bytes <= s.bytes);
  return [...kept, s];
}

export function rateOf(samples: Sample[], total: number): Rate {
  const last = samples.at(-1);
  const first = samples[0];
  const fraction = last && total > 0 ? Math.min(1, last.bytes / total) : null;
  if (!last || !first || last.at <= first.at) return { speed: 0, eta: null, fraction };
  const speed = ((last.bytes - first.bytes) * 1000) / (last.at - first.at);
  const eta = speed > 0 && total > 0 ? Math.max(0, (total - last.bytes) / speed) : null;
  return { speed, eta, fraction };
}

export const formatSpeed = (bytesPerSec: number): string => formatBytes(Math.round(bytesPerSec));

export function formatEta(seconds: number): string {
  const s = Math.ceil(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
