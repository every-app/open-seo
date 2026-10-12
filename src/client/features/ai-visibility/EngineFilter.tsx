import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import type { AiEngine } from "@/shared/ai-visibility";
import { EngineLabel } from "./EngineLabel";

export function EngineFilter({
  engines,
  value,
  onChange,
  label,
}: {
  engines: AiEngine[];
  value: AiEngine[];
  onChange: (value: AiEngine[]) => void;
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        render={<Button variant="outline" className="h-10 gap-2 px-3" />}
      >
        {value.length === 1 ? (
          <EngineLabel engine={value[0]} />
        ) : value.length ? (
          `${value.length} engines`
        ) : (
          "No engines"
        )}
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-auto min-w-56">
        {engines.map((engine) => {
          const checked = value.includes(engine);
          return (
            <Menu.CheckboxItem
              key={engine}
              checked={checked}
              closeOnClick={false}
              onCheckedChange={(next) =>
                onChange(
                  next
                    ? [...value, engine]
                    : value.filter((selected) => selected !== engine),
                )
              }
              className="flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground"
            >
              <span
                className={`flex size-4 shrink-0 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
              >
                <Menu.CheckboxItemIndicator className="flex items-center justify-center">
                  <Check className="size-3" />
                </Menu.CheckboxItemIndicator>
              </span>
              <EngineLabel engine={engine} />
            </Menu.CheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
