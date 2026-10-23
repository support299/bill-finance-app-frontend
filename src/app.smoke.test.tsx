/**
 * UI smoke test: mounts the real router + pages in jsdom with the network mocked at fetch level.
 * Verifies the auth guard, sign-in flow and that a data page renders from the REST API.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as ghl from "@/api/ghl";
import { clearTokens, getTokens, setTokens } from "@/api/session";
import { routeTree } from "@/routeTree.gen";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const LOC = {
  location_id: "LOC1",
  name: "Acme Plumbing",
  company_id: "CO1",
  email: "hi@acme.co",
  active: true,
  has_token: true,
  invoices_synced_at: null,
};

const routes: Record<string, (req: Request) => Response> = {
  "GET /workspace/links/": () => json(200, { locations: [] }),
  "POST /auth/login/": () => json(200, { access: "ACCESS", refresh: "REFRESH" }),
  "GET /profile/": () => json(200, { id: "u1", email: "me@example.com", full_name: "Me" }),
  "GET /notifications/": () => json(200, []),
  "GET /dashboard/": () =>
    json(200, {
      accounts: [
        {
          id: "a1",
          plaid_item_id: "i1",
          plaid_account_id: "chk",
          account_name: "Checking",
          official_name: null,
          mask: "0000",
          account_type: "depository",
          account_subtype: "checking",
          current_balance: "1234.50",
          available_balance: null,
          iso_currency_code: "USD",
          last_balance_update: null,
          institution_id: null,
        },
      ],
      items: [
        {
          id: "i1",
          institution_name: "Test Bank",
          connection_status: "good",
          error_message: null,
          last_sync_at: null,
        },
      ],
      current_balance: 1234.5,
    }),
  "GET /reports/data/": () =>
    json(200, {
      totals: {
        total_income: 5000,
        total_expenses: 2000,
        net_cash_flow: 3000,
        average_monthly_income: 5000,
        average_monthly_expenses: 2000,
        transfer_volume: 0,
        transaction_count: 4,
        month_count: 1,
      },
      series: [{ period: "2026-02", income: 5000, expenses: 2000, net: 3000 }],
      expense_by_category: [{ name: "Utilities", color: null, value: 2000 }],
      income_by_category: [{ name: "Sales Revenue", color: null, value: 5000 }],
      top_expense_category: { name: "Utilities", color: null, value: 2000 },
      top_income_category: { name: "Sales Revenue", color: null, value: 5000 },
      top_merchants: [],
      largest_expense: null,
      largest_income: null,
      largest_transactions: [],
    }),
  "GET /ledgers/": () =>
    json(200, [
      {
        id: "l1",
        label: "Acme Co",
        account_class: "current_asset",
        contact_name: null,
        contact_email: null,
        contact_phone: null,
        notes: null,
        tags: [{ id: "t1", name: "vip" }],
        created_at: "",
        updated_at: "",
      },
    ]),
  "GET /ledgers/summaries/": () => json(200, { summaries: { l1: { count: 3, net: 99 } } }),
};

function mockNetwork() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(String(input));
      const key = `${init.method ?? "GET"} ${url.pathname.replace(/^\/api\/v1/, "")}`;
      calls.push(key);
      const handler = routes[key];
      return handler
        ? handler(new Request(url, init))
        : json(404, { error: { code: "not_found", message: `unmocked ${key}` } });
    }),
  );
  return calls;
}

function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  clearTokens();
  window.scrollTo = vi.fn() as never;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as never;
});
const defaultRoutes = { ...routes };
afterEach(() => {
  for (const k of Object.keys(routes)) delete routes[k];
  Object.assign(routes, defaultRoutes);
  sessionStorage.clear();
  window.history.pushState({}, "", "/");
  cleanup();
  vi.unstubAllGlobals();
});

describe("app smoke", () => {
  it("redirects an anonymous visitor from a protected route to the sign-in page", async () => {
    mockNetwork();
    const router = renderApp("/dashboard");
    await waitFor(() => expect(router.state.location.pathname).toBe("/auth"));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("signs in against the API and lands on the dashboard with data", async () => {
    const calls = mockNetwork();
    const router = renderApp("/auth");
    await userEvent.type(await screen.findByLabelText("Email"), "me@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Str0ng-pass!");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
    expect(getTokens()).toEqual({ access: "ACCESS", refresh: "REFRESH" });
    await waitFor(() => expect(calls).toContain("GET /dashboard/"));
    expect(calls).toContain("GET /reports/data/");
    expect(
      (await screen.findAllByText(/\$1,234\.50/, {}, { timeout: 5000 })).length,
    ).toBeGreaterThan(0); // balance from the API
  });

  it("renders the ledger list from the API for a signed-in user", async () => {
    mockNetwork();
    setTokens({ access: "ACCESS", refresh: "REFRESH" });
    renderApp("/ledgers");
    expect(await screen.findByText("Acme Co")).toBeInTheDocument();
    expect(screen.getAllByText("vip").length).toBeGreaterThan(0);
  });

  it("shows an error message when sign-in fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json(401, {
          error: {
            code: "no_active_account",
            message: "No active account found with the given credentials",
            details: null,
          },
        }),
      ),
    );
    const router = renderApp("/auth");
    await userEvent.type(await screen.findByLabelText("Email"), "x@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/auth");
    expect(getTokens()).toBeNull();
  });
});

describe("connect a GoHighLevel location from the workspace", () => {
  const signIn = () => setTokens({ access: "ACCESS", refresh: "REFRESH" });

  it("shows a Connect GoHighLevel button (not Sync) while nothing is linked, and starts the install", async () => {
    mockNetwork();
    signIn();
    const go = vi.spyOn(ghl.navigation, "go").mockImplementation(() => {});
    renderApp("/ledgers");
    const button = await screen.findByRole("button", { name: /Connect GoHighLevel/ });
    expect(screen.queryByRole("button", { name: /Sync invoices/ })).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(go).toHaveBeenCalledWith(expect.stringMatching(/\/api\/v1\/workspace\/install\/$/));
    go.mockRestore();
  });

  it("shows Sync invoices, Add location and the linked location once connected", async () => {
    mockNetwork();
    routes["GET /workspace/links/"] = () => json(200, { locations: [LOC] });
    signIn();
    renderApp("/ledgers");
    expect(await screen.findByRole("button", { name: /Sync invoices/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add location/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Connect GoHighLevel/ })).not.toBeInTheDocument();
    expect(await screen.findByText("Acme Plumbing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Disconnect Acme Plumbing/ })).toBeInTheDocument();
  });

  it("asks for confirmation after GoHighLevel redirects back, then links the location", async () => {
    const calls = mockNetwork();
    routes["GET /workspace/link/options/"] = () =>
      json(200, { choose: false, locations: [{ ...LOC, link_state: "free" }] });
    routes["POST /workspace/link/confirm/"] = () => json(200, { ...LOC, link_state: "here" });
    signIn();
    const router = renderApp("/ledgers?ghl_link=SIGNED.CODE");
    expect(await screen.findByText("Acme Plumbing", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Link a GoHighLevel location to this workspace/)).toBeInTheDocument();
    expect(calls).not.toContain("POST /workspace/link/confirm/"); // nothing is linked until the user confirms
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(calls).toContain("POST /workspace/link/confirm/"));
    const sent = vi
      .mocked(fetch)
      .mock.calls.find(([u]) => String(u).includes("/workspace/link/confirm/"))![1]!;
    expect(JSON.parse(String(sent.body))).toEqual({ code: "SIGNED.CODE" }); // the signed code from the URL, nothing else
    expect((sent.headers as Record<string, string>)["Authorization"]).toBe("Bearer ACCESS"); // sent as the signed-in user
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("ghl_link")); // dialog closed, code dropped from URL
  });

  it("lets the user pick one of the installed locations after an agency-level install", async () => {
    const calls = mockNetwork();
    routes["GET /workspace/link/options/"] = () =>
      json(200, {
        choose: true,
        locations: [
          { ...LOC, link_state: "free" },
          { ...LOC, location_id: "LOC2", name: "Taken Co", link_state: "elsewhere" },
        ],
      });
    routes["POST /workspace/link/confirm/"] = () => json(200, { ...LOC, link_state: "here" });
    signIn();
    renderApp("/ledgers?ghl_link=COMPANY.CODE");
    const connect = await screen.findByRole("button", { name: "Connect" }, { timeout: 5000 });
    expect(connect).toBeDisabled(); // must choose first
    await userEvent.click(await screen.findByRole("combobox", {}, { timeout: 5000 }));
    expect(await screen.findByRole("option", { name: "Acme Plumbing" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Taken Co/ })).not.toBeInTheDocument(); // locations of other workspaces are not offered
    await userEvent.click(screen.getByRole("option", { name: "Acme Plumbing" }));
    await userEvent.click(connect);
    await waitFor(() => expect(calls).toContain("POST /workspace/link/confirm/"));
  });

  it("explains an expired or invalid link instead of failing silently", async () => {
    mockNetwork();
    routes["GET /workspace/link/options/"] = () =>
      json(400, {
        error: {
          code: "invalid",
          message: "This link has expired. Start the connection again.",
          details: { code: ["This link has expired. Start the connection again."] },
        },
      });
    signIn();
    renderApp("/ledgers?ghl_link=OLD.CODE");
    expect(
      await screen.findByText(
        "This link has expired. Start the connection again.",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("landing page hands a signed-in personal workspace back to the dialog (no per-tab flag needed)", async () => {
    const calls = mockNetwork();
    routes["GET /workspace/link/options/"] = () =>
      json(200, { choose: false, locations: [{ ...LOC, link_state: "free" }] });
    signIn();
    window.history.pushState({}, "", "/?id=LOC1&link=SIGNED.CODE");
    const router = renderApp("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/ledgers"));
    expect(router.state.location.search).toMatchObject({ ghl_link: "SIGNED.CODE" });
    expect(calls).not.toContain("POST /workspace/session/"); // the signed-in user is NOT swapped for the location's tenant
    expect(getTokens()).toEqual({ access: "ACCESS", refresh: "REFRESH" });
  });

  it("an agency-level return (no location id) also reaches the dialog and is never dropped", async () => {
    mockNetwork();
    routes["GET /workspace/link/options/"] = () =>
      json(200, { choose: true, locations: [{ ...LOC, link_state: "free" }] });
    signIn();
    window.history.pushState({}, "", "/?link=COMPANY.CODE");
    const router = renderApp("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/ledgers"));
    expect(router.state.location.search).toMatchObject({ ghl_link: "COMPANY.CODE" });
  });

  it("a hidden embed tenant session is not offered the dialog", async () => {
    const calls = mockNetwork();
    routes["GET /profile/"] = () =>
      json(200, { id: "t1", email: "ghl-loc1@tenants.invalid", full_name: "" });
    routes["POST /workspace/session/"] = () =>
      json(200, { access: "TENANT", refresh: "TENANT-R", user_id: "t1" });
    signIn();
    window.history.pushState({}, "", "/?id=LOC1&link=SIGNED.CODE");
    const router = renderApp("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
    expect(calls).toContain("POST /workspace/session/");
  });

  it("signed out after an agency install: the code is kept, and linking resumes right after sign-in", async () => {
    const calls = mockNetwork();
    routes["GET /workspace/link/options/"] = () =>
      json(200, { choose: false, locations: [{ ...LOC, link_state: "free" }] });
    window.history.pushState({}, "", "/?link=COMPANY.CODE");
    const router = renderApp("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/auth"));
    expect(ghl.takeStashedGhlLink()).toBe("COMPANY.CODE");
    ghl.stashGhlLink("COMPANY.CODE"); // (read it back above; put it back for the real sign-in)
    await userEvent.type(await screen.findByLabelText("Email"), "me@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "Str0ng-pass!");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/ledgers"));
    expect(router.state.location.search).toMatchObject({ ghl_link: "COMPANY.CODE" });
    await waitFor(() => expect(calls).toContain("GET /workspace/link/options/"));
  });

  it("without a pending link the landing page still opens the embedded workspace (original behaviour)", async () => {
    const calls = mockNetwork();
    routes["POST /workspace/session/"] = () =>
      json(200, { access: "TENANT", refresh: "TENANT-R", user_id: "t1" });
    window.history.pushState({}, "", "/?id=LOC1&link=SIGNED.CODE");
    const router = renderApp("/");
    await waitFor(() => expect(calls).toContain("POST /workspace/session/"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
    expect(getTokens()).toEqual({ access: "TENANT", refresh: "TENANT-R" });
  });
});
