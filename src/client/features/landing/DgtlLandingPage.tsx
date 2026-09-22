import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Flame,
  Search,
  ShieldCheck,
} from "lucide-react";

const features = [
  {
    icon: Search,
    title: "Search intelligence",
    text: "Research keywords, competitors, backlinks, rankings, and technical issues in one client workspace.",
  },
  {
    icon: Flame,
    title: "Clarity behavior insights",
    text: "Bring heatmap and session behavior summaries beside the SEO pages they explain.",
  },
  {
    icon: BarChart3,
    title: "GA4 performance",
    text: "Connect acquisition and engagement metrics to SEO work and saved client reports.",
  },
];

export function DgtlLandingPage() {
  return (
    <div className="h-[100dvh] overflow-y-auto bg-[#070909] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_70%_12%,rgba(52,211,153,0.12),transparent_32%),radial-gradient(circle_at_15%_45%,rgba(59,130,246,0.10),transparent_30%)]" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-400 text-sm font-black text-black">D</span>
          <span>DGTL SEO Tools</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/sign-in" className="btn btn-ghost btn-sm text-white">Sign in</Link>
          <Link to="/sign-up" className="btn btn-sm border-0 bg-white text-black hover:bg-white/90">Create account</Link>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:py-28">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-sm text-emerald-200">
              <Activity className="size-4" /> Built for DGTL client growth
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              SEO, analytics, and behavior in one clear workspace.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/60">
              Give each client an isolated dashboard for website performance, problem reports, GA4 analytics, and Microsoft Clarity insights—managed centrally by DGTL.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/sign-up" className="btn border-0 bg-emerald-400 text-black hover:bg-emerald-300">
                Start with DGTL <ArrowRight className="size-4" />
              </Link>
              <Link to="/sign-in" className="btn border-white/15 bg-white/5 text-white hover:bg-white/10">Client login</Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/50">
              {['Role-based access', 'Client data isolation', 'Email verification ready'].map((item) => (
                <span key={item} className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-emerald-400" />{item}</span>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 shadow-2xl shadow-emerald-950/30 backdrop-blur">
            <div className="rounded-2xl border border-white/10 bg-[#101313] p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div><p className="text-sm text-white/45">Client workspace</p><p className="font-medium">Acme Digital / Website overview</p></div>
                <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs text-emerald-300">Healthy</span>
              </div>
              <div className="grid grid-cols-3 gap-3 py-5">
                {[['Organic clicks','24.8K','+18%'],['SEO health','91','+6'],['Conversions','1,284','+12%']].map(([label,value,change]) => (
                  <div key={label} className="rounded-xl bg-white/[0.045] p-3"><p className="text-xs text-white/40">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-emerald-300">{change}</p></div>
                ))}
              </div>
              <div className="h-40 rounded-xl bg-[linear-gradient(180deg,rgba(52,211,153,.16),transparent),repeating-linear-gradient(0deg,transparent,transparent_31px,rgba(255,255,255,.05)_32px)] p-4">
                <svg viewBox="0 0 500 120" className="h-full w-full" aria-hidden="true"><path d="M0 100 C70 92 75 72 140 77 S220 45 275 58 S350 25 410 35 S465 8 500 16" fill="none" stroke="#34d399" strokeWidth="4" strokeLinecap="round"/></svg>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/10 bg-white/[0.025]">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <div className="grid gap-4 md:grid-cols-3">
              {features.map(({ icon: Icon, title, text }) => (
                <article key={title} className="rounded-2xl border border-white/10 bg-black/20 p-6">
                  <Icon className="size-5 text-emerald-300" /><h2 className="mt-5 text-lg font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-white/50">{text}</p>
                </article>
              ))}
            </div>
            <div className="mt-12 flex items-center gap-3 rounded-2xl border border-white/10 p-5 text-sm text-white/55">
              <ShieldCheck className="size-5 shrink-0 text-emerald-300" /> DGTL super administrators manage client workspaces; client users can access only their organization and websites.
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
