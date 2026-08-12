import { useLayoutEffect } from "react";
import { useChat } from "../../contexts/ChatContext";
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
  const { historyInitialized } = useChat();
  const contentReady = panelView !== "home" || activeTab !== "chat" || historyInitialized;

  useLayoutEffect(() => {
    if (panelRevealRequestId <= 0 || !contentReady) {
      return;
    }

    return scheduleAfterNextPaint(() => {
      window.xiaoelongDesktop?.notifyPanelReady?.(panelRevealRequestId);
    });
  }, [panelView, activeTab, panelRevealRequestId, contentReady]);

  return (
    <main className="page shell-page panel-page">
      <PanelContent />
    </main>
  );
}
