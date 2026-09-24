import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/client/lib/utils";

// Base UI has no Anchor part; PopoverAnchor registers its element via context
// and PopoverContent feeds it to the Positioner's `anchor` prop.
type PopoverAnchorContextValue = {
  anchor: HTMLElement | null;
  setAnchor: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
};

const PopoverAnchorContext =
  React.createContext<PopoverAnchorContextValue | null>(null);

function Popover(props: PopoverPrimitive.Root.Props) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const value = React.useMemo(() => ({ anchor, setAnchor }), [anchor]);
  return (
    <PopoverAnchorContext.Provider value={value}>
      <PopoverPrimitive.Root {...props} />
    </PopoverAnchorContext.Provider>
  );
}

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverAnchor = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>((props, ref) => {
  const context = React.useContext(PopoverAnchorContext);
  const setAnchor = context?.setAnchor;
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
      sideOffset = 6,
      ...props
    },
    ref,
  ) => {
    const context = React.useContext(PopoverAnchorContext);
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={context?.anchor ?? undefined}
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
              "rounded-lg border border-border",
              "bg-popover text-popover-foreground",
              "[box-shadow:var(--shadow-l)]",
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
