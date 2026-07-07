import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

if (window.xiaoelongDesktop?.isDesktop) {
  const role = window.xiaoelongDesktop.role ?? new URLSearchParams(window.location.search).get("desktopRole") ?? "auth";
  document.documentElement.classList.add("desktop-runtime");
  document.documentElement.classList.add(`desktop-role-${role}`);
  document.documentElement.dataset.desktopRole = role;
  document.documentElement.dataset.desktopPlacement = "upper-left";
  window.xiaoelongDesktop.onPlacementChange?.((placement) => {
    document.documentElement.dataset.desktopPlacement = placement;
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
