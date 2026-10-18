// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import * as api from "../lib/api";
import type { InstallRecord, UpdateInfo } from "../lib/types";
import { manifest, record } from "../test/fixtures";
import { GamePage } from "./GamePage";
import { ToastProvider } from "./Toasts";

vi.mock("../lib/api", () => ({
  installPort: vi.fn(),
  launchPort: vi.fn(),
  checkUpdate: vi.fn(),
  addToSteam: vi.fn(),
  uninstallPort: vi.fn(),
  openInstallFolder: vi.fn(),
  openLink: vi.fn(() => Promise.resolve()),
  pickAndHashRom: vi.fn(),
  listMods: vi.fn(() =>
    Promise.resolve({
      supported: true,
      folder: "mods",
      fileTypes: [".otr"],
      catalog: [],
      installed: [],
    }),
  ),
  addLocalMod: vi.fn(),
  setModEnabled: vi.fn(),
  uninstallMod: vi.fn(),
  installCatalogMod: vi.fn(),
}));

const m = manifest("soh", "Ship of Harkinian");

function setup(rec: InstallRecord | null, update?: UpdateInfo) {
  const onRecord = vi.fn();
  const onUpdate = vi.fn();
  render(
    <I18nProvider lang="en">
      <ToastProvider>
        <GamePage
          manifest={m}
          record={rec}
          update={update}
          onRecord={onRecord}
          onUpdate={onUpdate}
          onBack={vi.fn()}
        />
      </ToastProvider>
    </I18nProvider>,
  );
  return { onRecord, onUpdate };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GamePage primary action", () => {
  it("offers Install when not installed, and reports progress then success", async () => {
    let resolve: (r: InstallRecord) => void = () => undefined;
    vi.mocked(api.installPort).mockImplementation((_id, onProgress) => {
      onProgress({ phase: "downloading", downloaded: 50, total: 100 });
      return new Promise((r) => {
        resolve = r;
      });
    });
    const { onRecord } = setup(null);
    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    resolve(record("9.3.0"));
    expect(await screen.findByText("Ship of Harkinian 9.3.0 installed")).toBeInTheDocument();
    expect(onRecord).toHaveBeenCalledWith(expect.objectContaining({ tag: "9.3.0" }));
  });

  it("offers Play when installed and up to date", async () => {
    vi.mocked(api.launchPort).mockResolvedValue(42);
    setup(record());
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(api.launchPort).toHaveBeenCalledWith("soh");
    expect(await screen.findByText("Ship of Harkinian started")).toBeInTheDocument();
  });

  it("offers Update when a newer release exists", () => {
    setup(record("1.0.0"), {
      installed: "1.0.0",
      latest: "2.0.0",
      updateAvailable: true,
      releaseUrl: null,
      notes: "## New\n- Thing",
    });
    expect(screen.getByRole("button", { name: "Update to 2.0.0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("shows install errors as a toast", async () => {
    vi.mocked(api.installPort).mockRejectedValue("checksum mismatch");
    setup(null);
    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("checksum mismatch");
  });
});

describe("GamePage tabs", () => {
  it("renders the changelog as sanitized markdown", async () => {
    setup(record("1.0.0"), {
      installed: "1.0.0",
      latest: "2.0.0",
      updateAvailable: true,
      releaseUrl: null,
      notes: "## Highlights\n- **Faster** <script>bad()</script>",
    });
    await userEvent.click(screen.getByRole("tab", { name: /Updates/ }));
    expect(screen.getByRole("heading", { name: "Highlights" })).toBeInTheDocument();
    expect(screen.getByText("Faster").tagName).toBe("STRONG");
    expect(document.querySelector("script")).toBeNull();
  });

  it("moves between tabs with arrow keys", async () => {
    setup(record());
    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Mods" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Mods" })).toHaveFocus();
  });

  it("uninstalls with keep-files by default after confirmation", async () => {
    vi.mocked(api.uninstallPort).mockResolvedValue({ keptFilesPath: "/lib/saved-data/soh/1" });
    const { onRecord } = setup(record());
    await userEvent.click(screen.getByRole("tab", { name: /Files/ }));
    await userEvent.click(screen.getByRole("button", { name: "Uninstall Ship of Harkinian" }));
    const dialog = screen.getByRole("dialog", { name: "Uninstall Ship of Harkinian?" });
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.click(dialog.querySelector(".btn.danger") as HTMLElement);
    expect(api.uninstallPort).toHaveBeenCalledWith("soh", true);
    expect(onRecord).toHaveBeenCalledWith(null);
    expect(await screen.findByText(/saved-data/)).toBeInTheDocument();
  });
});
