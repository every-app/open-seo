// Frontmatter dates parse as UTC midnight; format in UTC so readers west of
// UTC don't see the previous day and SSR matches hydration.
export function PostDate({
  date,
  className,
}: {
  date: string;
  className?: string;
}) {
  return (
    <time dateTime={date} className={className}>
      {new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })}
    </time>
  );
}
