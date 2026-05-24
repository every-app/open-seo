type RunSkillCalloutProps = {
  command: string;
};

export function RunSkillCallout({ command }: RunSkillCalloutProps) {
  const slashCommand = command.startsWith("/") ? command : `/${command}`;

  return (
    <div className="my-6 overflow-hidden rounded-lg border border-fd-border bg-fd-card">
      <div className="flex items-center gap-1.5 border-b border-fd-border px-4 py-2">
        <span className="size-2 rounded-full bg-fd-muted-foreground/30" />
        <span className="size-2 rounded-full bg-fd-muted-foreground/30" />
        <span className="size-2 rounded-full bg-fd-muted-foreground/30" />
        <span className="ml-2 text-xs font-medium text-fd-muted-foreground">
          Run this skill in your agent
        </span>
      </div>
      <div className="flex items-center gap-3 p-4">
        <span className="font-mono text-sm text-fd-muted-foreground">&gt;</span>
        <code className="font-mono text-base font-semibold text-fd-foreground">
          {slashCommand}
        </code>
      </div>
    </div>
  );
}
