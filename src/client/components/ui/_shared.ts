export const formFieldBase =
  "w-full px-4 text-sm " +
  "bg-input text-foreground " +
  "border border-border " +
  "placeholder:text-muted-foreground " +
  "transition-[color,box-shadow,border-color] duration-150 " +
  "[box-shadow:var(--shadow-inset)] " +
  "hover:border-ring/35 " +
  "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const formFieldSingleLine = "flex h-9 py-1.5 rounded-full";
export const formFieldMultiLine = "flex min-h-[80px] py-2 resize-y rounded-xl";
