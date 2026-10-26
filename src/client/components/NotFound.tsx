import { Link } from "@tanstack/react-router";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";

export function NotFound() {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Page not found</CardTitle>
        </CardHeader>
        <CardFooter>
          <Button nativeButton={false} render={<Link to="/" />}>
            Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
