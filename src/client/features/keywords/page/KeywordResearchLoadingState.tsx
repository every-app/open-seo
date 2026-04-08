export function KeywordResearchLoadingState() {
  return (
    <div className="flex-1 w-full pt-1">
      <div className="hidden md:flex h-full gap-4 mt-2">
        <div className="flex-1 flex flex-col min-w-0 gap-2">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4">
            <div className="skeleton h-5 w-56" />
          </div>
          <div className="flex-1 rounded-xl border border-base-300 bg-base-100 overflow-hidden">
            <div className="border-b border-base-300 px-4 py-3 flex items-center gap-3">
              <div className="skeleton h-8 w-24" />
              <div className="skeleton h-4 w-40" />
            </div>
            <div className="p-4 space-y-3">
              {Array.from({ length: 10 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[24px_minmax(0,1fr)_64px_56px_48px_40px] items-center gap-3"
                >
                  <div className="skeleton h-3 w-3" />
                  <div className="skeleton h-4 w-10/12" />
                  <div className="skeleton h-3 w-12 justify-self-end" />
                  <div className="skeleton h-3 w-10 justify-self-end" />
                  <div className="skeleton h-3 w-10 justify-self-end" />
                  <div className="skeleton h-6 w-6 rounded-full justify-self-end" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0 gap-2">
          <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
            <div className="skeleton h-4 w-36" />
            <div className="skeleton h-56 w-full" />
          </div>
          <div className="flex-1 rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
            <div className="skeleton h-4 w-44" />
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid grid-cols-[24px_1fr_72px] gap-2">
                <div className="skeleton h-3 w-4" />
                <div className="skeleton h-3 w-10/12" />
                <div className="skeleton h-3 w-12 justify-self-end" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="md:hidden mt-2 space-y-3">
        <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-8 w-2/3" />
        </div>
        <div className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-base-300 p-3"
            >
              <div className="skeleton h-4 w-9/12" />
              <div className="grid grid-cols-3 gap-2">
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
