import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../src/ui/copy.ts";

function field() {
  return { focus: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn() } as unknown as HTMLInputElement;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("copyText", () => {
  it("uses the clipboard API when it is allowed", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", { execCommand: vi.fn() });
    expect(await copyText("x", field())).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("x");
  });
  it("falls back to selecting and the copy command when the API is refused", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    const execCommand = vi.fn(() => true);
    vi.stubGlobal("document", { execCommand });
    const f = field();
    expect(await copyText("link", f)).toBe("copied");
    expect(f.select).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });
  it("leaves the text selected when nothing works", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { execCommand: vi.fn(() => false) });
    expect(await copyText("link", field())).toBe("selected");
  });
});
