import { useDesktop } from "../../contexts/DesktopContext";

export function LoadingPage(): JSX.Element {
  const { desktopRole } = useDesktop();

  if (desktopRole === "avatar" || desktopRole === "panel" || desktopRole === "divine") {
    return <main className="page shell-page empty-page" />;
  }

  return (
    <main className="page auth-page loading-page">
      <p>加载中...</p>
    </main>
  );
}
