import { Link } from "@tanstack/react-router";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";

export function NotFound() {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>404</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          The page you are looking for does not exist.
        </CardContent>
        <CardFooter>
          <Button nativeButton={false} render={<Link to="/" />}>
            Home
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
