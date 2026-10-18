// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { settings } from "../test/fixtures";
import { SettingsPage } from "./SettingsPage";
import { ToastProvider } from "./Toasts";

vi.mock("../lib/api", () => ({ chooseLibraryDir: vi.fn() }));

function setup(extra = {}) {
  const onPrefs = vi.fn();
  render(
    <I18nProvider lang="en">
      <ToastProvider>
        <SettingsPage settings={settings(extra)} onSettings={vi.fn()} onPrefs={onPrefs} />
      </ToastProvider>
    </I18nProvider>,
  );
  return { onPrefs };
}

describe("SettingsPage", () => {
  it("changes theme, language and startup update checks", async () => {
    const { onPrefs } = setup();
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(onPrefs).toHaveBeenCalledWith({ theme: "light" });
    await userEvent.click(screen.getByRole("button", { name: "עברית" }));
    expect(onPrefs).toHaveBeenCalledWith({ language: "he" });
    await userEvent.click(screen.getByRole("switch", { name: /Check installed ports/ }));
    expect(onPrefs).toHaveBeenCalledWith({ checkUpdatesOnStartup: true });
  });

  it("locks the library folder while ports are installed", () => {
    setup({ libraryLocked: true });
    expect(screen.getByRole("button", { name: "Change…" })).toBeDisabled();
    expect(
      screen.getByText("Uninstall all ports to change the library folder."),
    ).toBeInTheDocument();
  });
});
