export function TableLoadingRows() {
  return (
    <div className="space-y-3 py-4" aria-busy>
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="grid grid-cols-6 gap-3">
          <div className="skeleton h-4 col-span-2" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
          <div className="skeleton h-4" />
        </div>
      ))}
    </div>
  );
}
