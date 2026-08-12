import { useDeity } from "../../contexts/DeityContext";
import { FullScreenDivineSelection } from "../panels/DivineSelectionPanel";

export function DivinePage(): JSX.Element {
  const { divineViewSession } = useDeity();

  return (
    <FullScreenDivineSelection
      key={divineViewSession}
      onClose={(completed) => window.xiaoelongDesktop?.closeDivineSelection?.(completed)}
    />
  );
}
