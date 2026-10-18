// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import * as api from "../lib/api";
import { settings } from "../test/fixtures";
import { Onboarding } from "./Onboarding";
import { ToastProvider } from "./Toasts";

vi.mock("../lib/api", () => ({ chooseLibraryDir: vi.fn() }));

describe("Onboarding", () => {
  it("explains the legal stance, lets the user pick a library folder, then finishes", async () => {
    vi.mocked(api.chooseLibraryDir).mockResolvedValue(
      settings({ libraryDir: "/games/porthub", libraryPath: "/games/porthub" }),
    );
    const onSettings = vi.fn();
    const onDone = vi.fn();
    const onLanguage = vi.fn();
    render(
      <I18nProvider lang="en">
        <ToastProvider>
          <Onboarding
            settings={settings({ onboarded: false })}
            onSettings={onSettings}
            onLanguage={onLanguage}
            onDone={onDone}
          />
        </ToastProvider>
      </I18nProvider>,
    );
    expect(screen.getByRole("dialog", { name: "Welcome to PortHub" })).toBeInTheDocument();
    expect(screen.getByText("Bring your own ROM")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "עברית" }));
    expect(onLanguage).toHaveBeenCalledWith("he");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("/library")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Change…" }));
    expect(api.chooseLibraryDir).toHaveBeenCalledWith(false);
    expect(onSettings).toHaveBeenCalledWith(
      expect.objectContaining({ libraryPath: "/games/porthub" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Get started" }));
    expect(onDone).toHaveBeenCalled();
  });
});
