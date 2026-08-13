import { useCallback, useEffect, useRef, useState } from "react";

export const REFRESH_STATUS_MIN_VISIBLE_MS = 650;

interface RefreshStatusProps {
  active: boolean;
  label?: string;
}

interface RefreshFeedback {
  isRefreshing: boolean;
  runRefresh: () => Promise<void>;
}

function useMinimumVisible(active: boolean, minimumVisibleMs: number): boolean {
  const [visible, setVisible] = useState(active);
  const visibleSinceRef = useRef<number | null>(active ? Date.now() : null);

  useEffect(() => {
    if (active) {
      if (visibleSinceRef.current === null) {
        visibleSinceRef.current = Date.now();
      }
      setVisible(true);
      return;
    }

    if (visibleSinceRef.current === null) {
      setVisible(false);
      return;
    }

    const elapsedMs = Date.now() - visibleSinceRef.current;
    const remainingMs = Math.max(0, minimumVisibleMs - elapsedMs);
    const timer = window.setTimeout(() => {
      visibleSinceRef.current = null;
      setVisible(false);
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [active, minimumVisibleMs]);

  return visible;
}

export function useRefreshFeedback(
  refresh: () => Promise<void>,
  externalLoading: boolean,
  minimumVisibleMs = REFRESH_STATUS_MIN_VISIBLE_MS
): RefreshFeedback {
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runRefresh = useCallback(async (): Promise<void> => {
    if (refreshInFlightRef.current || externalLoading) {
      return;
    }

    refreshInFlightRef.current = true;
    setManualRefreshing(true);
    const minimumDelay = new Promise<void>((resolve) => {
      window.setTimeout(resolve, minimumVisibleMs);
    });

    try {
      await refresh();
    } finally {
      await minimumDelay;
      refreshInFlightRef.current = false;
      if (mountedRef.current) {
        setManualRefreshing(false);
      }
    }
  }, [externalLoading, minimumVisibleMs, refresh]);

  const isRefreshing = useMinimumVisible(
    externalLoading || manualRefreshing,
    minimumVisibleMs
  );

  return { isRefreshing, runRefresh };
}

export function RefreshStatus({ active, label = "刷新中" }: RefreshStatusProps): JSX.Element {
  return (
    <span
      className={`module-refresh-status${active ? " is-visible" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {active ? label : <span aria-hidden="true">&nbsp;</span>}
    </span>
  );
}
