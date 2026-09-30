import { Monitor, Moon, Sun } from "@/client/components/icons";
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/client/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import { type ThemePreference, useThemePreference } from "@/client/lib/theme";

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemePreferenceMenuItems() {
  const { themePreference, setThemePreference } = useThemePreference();

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="pt-2">Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        aria-label="Theme preference"
        className="mx-1 mb-1 flex gap-0.5 rounded-full bg-muted p-0.5"
        value={themePreference}
        onValueChange={(value) => {
          const option = THEME_OPTIONS.find((item) => item.value === value);
          if (option) setThemePreference(option.value);
        }}
      >
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <Tooltip key={option.value}>
              <TooltipTrigger render={<span className="flex flex-1" />}>
                {/* Icon-only segment: the radio dot (the item's only <span>
                    child) is hidden, the pressed segment is lifted instead. */}
                <DropdownMenuRadioItem
                  value={option.value}
                  closeOnClick={false}
                  aria-label={option.label}
                  className="flex-1 justify-center rounded-full px-2.5 py-1.5 text-muted-foreground hover:text-foreground data-checked:bg-card data-checked:text-foreground data-checked:shadow-sm [&>span]:hidden"
                >
                  <Icon className="size-4" />
                </DropdownMenuRadioItem>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="whitespace-nowrap">
                {option.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}
