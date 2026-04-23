type Props = {
  modelCount: number;
};

export function PromptExplorerLoadingState({ modelCount }: Props) {
  const count = Math.max(1, modelCount);
  return (
    <div className="space-y-5" aria-busy>
      {Array.from({ length: count }).map((_, index) => (
        <article
          key={index}
          className="overflow-hidden rounded-r-lg border border-base-300 border-l-4 border-l-base-300 bg-base-100"
        >
          <header className="flex items-center justify-between border-b border-base-200 bg-base-200/40 px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="skeleton size-2 rounded-full" />
              <div className="skeleton h-4 w-20" />
              <div className="skeleton h-3 w-32" />
            </div>
            <div className="skeleton h-3 w-16" />
          </header>
          <div className="space-y-2 px-5 py-5">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-11/12" />
            <div className="skeleton h-3 w-10/12" />
            <div className="skeleton h-3 w-9/12" />
          </div>
        </article>
      ))}
    </div>
  );
}
