// AppProviders.tsx — 组装所有 Context Provider
// 随着重构推进，每次会话往 FeatureProviders 数组中加一个新 Provider
import { DesktopProvider } from "./contexts/DesktopContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ChatProvider } from "./contexts/ChatContext";
import { DailyProvider } from "./contexts/DailyContext";
import { DeityProvider } from "./contexts/DeityContext";
import { GomokuProvider } from "./contexts/GomokuContext";

// Daily 位于 Chat 内部，以便 REST 保存心情后即时同步在线成员状态；其余领域通过 Auth 资料状态协同。
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
