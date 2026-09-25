import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { motion } from "motion/react";

import { cn } from "@/client/lib/utils";
import { springInteraction } from "@/client/lib/motion";

const TabsContext = React.createContext<{ uid: string }>({ uid: "" });

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  const uid = React.useId();
  return (
    <TabsContext.Provider value={{ uid }}>
      <TabsPrimitive.Root className={cn("", className)} {...props} />
    </TabsContext.Provider>
  );
}
Tabs.displayName = "Tabs";

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn(
        // No fixed height: the list wraps its triggers, so the active pill sits
        // with the same 0.25rem inset on all four sides. Narrow screens wrap the
        // triggers onto a second row, so every tab stays visible; a 1.25rem
        // radius is a pill on one row and a rounded box on two.
        "inline-flex max-w-full flex-wrap items-stretch justify-start gap-1 rounded-[1.25rem] p-1",
        "backdrop-blur-xl bg-foreground/[0.04]",
        "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
TabsList.displayName = "TabsList";

function TabsTrigger({
  className,
  children,
  ...props
}: TabsPrimitive.Tab.Props) {
  const { uid } = React.useContext(TabsContext);

  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-medium",
        "ring-offset-background transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
        "data-active:text-foreground",
        className,
      )}
      {...props}
      render={(tabProps, state) => (
        <button {...tabProps}>
          {state.active && (
            <motion.div
              layoutId={`tabs-indicator-${uid}`}
              className="absolute inset-0 rounded-full bg-foreground/[0.1] shadow-[inset_0_0_0.5rem_color-mix(in_oklch,var(--halo)_12%,transparent)]"
              transition={springInteraction}
            />
          )}
          <span className="relative z-10">{children}</span>
        </button>
      )}
    />
  );
}
TabsTrigger.displayName = "TabsTrigger";

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        className,
      )}
      {...props}
    />
  );
}
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
