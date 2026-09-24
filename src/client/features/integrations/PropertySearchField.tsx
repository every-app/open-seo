import { Search } from "@/client/components/icons";
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
    <div className="border-b border-border p-2">
      <InputGroup prefix={<Search className="size-4 shrink-0" />}>
        <Input
          autoFocus
          type="search"
          aria-label="Search properties or accounts"
          placeholder="Search properties or accounts…"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </InputGroup>
    </div>
  );
}
