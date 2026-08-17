import type { ModuleTab } from "../../contexts/DesktopContext";

interface ModuleTabIconProps {
  tab: ModuleTab;
}

export function ModuleTabIcon({ tab }: ModuleTabIconProps): JSX.Element {
  if (tab === "chat") {
    return (
      <svg className="module-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.2 5.1h9.3a3.2 3.2 0 0 1 3.2 3.2v2.3a3.2 3.2 0 0 1-3.2 3.2H9.7l-3.8 2.8.8-2.9a3.2 3.2 0 0 1-3.3-3.1V6.9a1.8 1.8 0 0 1 1.8-1.8Z" />
        <path d="M9.9 17h4.5l3.5 2.3-.6-2.6a3 3 0 0 0 2.8-3v-3" />
        <path d="M7.2 9.4h.1M10.6 9.4h.1M14 9.4h.1" />
      </svg>
    );
  }

  if (tab === "daily") {
    return (
      <svg className="module-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.2 4.2h9.1l3 3v12.1H6.2a1.8 1.8 0 0 1-1.8-1.8V6a1.8 1.8 0 0 1 1.8-1.8Z" />
        <path d="M14.9 4.5v3.2h3.2M8 9h6.2M8 12h3.3" />
        <path d="M14.5 13.3c0-1.1.8-1.8 2-1.8 1.1 0 1.9.6 1.9 1.6 0 1.5-1.7 1.5-1.7 2.7M16.7 18.1h.1" />
      </svg>
    );
  }

  if (tab === "divine") {
    return (
      <svg className="module-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 1.3 4.3L17 9l-3.7 1.7L12 15l-1.3-4.3L7 9l3.7-1.7L12 3Z" />
        <path d="M4.3 14.2c1.4 3.6 4.2 5.7 7.7 5.7 3.4 0 6.3-2.1 7.7-5.7" />
        <path d="M4.1 9.2h.1M19.8 7.4h.1M18.8 18.7h.1" />
      </svg>
    );
  }

  return (
    <svg className="module-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" />
      <circle className="module-tab-icon-stone module-tab-icon-stone-dark" cx="9.3" cy="9.3" r="2.2" />
      <circle className="module-tab-icon-stone" cx="14.7" cy="14.7" r="2.2" />
    </svg>
  );
}
