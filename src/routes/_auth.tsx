import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="min-h-[100dvh] bg-base-200">
      <div className="min-h-[100dvh] flex items-center justify-center p-4">
        <Outlet />
      </div>
    </div>
  );
}
