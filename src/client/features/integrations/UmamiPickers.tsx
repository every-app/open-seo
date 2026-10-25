import { Trash2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Skeleton } from "@/client/components/ui/skeleton";

export type Website = { id: string; name: string; domain?: string | null };

export function loginLabel(instance: {
  baseUrl: string;
  username: string | null;
}): string {
  const host = instance.baseUrl.replace(/^https?:\/\//, "");
  return instance.username ? `${instance.username} @ ${host}` : host;
}

function websiteLabel(website: Website): string {
  return website.domain ? `${website.name} (${website.domain})` : website.name;
}

export function UmamiWebsiteSelect({
  websites,
  value,
  onChange,
}: {
  websites: Website[] | null;
  value: string | null;
  onChange: (websiteId: string | null) => void;
}) {
  if (websites === null) return <Skeleton className="h-9 w-full" />;
  if (websites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This Umami login can&rsquo;t see any websites.
      </p>
    );
  }
  return (
    <Select
      items={websites.map((website) => ({
        value: website.id,
        label: websiteLabel(website),
      }))}
      value={value}
      onValueChange={onChange}
    >
      <SelectTrigger aria-label="Umami website" className="w-full">
        <SelectValue placeholder="Choose a website" />
      </SelectTrigger>
      <SelectContent>
        {websites.map((website) => (
          <SelectItem key={website.id} value={website.id}>
            {websiteLabel(website)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type LoginRow = { id: string; baseUrl: string; username: string | null };

export function SavedUmamiLogins({
  instances,
  onChoose,
  onRemove,
}: {
  instances: LoginRow[];
  onChoose: (instanceId: string) => void;
  onRemove: (instance: LoginRow) => void;
}) {
  return (
    <ul className="divide-y rounded-md border">
      {instances.map((instance) => (
        <li
          key={instance.id}
          className="flex items-center justify-between gap-2 px-3 py-2"
        >
          <span className="min-w-0 break-all font-mono text-sm">
            {loginLabel(instance)}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onChoose(instance.id)}
            >
              Choose website
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove Umami login ${loginLabel(instance)}`}
              onClick={() => onRemove(instance)}
            >
              <Trash2 className="size-4" />
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
