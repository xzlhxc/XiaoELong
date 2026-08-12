// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "../../test-setup";
import { render } from "@testing-library/react";
import { AvatarPage } from "./AvatarPage";

vi.mock("../panels/AvatarDock", () => ({ AvatarDock: () => <div data-testid="avatar-dock" /> }));

describe("AvatarPage", () => {
  it("渲染 avatar-page 壳并包裹 AvatarDock", () => {
    const { container } = render(<AvatarPage />);
    expect(container.querySelector(".shell-page")).toBeTruthy();
    expect(container.querySelector(".avatar-page")).toBeTruthy();
    expect(container.querySelector("[data-testid=avatar-dock]")).toBeTruthy();
  });
});
