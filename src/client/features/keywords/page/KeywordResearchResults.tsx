import { KeywordResearchDesktopResults } from "./KeywordResearchDesktopResults";
import { KeywordResearchMobileResults } from "./KeywordResearchMobileResults";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
};

export function KeywordResearchResults({ controller }: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden w-full pt-1">
      <KeywordResearchDesktopResults controller={controller} />
      <KeywordResearchMobileResults controller={controller} />
    </div>
  );
}
