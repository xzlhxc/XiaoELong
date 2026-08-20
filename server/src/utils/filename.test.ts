// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeUtf8Filename } from "./filename.js";

describe("normalizeUtf8Filename", () => {
  it("restores a UTF-8 Chinese multipart filename decoded as Latin-1", () => {
    const mojibake = Buffer.from("中文资料.pdf", "utf8").toString("latin1");
    expect(normalizeUtf8Filename(mojibake)).toBe("中文资料.pdf");
  });

  it("keeps an already valid Unicode filename unchanged", () => {
    expect(normalizeUtf8Filename("中文资料.pdf")).toBe("中文资料.pdf");
  });

  it("does not damage a genuine Latin-1 filename that cannot decode as UTF-8", () => {
    expect(normalizeUtf8Filename("café.txt")).toBe("café.txt");
  });
});
