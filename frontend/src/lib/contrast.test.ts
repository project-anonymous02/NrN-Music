import { describe, expect, it } from "vitest";
import { checkContrast, contrastRatio, isGreen, luminance, onColor, parseHex, toHex } from "./contrast";

describe("parseHex", () => {
  it("expands short hex and accepts optional hash", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("ff5c35")).toEqual({ r: 255, g: 92, b: 53 });
    expect(parseHex("  #000000 ")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("rejects malformed input", () => {
    expect(parseHex("#12345")).toBeNull();
    expect(parseHex("transparent")).toBeNull();
    expect(parseHex("")).toBeNull();
  });
});

describe("contrast", () => {
  it("measures known ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("not-a-color", "#000")).toBe(1);
  });

  it("classifies readability against WCAG AA", () => {
    expect(checkContrast("#ffffff", "#000000")).toEqual({ ratio: 21, readable: true, largeOnly: false });
    expect(checkContrast("#777777", "#ffffff").readable).toBe(false);
    const large = checkContrast("#949494", "#ffffff");
    expect(large.readable).toBe(false);
    expect(large.largeOnly).toBe(true);
  });

  it("orders luminance sensibly", () => {
    expect(luminance({ r: 255, g: 255, b: 255 })).toBeGreaterThan(luminance({ r: 0, g: 0, b: 0 }));
  });

  it("round-trips through toHex", () => {
    expect(toHex(parseHex("#ff5c35")!)).toBe("#ff5c35");
  });
});

describe("onColor", () => {
  it("picks the readable label colour", () => {
    expect(onColor("#ff5c35")).toBe("#000000");
    expect(onColor("#0a0a0a")).toBe("#ffffff");
  });
});

describe("isGreen", () => {
  it("rejects green accents to protect the NrNMusic identity", () => {
    expect(isGreen("#00ff41")).toBe(true);
    expect(isGreen("#1db954")).toBe(true);
    expect(isGreen("#ff5c35")).toBe(false);
    expect(isGreen("#4cc2ff")).toBe(false);
    expect(isGreen("nope")).toBe(false);
  });
});
