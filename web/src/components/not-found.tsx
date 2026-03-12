import { Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";

export function NotFound() {
  return (
    <HomeLayout {...baseOptions()} className="text-center py-32 justify-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-6xl font-bold text-fd-muted-foreground">404</h1>
        <h2 className="text-2xl font-semibold">Page Not Found</h2>
        <p className="text-fd-muted-foreground max-w-md">
          The page you are looking for might have been removed, had its name
          changed, or is temporarily unavailable.
        </p>
        <Link
          to="/"
          className="mt-4 px-4 py-2 rounded-lg bg-fd-primary text-fd-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
        >
          Back to Home
        </Link>
      </div>
    </HomeLayout>
  );
}
