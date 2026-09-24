import { Search } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/client/components/ui/input-group";

export function PropertySearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <InputGroup className="rounded-none border-0 border-b shadow-none focus-within:ring-0">
      <InputGroupAddon className="border-r-0 bg-transparent pr-0">
        <Search className="size-4 shrink-0 text-muted-foreground/70" />
      </InputGroupAddon>
      <InputGroupInput
        autoFocus
        type="search"
        aria-label="Search properties or accounts"
        placeholder="Search properties or accounts…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </InputGroup>
  );
}
