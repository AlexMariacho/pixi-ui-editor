import { afterEach, describe, expect, it, vi } from "vitest";
import { getPreviewWindowFeatures, openRuntimePreview, updateRuntimePreviews, type PreviewPayload } from "./RuntimePreview.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("runtime preview window", () => {
  it("requests half of the selected viewport while preserving its orientation", () => {
    expect(getPreviewWindowFeatures({ width: 1920, height: 1080 })).toContain("width=960,height=540");
    expect(getPreviewWindowFeatures({ width: 750, height: 1334 })).toContain("width=375,height=667");
  });

  it("sends an explicit profile change to an open preview for a full scene rebuild", () => {
    vi.useFakeTimers();
    const previewWindow = { closed: false, postMessage: vi.fn() };
    const parentWindow = {
      location: { href: "http://localhost:5173/", origin: "http://localhost:5173" },
      open: vi.fn(() => previewWindow),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    };
    vi.stubGlobal("window", parentWindow);
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000000" });
    const document = { project: { name: "Preview fixture" } } as PreviewPayload["document"];

    expect(openRuntimePreview({ document, sceneId: "scene-1", profile: "desktop" }, { width: 1920, height: 1080 })).toBe(true);
    updateRuntimePreviews({ document, sceneId: "scene-1", profile: "mobile" });

    expect(previewWindow.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ profile: "mobile" }),
    }), "http://localhost:5173");
    previewWindow.closed = true;
    vi.runOnlyPendingTimers();
  });
});
