// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../test-setup";
import { render } from "@testing-library/react";
import { useDesktop, type DesktopContextValue } from "../../contexts/DesktopContext";
import { SinglePage } from "./SinglePage";

vi.mock("../../contexts/DesktopContext", () => ({ useDesktop: vi.fn() }));
vi.mock("../panels/AvatarDock", () => ({ AvatarDock: () => <div data-testid="avatar-dock" /> }));
vi.mock("./PanelContent", () => ({ PanelContent: () => <div data-testid="panel-content" /> }));

const mockedUseDesktop = vi.mocked(useDesktop);

beforeEach(() => {
  mockedUseDesktop.mockReturnValue({ panelOpen: true } as unknown as DesktopContextValue);
});

afterEach(() => {
  mockedUseDesktop.mockReset();
});

describe("SinglePage", () => {
  it("panelOpen 时渲染 PanelContent 与 AvatarDock", () => {
    const { container } = render(<SinglePage />);
    expect(container.querySelector("[data-testid=panel-content]")).toBeTruthy();
    expect(container.querySelector("[data-testid=avatar-dock]")).toBeTruthy();
  });

  it("panelOpen=false 时不渲染 PanelContent，仍渲染 AvatarDock", () => {
    mockedUseDesktop.mockReturnValue({ panelOpen: false } as unknown as DesktopContextValue);
    const { container } = render(<SinglePage />);
    expect(container.querySelector("[data-testid=panel-content]")).toBeNull();
    expect(container.querySelector("[data-testid=avatar-dock]")).toBeTruthy();
  });
});
