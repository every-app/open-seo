import { Search } from "lucide-react";
import { InputGroup } from "@/client/components/ui/input-group";

import { Input } from "@/client/components/ui/input";
export function PropertySearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <InputGroup
      className="rounded-none border-0 border-b shadow-none focus-within:ring-0"
      prefix={<Search className="size-4 shrink-0 text-muted-foreground/70" />}
    >
      <Input
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
