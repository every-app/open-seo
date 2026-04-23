export function AiSearchLoadingState() {
  return (
    <div className="space-y-8" aria-busy>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-base-300 bg-base-300 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-2 bg-base-100 p-5">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-8 w-32" />
            <div className="skeleton h-3 w-40" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="skeleton h-4 w-32" />
        <div className="space-y-2 rounded-lg border border-base-300 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid grid-cols-6 gap-3">
              <div className="skeleton col-span-3 h-4" />
              <div className="skeleton h-4" />
              <div className="skeleton h-4" />
              <div className="skeleton h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
