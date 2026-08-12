// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../test-setup";
import { render, screen } from "@testing-library/react";
import { useDesktop, type DesktopContextValue } from "../../contexts/DesktopContext";
import { LoadingPage } from "./LoadingPage";

// ============================================================
// Mock 依赖：DesktopContext（只用到 desktopRole）
// ============================================================

vi.mock("../../contexts/DesktopContext", () => ({ useDesktop: vi.fn() }));

const mockedUseDesktop = vi.mocked(useDesktop);

afterEach(() => {
  mockedUseDesktop.mockReset();
});

describe("LoadingPage", () => {
  it("shell 角色（avatar/panel/divine）渲染空页，不渲染加载页", () => {
    for (const role of ["avatar", "panel", "divine"]) {
      mockedUseDesktop.mockReturnValue({ desktopRole: role } as unknown as DesktopContextValue);
      const { container } = render(<LoadingPage />);
      expect(container.querySelector(".empty-page")).toBeTruthy();
      expect(container.querySelector(".loading-page")).toBeNull();
    }
  });

  it("非 shell 角色渲染加载页与'加载中...'，不渲染空页", () => {
    mockedUseDesktop.mockReturnValue({ desktopRole: "single" } as unknown as DesktopContextValue);
    const { container } = render(<LoadingPage />);
    expect(container.querySelector(".loading-page")).toBeTruthy();
    expect(container.querySelector(".empty-page")).toBeNull();
    expect(screen.getByText("加载中...")).toBeTruthy();
  });
});
