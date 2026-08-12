// AppProviders.tsx — 组装所有 Context Provider
// 随着重构推进，每次会话往 FeatureProviders 数组中加一个新 Provider
import { DesktopProvider } from "./contexts/DesktopContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ChatProvider } from "./contexts/ChatContext";
import { DailyProvider } from "./contexts/DailyContext";
import { DeityProvider } from "./contexts/DeityContext";
import { GomokuProvider } from "./contexts/GomokuContext";

// Chat / Daily / Deity / Gomoku 互相独立，平级组合
const FeatureProviders: React.ComponentType<{ children: React.ReactNode }>[] = [
  ChatProvider,
  DailyProvider,
  DeityProvider,
  GomokuProvider,
];

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <DesktopProvider>
      <AuthProvider>
        {FeatureProviders.reduceRight(
          (acc, Provider) => <Provider>{acc}</Provider>,
          children
        )}
      </AuthProvider>
    </DesktopProvider>
  );
}
