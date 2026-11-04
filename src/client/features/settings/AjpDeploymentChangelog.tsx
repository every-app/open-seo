import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/client/components/PageHeader";
import {
  AJP_DEPLOYMENT_CHANGELOG,
  AJP_DEPLOYMENT_CHANGELOG_INTRO,
  type DeploymentChangelogEntry,
} from "@/shared/ajp-deployment-changelog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";

function ChangelogSectionList({
  sections,
}: {
  sections: { title: string; items: string[] }[];
}) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <h4 className="text-sm font-medium">{section.title}</h4>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function DeploymentEntry({ entry }: { entry: DeploymentChangelogEntry }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-lg">
          <span>v{entry.version}</span>
          <span className="text-sm font-normal text-muted-foreground">
            Deployed {entry.deployedOn}
          </span>
        </CardTitle>
        {entry.pullRequest ? (
          <p className="text-sm text-muted-foreground">
            Fork{" "}
            <a
              href={entry.pullRequest.url}
              className="font-medium text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              PR #{entry.pullRequest.number}
            </a>
            {entry.mergeCommit ? (
              <>
                {" "}
                · merge{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {entry.mergeCommit.slice(0, 8)}
                </code>
              </>
            ) : null}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">From upstream</h3>
          <p className="text-sm text-muted-foreground">
            {entry.upstream.label}
          </p>
          {entry.upstream.compareUrl ? (
            <a
              href={entry.upstream.compareUrl}
              className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Official compare on GitHub →
            </a>
          ) : null}
          <ChangelogSectionList sections={entry.upstream.sections} />
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">AJP fork changes</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {entry.forkChanges.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {entry.operations?.length ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Production operations</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {entry.operations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {entry.openFollowUps?.length ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Open follow-ups</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {entry.openFollowUps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function AjpDeploymentChangelog() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Changelog"
        description="What we merged from official OpenSEO releases and what we changed on the AJP fork."
      />
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>{AJP_DEPLOYMENT_CHANGELOG_INTRO.versionLabel}</p>
        <p>
          Official OpenSEO releases:{" "}
          <a
            href={AJP_DEPLOYMENT_CHANGELOG_INTRO.upstreamRepo}
            className="font-medium text-primary underline-offset-4 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            every-app/open-seo
          </a>
          . Our fork:{" "}
          <a
            href={AJP_DEPLOYMENT_CHANGELOG_INTRO.forkRepo}
            className="font-medium text-primary underline-offset-4 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            alljigsawpuzzles/open-seo
          </a>
          .
        </p>
        <p>
          <Link
            to="/settings"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            ← Back to personal settings
          </Link>
        </p>
      </div>

      {AJP_DEPLOYMENT_CHANGELOG.map((entry) => (
        <DeploymentEntry
          key={`${entry.version}-${entry.deployedOn}`}
          entry={entry}
        />
      ))}
    </div>
  );
}
