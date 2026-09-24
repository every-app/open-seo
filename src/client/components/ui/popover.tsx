import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/client/lib/utils";

type AnchorContextValue = {
  anchor: HTMLElement | null;
  setAnchor: (node: HTMLElement | null) => void;
};
const PopoverAnchorContext = React.createContext<AnchorContextValue | null>(
  null,
);

// Root plus an optional anchor: PopoverAnchor lets the popup align to a wider
// element than its trigger (a field group, a split button).
function Popover(props: PopoverPrimitive.Root.Props) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const value = React.useMemo(() => ({ anchor, setAnchor }), [anchor]);
  return (
    <PopoverAnchorContext.Provider value={value}>
      <PopoverPrimitive.Root {...props} />
    </PopoverAnchorContext.Provider>
  );
}

const PopoverAnchor = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const setAnchor = React.useContext(PopoverAnchorContext)?.setAnchor;
  const handleRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setAnchor?.(node);
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref, setAnchor],
  );
  return <div ref={handleRef} {...props} />;
});
PopoverAnchor.displayName = "PopoverAnchor";
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  PopoverPrimitive.Popup.Props &
    Pick<
      PopoverPrimitive.Positioner.Props,
      "align" | "alignOffset" | "side" | "sideOffset"
    >
>(
  (
    {
      className,
      align = "center",
      alignOffset,
      side,
      sideOffset = 4,
      ...props
    },
    ref,
  ) => {
    const anchor = React.useContext(PopoverAnchorContext)?.anchor ?? undefined;
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={anchor}
          align={align}
          alignOffset={alignOffset}
          side={side}
          sideOffset={sideOffset}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            ref={ref}
            className={cn(
              "z-50 w-72 p-4",
              "rounded-xl border border-white/10",
              "backdrop-blur-3xl backdrop-saturate-200 bg-zinc-900/80 supports-[backdrop-filter]:bg-zinc-900/45",
              "text-popover-foreground",
              "shadow-[0_8px_32px_oklch(0_0_0/0.5),inset_0_0_8px_oklch(1_0_0/0.06)]",
              "outline-none transition-[transform,translate,scale,opacity] duration-150 data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 data-[side=bottom]:data-starting-style:-translate-y-2 data-[side=left]:data-starting-style:translate-x-2 data-[side=right]:data-starting-style:-translate-x-2 data-[side=top]:data-starting-style:translate-y-2",
              className,
            )}
            {...props}
          />
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    );
  },
);
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
