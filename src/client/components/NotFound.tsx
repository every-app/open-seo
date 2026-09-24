export function NotFound({ children }: { children?: React.ReactNode }) {
  return (
    <div className="space-y-2 p-4">
      <h1 className="text-2xl">404</h1>
      <div className="text-muted-foreground">
        {children || <p>The page you are looking for does not exist.</p>}
      </div>
    </div>
  );
}
