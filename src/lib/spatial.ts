/**
 * Spatial focus navigation for keyboard arrows and gamepads (Steam Deck): moves focus to the
 * nearest focusable element in the pressed direction.
 */
export type Direction = "up" | "down" | "left" | "right";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Picks the best candidate index for `dir` from `from`. Pure; exported for tests. */
export function pickNext(from: Box, candidates: Box[], dir: Direction): number {
  const c = center(from);
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((b, i) => {
    const p = center(b);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const along = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy;
    const across = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    if (along <= 1) return;
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

export function moveFocus(dir: Direction, root: ParentNode = document): boolean {
  const scope = (document.querySelector("[aria-modal='true']") as ParentNode | null) ?? root;
  const all = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  );
  const active = document.activeElement as HTMLElement | null;
  if (!active || !all.includes(active)) {
    all[0]?.focus();
    return all.length > 0;
  }
  const boxOf = (el: HTMLElement): Box => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const others = all.filter((el) => el !== active);
  const i = pickNext(boxOf(active), others.map(boxOf), dir);
  const target = others[i];
  if (!target) return false;
  target.focus();
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}
