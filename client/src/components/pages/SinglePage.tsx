import { useDesktop } from "../../contexts/DesktopContext";
import { AvatarDock } from "../panels/AvatarDock";
import { PanelContent } from "./PanelContent";

export function SinglePage(): JSX.Element {
  const { panelOpen } = useDesktop();

  return (
    <main className="page shell-page">
      <AvatarDock />

      {panelOpen ? <PanelContent /> : null}
    </main>
  );
}
