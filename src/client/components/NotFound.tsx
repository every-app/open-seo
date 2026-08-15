export function NotFound({ children }: { children?: React.ReactNode }) {
  return (
    <div className="space-y-2 p-4">
      <h1 className="text-2xl">404</h1>
      <div className="text-base-content/70">
        {children || <p>你访问的页面不存在。</p>}
      </div>
    </div>
  );
}
