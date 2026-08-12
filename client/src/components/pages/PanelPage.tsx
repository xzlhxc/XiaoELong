import { useLayoutEffect } from "react";
import { useDesktop } from "../../contexts/DesktopContext";
import { PanelContent } from "./PanelContent";

function scheduleAfterNextPaint(callback: () => void): () => void {
  let secondFrame: number | null = null;
  const firstFrame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(callback);
  });

  return () => {
    window.cancelAnimationFrame(firstFrame);
    if (secondFrame !== null) {
      window.cancelAnimationFrame(secondFrame);
    }
  };
}

export function PanelPage(): JSX.Element {
  const { panelRevealRequestId, panelView, activeTab } = useDesktop();

  useLayoutEffect(() => {
    if (panelRevealRequestId <= 0) {
      return;
    }

    return scheduleAfterNextPaint(() => {
      window.xiaoelongDesktop?.notifyPanelReady?.(panelRevealRequestId);
    });
  }, [panelView, activeTab, panelRevealRequestId]);

  return (
    <main className="page shell-page panel-page">
      <PanelContent />
    </main>
  );
}
