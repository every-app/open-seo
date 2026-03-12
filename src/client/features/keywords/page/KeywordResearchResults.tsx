import { KeywordResearchDesktopResults } from "./KeywordResearchDesktopResults";
import { KeywordResearchMobileResults } from "./KeywordResearchMobileResults";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
};

export function KeywordResearchResults({ controller }: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden w-full px-4 md:px-6 pb-4 max-w-8xl mx-auto">
      <KeywordResearchDesktopResults controller={controller} />
      <KeywordResearchMobileResults controller={controller} />
    </div>
  );
}
