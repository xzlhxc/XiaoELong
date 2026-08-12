import { useEffect, useRef } from "react";
import { AuthPage } from "./components/pages/AuthPage";
import { AvatarPage } from "./components/pages/AvatarPage";
import { DivinePage } from "./components/pages/DivinePage";
import { LoadingPage } from "./components/pages/LoadingPage";
import { PanelPage } from "./components/pages/PanelPage";
import { SinglePage } from "./components/pages/SinglePage";
import { useAuth } from "./contexts/AuthContext";
import { useDesktop } from "./contexts/DesktopContext";

export default function App(): JSX.Element {
  const { desktopRole, panelOpen, clear } = useDesktop();
  const { currentUser, booting } = useAuth();

  // ---- 登出/注销后清理桌面状态（面板视图、注销/详情弹窗回到默认） ----

  const hadUserRef = useRef(false);
  useEffect(() => {
    if (currentUser) {
      hadUserRef.current = true;
      return;
    }
    if (hadUserRef.current) {
      hadUserRef.current = false;
      clear();
    }
  }, [currentUser, clear]);

  useEffect(() => {
    if (
      !window.xiaoelongDesktop?.setWindowMode ||
      desktopRole === "panel" ||
      desktopRole === "avatar" ||
      desktopRole === "divine"
    ) {
      return;
    }
    if (booting) {
      return;
    }
    if (!currentUser) {
      window.xiaoelongDesktop.setWindowMode("auth");
      return;
    }
    if (desktopRole === "auth") {
      window.xiaoelongDesktop.setWindowMode("collapsed");
      return;
    }
    window.xiaoelongDesktop.setWindowMode(panelOpen ? "expanded" : "collapsed");
  }, [booting, currentUser, panelOpen, desktopRole]);

  if (booting) {
    return <LoadingPage />;
  }

  if (!currentUser) {
    return <AuthPage />;
  }

  if (desktopRole === "panel") {
    return <PanelPage />;
  }

  if (desktopRole === "divine") {
    return <DivinePage />;
  }

  if (desktopRole === "avatar") {
    return <AvatarPage />;
  }

  return <SinglePage />;
}
