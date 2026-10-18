import { useEffect } from "react";
import { moveFocus, type Direction } from "./spatial";

const KEYS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const isTextField = (el: Element | null) =>
  el instanceof HTMLInputElement ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement;

/**
 * Arrow keys move focus spatially (except inside text fields); Escape / gamepad B goes back.
 * Gamepad: D-pad or left stick moves focus, A activates, B goes back.
 */
export function useNavigation(onBack: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") {
        if (document.querySelector("[aria-modal='true']")) return;
        onBack();
        return;
      }
      const dir = KEYS[e.key];
      if (!dir || isTextField(document.activeElement)) return;
      if (document.activeElement?.getAttribute("role") === "tab") return;
      if (moveFocus(dir)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);

    let frame = 0;
    let last = 0;
    let prevA = false;
    let prevB = false;
    const poll = (now: number) => {
      const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
      const pad = pads.find((p) => p !== null);
      if (pad) {
        const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        let dir: Direction | null = null;
        if (btn(12) || ay < -0.6) dir = "up";
        else if (btn(13) || ay > 0.6) dir = "down";
        else if (btn(14) || ax < -0.6) dir = "left";
        else if (btn(15) || ax > 0.6) dir = "right";
        if (dir && now - last > 180) {
          moveFocus(dir);
          last = now;
        }
        const a = btn(0);
        const b = btn(1);
        if (a && !prevA) (document.activeElement as HTMLElement | null)?.click();
        if (b && !prevB) {
          const cancel = document.querySelector<HTMLElement>("[aria-modal='true'] [data-cancel]");
          if (cancel) cancel.click();
          else onBack();
        }
        prevA = a;
        prevB = b;
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
    };
  }, [onBack]);
}
