import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { takeStashedGhlLink } from "@/api/ghl";
import { ApiError } from "@/api/client";
import { auth } from "@/api/auth";

function authMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    // Wrong credentials come back as a generic "No active account…" message; show something friendlier.
    return error.status === 401 ? fallback : error.message;
  }
  return fallback;
}

const searchSchema = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — iMax Profit Tracker" },
      {
        name: "description",
        content:
          "Sign in or create your iMax Profit Tracker account to connect banks and track cash flow.",
      },
      { property: "og:title", content: "Sign in — iMax Profit Tracker" },
      { property: "og:description", content: "Access your bank-connected accounting dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [tab, setTab] = useState(search.mode === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  /** After signing in: finish a GoHighLevel connection that was interrupted by a sign-in, otherwise the dashboard. */
  function goAfterAuth() {
    const code = takeStashedGhlLink();
    if (code) navigate({ to: "/ledgers", search: { ghl_link: code }, replace: true });
    else navigate({ to: "/dashboard", replace: true });
  }

  useEffect(() => {
    if (auth.hasSession()) goAfterAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await auth.signIn(email, password);
    } catch (error) {
      setLoading(false);
      toast.error(authMessage(error, "Invalid email or password."));
      return;
    }
    setLoading(false);
    goAfterAuth();
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await auth.signUp(email, password, fullName);
    } catch (error) {
      setLoading(false);
      toast.error(authMessage(error, "Could not create your account."));
      return;
    }
    setLoading(false);
    toast.success("Account created.");
    goAfterAuth();
  }

  async function resetPassword() {
    if (!email) {
      toast.error("Enter your email first.");
      return;
    }
    try {
      await auth.requestPasswordReset(email);
    } catch (error) {
      toast.error(authMessage(error, "Could not send the reset link."));
      return;
    }
    toast.success("If that email exists, a reset link has been sent.");
  }

  return (
    <div className="hero-gradient flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 flex items-center justify-center gap-2 font-display text-xl font-bold"
        >
          <img src="/logo.png" alt="" className="size-12 object-contain" />
          iMax Profit Tracker
        </Link>

        <div className="surface p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form className="space-y-4 pt-4" onSubmit={signIn}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
                <button
                  type="button"
                  onClick={resetPassword}
                  className="w-full text-xs text-muted-foreground underline"
                >
                  Forgot your password?
                </button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form className="space-y-4 pt-4" onSubmit={signUp}>
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">Email</Label>
                  <Input
                    id="email2"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Password</Label>
                  <Input
                    id="password2"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creating account…" : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
