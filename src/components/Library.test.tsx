// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { manifest, record } from "../test/fixtures";
import { Library } from "./Library";

const ms = [manifest("soh", "Ship of Harkinian"), manifest("twoship", "2 Ship 2 Harkinian")];

function setup(lang: "en" | "he" = "en") {
  const onOpen = vi.fn();
  render(
    <I18nProvider lang={lang}>
      <Library manifests={ms} installed={{ soh: record("9.3.0") }} updates={{}} onOpen={onOpen} />
    </I18nProvider>,
  );
  return { onOpen };
}

describe("Library", () => {
  it("shows a card per port with install status and opens it", async () => {
    const { onOpen } = setup();
    const grid = screen.getByRole("list", { name: "Library" });
    expect(within(grid).getAllByRole("button")).toHaveLength(2);
    expect(screen.getByText("Installed 9.3.0")).toBeInTheDocument();
    expect(within(grid).getByText("Not installed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Ship of Harkinian/ }));
    expect(onOpen).toHaveBeenCalledWith("soh");
  });

  it("filters by search and shows a helpful empty state", async () => {
    setup();
    await userEvent.type(screen.getByRole("searchbox"), "2 ship");
    expect(
      within(screen.getByRole("list", { name: "Library" })).getAllByRole("button"),
    ).toHaveLength(1);
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "nothing-matches");
    expect(screen.getByText("No ports match your filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(
      within(screen.getByRole("list", { name: "Library" })).getAllByRole("button"),
    ).toHaveLength(2);
  });

  it("filters installed ports", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Installed" }));
    expect(
      within(screen.getByRole("list", { name: "Library" })).getAllByRole("button"),
    ).toHaveLength(1);
  });

  it("renders Hebrew and sets RTL direction", () => {
    setup("he");
    expect(screen.getByRole("heading", { name: "ספרייה" })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("he");
  });
});
