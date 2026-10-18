/** Small inline icon set (stroke icons, 24px grid). Decorative: hidden from screen readers. */
const PATHS = {
  library: "M4 5h6v14H4zM14 5h6v6h-6zM14 15h6v4h-6z",
  settings:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  play: "M7 4.5v15l13-7.5z",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  folder: "M3 6.5h6l2 2h10v10H3z",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  steam:
    "M12 21a9 9 0 1 0-8.6-11.7l4.9 2a2.6 2.6 0 0 1 2.4-.4L13 8a3 3 0 1 1 3 3l-3 2.2a2.6 2.6 0 0 1-5 .8l-4.4-1.8A9 9 0 0 0 12 21z",
  back: "M15 5l-7 7 7 7",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 3l10 18H2zM12 10v5M12 18v.5",
  close: "M6 6l12 12M18 6L6 18",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z",
  upload: "M12 20V9M7 14l5-5 5 5M5 4h14",
  globe:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
