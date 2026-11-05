import type { ReactNode } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";

/**
 * Card with a header row above its body: dashboard and connection cards.
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
      <CardHeader>
        <CardTitle className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {icon ? <span className="shrink-0">{icon}</span> : null}
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
