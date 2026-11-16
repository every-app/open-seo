import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Textarea } from "@/client/components/ui/textarea";
import {
  PS_AI_DISCLOSURES,
  type PsAiDisclosure,
  type PsChannelType,
} from "@/shared/platform-seo";

const AI_ITEMS: { value: PsAiDisclosure; label: string }[] = [
  { value: "no_ai", label: "No AI" },
  { value: "some_ai", label: "Some AI help" },
  { value: "fully_autonomous", label: "Written by AI" },
];

const TAG_HINTS = {
  devto: "Up to 4; letters and digits only.",
  hashnode: "Up to 5.",
} as const;

type Fields = {
  title: string;
  summary: string;
  tags: string;
  body: string;
  ai: PsAiDisclosure | null;
};

// The editable platform copy: title, summary, tags, AI disclosure (Dev.to)
// and the article.
export function SyndicationFields({
  disabled,
  id,
  type,
  canonicalUrl,
  value,
  onChange,
}: {
  disabled: boolean;
  id: string;
  type: PsChannelType;
  canonicalUrl: string | null;
  value: Fields;
  onChange: (next: Fields) => void;
}) {
  const isDevto = type === "devto";
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-2 md:col-span-2">
        <Label htmlFor={`${id}-title`}>Title</Label>
        <Input
          id={`${id}-title`}
          value={value.title}
          maxLength={250}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, title: event.target.value })
          }
        />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Label htmlFor={`${id}-summary`}>
          {isDevto ? "Description" : "Subtitle"}
        </Label>
        <Input
          id={`${id}-summary`}
          value={value.summary}
          maxLength={300}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, summary: event.target.value })
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-tags`}>Tags</Label>
        <Input
          id={`${id}-tags`}
          value={value.tags}
          onChange={(event) => onChange({ ...value, tags: event.target.value })}
          placeholder="seo, marketing"
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">
          Comma separated. {TAG_HINTS[type]}
        </p>
      </div>
      {isDevto ? (
        <div className="flex flex-col gap-2">
          <Label>AI disclosure</Label>
          <Select
            items={AI_ITEMS}
            disabled={disabled}
            value={value.ai}
            onValueChange={(next) =>
              onChange({
                ...value,
                ai: PS_AI_DISCLOSURES.find((v) => v === next) ?? null,
              })
            }
          >
            <SelectTrigger aria-label="AI disclosure">
              <SelectValue placeholder="Not stated" />
            </SelectTrigger>
            <SelectContent>
              {AI_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Dev.to shows this on the post.
          </p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 md:col-span-2">
        <Label htmlFor={`${id}-body`}>Article (Markdown)</Label>
        <Textarea
          id={`${id}-body`}
          value={value.body}
          rows={12}
          readOnly={disabled}
          className="font-mono text-sm"
          onChange={(event) => onChange({ ...value, body: event.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {canonicalUrl
            ? `Sent with ${canonicalUrl} as its canonical URL and a closing "Originally published at" link.`
            : "No original URL is set above, so this copy has no canonical link."}
        </p>
      </div>
    </div>
  );
}
