import type { ReactNode } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";

/**
 * Card with a header row and a divided body: dashboard and connection cards.
 * It fills its grid cell, and the body grows so content marked `mt-auto`
 * (such as action rows) sits at the bottom of equal-height cards.
 */
export function CardShell({
  title,
  icon,
  titleInfo,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  titleInfo?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card size="lg" className="h-full">
      <CardHeader className="border-b">
        <CardTitle className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card shadow-sm">
              {icon}
            </span>
          ) : null}
          <h2 className="leading-tight">{title}</h2>
          {titleInfo}
        </CardTitle>
        {action ? (
          <CardAction className="self-center">{action}</CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">{children}</CardContent>
    </Card>
  );
}
