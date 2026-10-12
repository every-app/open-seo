import type { ComponentProps, FormEvent, ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/client/components/ui/input-group";

/**
 * The search form at the top of a research page: the fields in one row, the
 * submit button at the end, the validation error below.
 */
export function SearchCard({
  onSubmit,
  pending = false,
  error,
  errorId,
  children,
  secondRow,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Shows a spinner in the submit button while the search runs. */
  pending?: boolean;
  error?: string | null;
  /** Point the invalid field's `aria-describedby` at this id. */
  errorId?: string;
  /** The fields, laid out in one row on wide screens. */
  children: ReactNode;
  /** More fields below the row, still inside the form so Enter submits. */
  secondRow?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <form noValidate className="space-y-3" onSubmit={onSubmit}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {children}
            <Button type="submit" className="px-6" pending={pending}>
              Search
            </Button>
          </div>
          {secondRow}
        </form>
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The text input with a search icon that leads a SearchCard row. */
export function SearchInput({
  className,
  ...props
}: ComponentProps<typeof InputGroupInput>) {
  return (
    <InputGroup className={cn("lg:min-w-0 lg:flex-1", className)}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput {...props} />
    </InputGroup>
  );
}
