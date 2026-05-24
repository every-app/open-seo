import { Link } from "@tanstack/react-router";

type ContentIndexItem = {
  title: string;
  description?: string;
  slugs: string[];
  url: string;
};

type ContentIndexProps = {
  eyebrow: string;
  title: string;
  description: string;
  emptyLabel: string;
  items: ContentIndexItem[];
  route: "/docs/$";
};

export function ContentIndex({
  eyebrow,
  title,
  description,
  emptyLabel,
  items,
  route,
}: ContentIndexProps) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 md:py-24">
      <p className="text-sm font-medium text-fd-muted-foreground">{eyebrow}</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight text-fd-foreground md:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-fd-muted-foreground">
        {description}
      </p>

      {items.length === 0 ? (
        <p className="mt-10 text-fd-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="mt-10 divide-y divide-fd-border border-y border-fd-border">
          {items.map((item) => (
            <Link
              key={item.url}
              to={route}
              params={{ _splat: item.slugs.join("/") }}
              className="group block py-6"
            >
              <h2 className="text-xl font-semibold text-fd-foreground transition-colors group-hover:text-fd-primary">
                {item.title}
              </h2>
              {item.description ? (
                <p className="mt-2 text-sm leading-6 text-fd-muted-foreground">
                  {item.description}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
