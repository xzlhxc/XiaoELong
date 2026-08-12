import { useAuth } from "../../contexts/AuthContext";
import { useDesktop } from "../../contexts/DesktopContext";
import { JoinForm } from "../panels/JoinForm";

export function AuthPage(): JSX.Element {
  const { desktopRole } = useDesktop();
  const { token, sessionRestoreError, retrySession } = useAuth();

  if (desktopRole === "avatar" || desktopRole === "panel" || desktopRole === "divine") {
    return <main className="page shell-page empty-page" />;
  }

  if (token) {
    return (
      <main className="page auth-page">
        <section className="join-card session-recovery-card" aria-live="polite">
          <h1>正在恢复登录</h1>
          <p>{sessionRestoreError || "正在验证已保存的登录状态，请稍候。"}</p>
          <button type="button" onClick={() => retrySession()}>
            立即重试
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page auth-page">
      <JoinForm />
    </main>
  );
}
