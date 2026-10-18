// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Markdown, isGithubLink, parseBlocks, stripHtml } from "./markdown";

describe("stripHtml", () => {
  it("removes tags, comments and script bodies, decodes entities", () => {
    expect(
      stripHtml("<script>alert(1)</script><b>Hi</b> &amp; <!-- c --><img src=x onerror=alert(1)>"),
    ).toBe("Hi & ");
    expect(stripHtml("a<br>b")).toBe("a\nb");
  });
});

describe("parseBlocks", () => {
  it("parses headings, lists, code, quotes and paragraphs", () => {
    const blocks = parseBlocks(
      "# Title\n\n- one\n- two\n\n1. first\n\n```\ncode <b>\n```\n> quote\n\ntext\nmore",
    );
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "list",
      "list",
      "code",
      "quote",
      "paragraph",
    ]);
    expect(blocks[1]).toEqual({ type: "list", ordered: false, items: ["one", "two"] });
    expect(blocks[5]).toEqual({ type: "paragraph", text: "text more" });
  });
});

describe("Markdown component", () => {
  it("never renders raw HTML elements or real hrefs", () => {
    const { container } = render(
      <Markdown
        source={
          '<a href="javascript:alert(1)">x</a> <iframe src="https://evil"></iframe> [evil](javascript:alert(1)) [site](https://example.com)'
        }
      />,
    );
    expect(container.querySelector("a, iframe, script, img")).toBeNull();
    expect(container.textContent).toContain("evil");
    expect(container.textContent).not.toContain("javascript:");
  });

  it("makes only github.com links clickable, via the callback", () => {
    const onLink = vi.fn();
    render(
      <Markdown
        source="See [release](https://github.com/o/r/releases/tag/v1) and [other](https://example.com)"
        onLink={onLink}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "release" }));
    expect(onLink).toHaveBeenCalledWith("https://github.com/o/r/releases/tag/v1");
    expect(screen.queryByRole("button", { name: "other" })).toBeNull();
  });

  it("renders bold, italic and inline code", () => {
    const { container } = render(<Markdown source="**bold** *it* `x`" />);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("it");
    expect(container.querySelector("code")?.textContent).toBe("x");
  });

  it("validates github links strictly", () => {
    expect(isGithubLink("https://github.com/o/r")).toBe(true);
    expect(isGithubLink("https://github.com.evil.io/o")).toBe(false);
    expect(isGithubLink("http://github.com/o")).toBe(false);
  });
});
