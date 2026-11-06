import { createFileRoute, notFound } from "@tanstack/react-router";
import { START_HEADLINES, StartLandingPage } from "@/components/start-page";
import { buildPageSeo } from "@/lib/seo";
import { START_ANGLES } from "@/lib/start-angles";

export const Route = createFileRoute("/_campaign/start/$angle")({
  loader: ({ params }) => {
    const angle = START_ANGLES.find((key) => key === params.angle);
    if (!angle) throw notFound();
    return angle;
  },
  head: ({ loaderData: angle }) => {
    if (!angle) return {};
    const { lead, underlined } = START_HEADLINES[angle];
    return buildPageSeo({
      title: `${lead} ${underlined.replace(/\.$/, "")} - OpenSEO`,
      description:
        "Keyword research, rank tracking, site audits and Search Console data, with Claude or in the web app. Open source, from $10 a month.",
      path: `/start/${angle}`,
    });
  },
  component: StartPage,
});

function StartPage() {
  return <StartLandingPage angle={Route.useLoaderData()} />;
}
