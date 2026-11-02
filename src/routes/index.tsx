import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { auth } from "@/api/auth";
import { isTenantEmail, openGhlWorkspace, stashGhlLink } from "@/api/ghl";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Lock,
  PieChart,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ImaxAccounting — Bank-connected income, expense & cash-flow analytics" },
      {
        name: "description",
        content:
          "Connect your bank accounts, sync every transaction automatically, categorize income and expenses, and get clear cash-flow reports.",
      },
      {
        property: "og:title",
        content: "ImaxAccounting — Automated bank accounting & cash-flow reports",
      },
      {
        property: "og:description",
        content:
          "Securely connect banks, auto-categorize transactions and generate income, expense and cash-flow reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Building2,
    title: "Connect any bank",
    body: "Link multiple institutions — checking, savings, credit cards and loans — through a secure, bank-grade connection.",
  },
  {
    icon: RefreshCw,
    title: "Always-current transactions",
    body: "Incremental sync keeps additions, edits and removals accurate, including up to 24 months of history.",
  },
  {
    icon: Sparkles,
    title: "Automatic categorization",
    body: "A layered rules engine classifies income, expenses and transfers — and learns from your corrections.",
  },
  {
    icon: BarChart3,
    title: "Cash-flow analytics",
    body: "Income vs expenses, net cash flow and spending trends across any date range or account.",
  },
  {
    icon: PieChart,
    title: "Reports & exports",
    body: "Monthly, income, expense and cash-flow reports with CSV export and a print-ready view.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by design",
    body: "Credentials stay encrypted server-side. Row-level security keeps every record scoped to you.",
  },
];

function Landing() {
  const navigate = useNavigate();
  // Signed-in visitors (e.g. re-opening the embedded app) go straight to the dashboard.
  const [ghlState, setGhlState] = useState<"idle" | "loading" | "error">("idle");
  const [ghlError, setGhlError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Agency menu link (https://app/?company=...): the client list lives at /agency.
    if (params.has("company") && !params.has("id")) {
      window.location.replace(`/agency${window.location.search}`);
      return;
    }
    const id = params.get("id");
    const link = params.get("link");

    // Original behaviour: open the embedded workspace of a GoHighLevel subaccount, or go to the dashboard if signed in.
    const proceed = () => {
      if (id) {
        sessionStorage.setItem("ghl-embed", "1");
        setGhlState("loading");
        (async () => {
          let body;
          try {
            body = await openGhlWorkspace(id, params.get("sig"));
          } catch (e) {
            setGhlError(e instanceof Error ? e.message : "This link is not valid.");
            setGhlState("error");
            return;
          }
          // A different tenant may already be signed in on this browser: replace that session.
          if (auth.hasSession() && auth.currentUserId() !== body.user_id) await auth.signOut();
          auth.setSession({ access: body.access, refresh: body.refresh });
          navigate({ to: "/dashboard", replace: true });
        })().catch(() => {
          setGhlError("Could not open this subaccount. Please try again.");
          setGhlState("error");
        });
        return;
      }
      sessionStorage.removeItem("ghl-embed");
      if (auth.hasSession()) navigate({ to: "/dashboard", replace: true });
    };

    // Coming back from "Connect GoHighLevel": a signed-in personal workspace is offered the location, never silently skipped.
    if (link && auth.hasSession()) {
      setGhlState("loading");
      auth
        .getUser()
        .then((user) => {
          if (user && !isTenantEmail(user.email)) {
            navigate({ to: "/ledgers", search: { ghl_link: link }, replace: true });
          } else {
            setGhlState("idle");
            proceed();
          }
        })
        .catch(() => {
          setGhlState("idle");
          proceed();
        });
      return;
    }
    // Signed out after an agency-level install: keep the code and finish linking right after sign-in.
    if (link && !id) {
      stashGhlLink(link);
      navigate({ to: "/auth", replace: true });
      return;
    }
    proceed();
  }, [navigate]);
  if (ghlState !== "idle") {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <p
          className={ghlState === "error" ? "text-sm font-medium" : "text-sm text-muted-foreground"}
        >
          {ghlState === "error" ? ghlError : "Opening your accounting workspace…"}
        </p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            i
          </span>
          ImaxAccounting
        </div>
        <Button asChild variant="ghost">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main>
        <section className="hero-gradient">
          <div className="mx-auto max-w-6xl px-6 py-24 text-center">
            <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Lock className="size-3.5" /> Bank-grade connections, encrypted server-side
            </p>
            <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-[1.05] md:text-6xl">
              Every transaction, categorized. Every dollar, accounted for.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              ImaxAccounting connects your bank accounts, imports and continuously syncs
              transactions, and turns them into income, expense and cash-flow reports you can
              actually act on.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/auth">
                  Get started free <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth" search={{ mode: "signin" }}>
                  I already have an account
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="surface p-6">
                <f.icon className="size-6 text-primary" />
                <h2 className="mt-4 text-lg font-semibold">{f.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        ImaxAccounting — automated bank accounting and cash-flow analytics.
      </footer>
    </div>
  );
}
