/**
 * Contract test: exercises every endpoint module the UI uses against a LIVE Django server and asserts the
 * response shapes the pages depend on. Skipped unless E2E_API=1 (see README, "Testing").
 */
import { beforeAll, describe, expect, it } from "vitest";

import { getAccountingReportsFn } from "./accounting";
import {
  addLedgerTagFn,
  assignLedgerFn,
  createLedgerEntryFn,
  createLedgerFn,
  deleteLedgerEntryFn,
  deleteLedgerFn,
  getLedgerFn,
  ledgerSummariesFn,
  listLedgersFn,
  listTagsFn,
  removeLedgerTagFn,
  updateLedgerEntryFn,
  updateLedgerFn,
  updateLedgerTransactionFn,
} from "./ledgers";
import {
  deleteCategoryFn,
  deleteRuleFn,
  getProfileFn,
  getSyncStatusFn,
  listCategoriesFn,
  listNotificationsFn,
  listRulesFn,
  markNotificationsReadFn,
  updateProfileFn,
  updateRuleFn,
  upsertCategoryFn,
} from "./app";
import { ApiError, api, refreshAccessToken } from "./client";
import { auth } from "./auth";
import { getAccountsFn, plaidConfigStatusFn, syncTransactionsFn } from "./plaid";
import { getDashboardDataFn, getReportDataFn } from "./reports";
import {
  bulkCategorizeFn,
  createRuleFn,
  exportTransactionsFn,
  listTransactionsFn,
  recategorizeAllFn,
  updateTransactionFn,
} from "./transactions";
import { export1099CsvFn, getVendorProfileFn, saveVendorProfileFn } from "./vendor1099";
import {
  confirmGhlLinkFn,
  getGhlLinkOptionsFn,
  listGhlLinksFn,
  listLedgerInvoicesFn,
  openGhlWorkspace,
  syncGhlInvoicesFn,
  unlinkGhlLocationFn,
} from "./ghl";
import { getTokens, setTokens } from "./session";

const run = process.env["E2E_API"] === "1";
const api_base = () =>
  (process.env["VITE_API_BASE_URL"] ?? "http://localhost:8000/api/v1").replace(/\/$/, "");
const email = `e2e-${Date.now()}@example.com`;
const password = "Str0ng-e2e-pass!";

describe.skipIf(!run)("frontend ↔ backend contract", () => {
  const ctx: Record<string, string> = {};

  beforeAll(async () => {
    await auth.signUp(email, password, "E2E User");
  });

  it("auth: session, profile, validation errors", async () => {
    expect(auth.hasSession()).toBe(true);
    const user = await auth.getUser();
    expect(user?.email).toBe(email);
    expect((await getProfileFn()).profile.full_name).toBe("E2E User");
    await updateProfileFn({ data: { fullName: "Renamed" } });
    expect((await getProfileFn()).profile.full_name).toBe("Renamed");
    await expect(auth.signUp(email, password, "dup")).rejects.toMatchObject({ status: 400 });
    await expect(auth.signIn(email, "wrong-password")).rejects.toMatchObject({ status: 401 });
    await expect(auth.requestPasswordReset(email)).resolves.toBeTruthy();
  });

  it("transparently refreshes an expired access token", async () => {
    const t = getTokens()!;
    setTokens({ access: "garbage.token.value", refresh: t.refresh });
    expect((await getProfileFn()).profile.email).toBe(email);
    expect(getTokens()!.access).not.toBe("garbage.token.value");
    expect(await refreshAccessToken()).toBe(true);
  });

  it("categories: system chart + own CRUD", async () => {
    const { categories } = await listCategoriesFn();
    expect(categories.filter((c) => c.is_system).length).toBeGreaterThanOrEqual(47);
    ctx["sales"] = categories.find((c) => c.name === "Sales Revenue")!.id;
    ctx["meals"] = categories.find((c) => c.name === "Meals & Entertainment")!.id;
    const { id } = await upsertCategoryFn({
      data: { name: "E2E Custom", type: "operating_expense", color: "#123456" },
    });
    await upsertCategoryFn({ data: { id, name: "E2E Custom 2", type: "operating_expense" } });
    expect((await listCategoriesFn()).categories.some((c) => c.name === "E2E Custom 2")).toBe(true);
    await deleteCategoryFn({ data: { id } });
    const sys = categories.find((c) => c.is_system)!;
    await expect(deleteCategoryFn({ data: { id: sys.id } })).rejects.toBeInstanceOf(ApiError);
  });

  it("ledgers: create, update, tags, summaries, detail", async () => {
    const { id } = await createLedgerFn({
      data: { label: "E2E Acme", accountClass: "current_asset", contactName: "Ann" },
    });
    ctx["ledger"] = id;
    await expect(
      createLedgerFn({ data: { label: "E2E Acme", accountClass: "equity" } }),
    ).rejects.toThrow("unique");
    await updateLedgerFn({
      data: { id, label: "E2E Acme Co", accountClass: "current_asset", contactEmail: "a@b.co" },
    });
    await addLedgerTagFn({ data: { ledgerId: id, name: "vip" } });
    const { tags } = await listTagsFn();
    expect(tags.map((t) => t.name)).toContain("vip");
    const { ledgers } = await listLedgersFn();
    expect(ledgers.find((l) => l.id === id)).toMatchObject({
      label: "E2E Acme Co",
      contact_email: "a@b.co",
      tags: [{ name: "vip" }],
    });
    const detail = await getLedgerFn({ data: { id } });
    expect(detail).toMatchObject({ transactionCount: 0, tags: [{ name: "vip" }] });
    expect(detail.ledger.account_class).toBe("current_asset");
    await removeLedgerTagFn({ data: { ledgerId: id, tagId: tags[0]!.id } });
    expect((await getLedgerFn({ data: { id } })).tags).toEqual([]);
  });

  it("manual entries + transactions list/filters/update/bulk/export", async () => {
    const ledgerId = ctx["ledger"]!;
    await createLedgerEntryFn({
      data: {
        ledgerId,
        date: "2026-02-10",
        description: "Consulting fee",
        amount: 1200,
        type: "revenue",
        status: "posted",
        accountingStatus: "accounts_receivable",
        dueDate: "2026-03-10",
      },
    });
    await createLedgerEntryFn({
      data: {
        ledgerId,
        date: "2026-02-11",
        description: "Starbucks run",
        amount: 15.5,
        type: "operating_expense",
      },
    });
    await expect(
      createLedgerEntryFn({
        data: {
          ledgerId,
          date: "2026-02-11",
          description: "bad",
          amount: 1,
          type: "revenue",
          accountingStatus: "paid",
        },
      }),
    ).rejects.toThrow("does not match");

    const detail = await getLedgerFn({ data: { id: ledgerId } });
    expect(detail.transactionCount).toBe(2);
    const fee = detail.transactions.find((t) => t.description === "Consulting fee")!;
    expect(fee).toMatchObject({
      source: "manual",
      gaap_type: "revenue",
      is_income: true,
      accounting_status: "accounts_receivable",
    });
    expect(Number(fee.amount)).toBe(1200);
    ctx["fee"] = fee.id;
    const coffee = detail.transactions.find((t) => t.description === "Starbucks run")!;
    expect(Number(coffee.amount)).toBe(-15.5);
    ctx["coffee"] = coffee.id;

    await updateLedgerEntryFn({
      data: {
        id: fee.id,
        ledgerId,
        date: "2026-02-10",
        description: "Consulting fee",
        amount: 1300,
        type: "revenue",
        accountingStatus: "received",
      },
    });
    await updateLedgerTransactionFn({ data: { id: coffee.id, status: "pending" } });
    await updateLedgerTransactionFn({
      data: { id: fee.id, accountingStatus: "accounts_receivable", dueDate: "2026-03-15" },
    });

    const list = await listTransactionsFn({
      data: { page: 1, pageSize: 10, sortBy: "amount", sortDir: "desc" },
    });
    expect(list).toMatchObject({ total: 2, page: 1, pageSize: 10 });
    expect(list.rows[0]!.description).toBe("Consulting fee");
    expect(list.rows[0]).toHaveProperty("categories");
    expect((await listTransactionsFn({ data: { search: "starb" } })).total).toBe(1);
    expect((await listTransactionsFn({ data: { direction: "income" } })).total).toBe(1);
    expect((await listTransactionsFn({ data: { status: "pending" } })).total).toBe(1);
    expect(
      (
        await listTransactionsFn({
          data: { from: "2026-02-11", to: "2026-02-28", minAmount: -100, maxAmount: 0 },
        })
      ).total,
    ).toBe(1);

    await updateTransactionFn({ data: { id: coffee.id, categoryId: ctx["meals"]! } });
    await updateTransactionFn({ data: { id: coffee.id, isHidden: true } });
    expect((await listTransactionsFn({ data: {} })).total).toBe(1);
    expect((await listTransactionsFn({ data: { includeHidden: true } })).total).toBe(2);
    await updateTransactionFn({ data: { id: coffee.id, isHidden: false } });
    expect(
      (await bulkCategorizeFn({ data: { ids: [fee.id], categoryId: ctx["sales"]! } })).updated,
    ).toBe(1);

    const { rows } = await exportTransactionsFn({ data: { direction: "all" } });
    expect(rows.length).toBe(2);
    expect(rows.find((r) => r.id === coffee.id)!.categories?.name).toBe("Meals & Entertainment");

    expect((await assignLedgerFn({ data: { ids: [coffee.id], ledgerId } })).updated).toBe(1);
    const sums = await ledgerSummariesFn();
    expect(sums.summaries[ledgerId]!.count).toBe(2);
  });

  it("rules: create (with back-fill), list, update, delete, recategorize", async () => {
    const { ruleId, applied } = await createRuleFn({
      data: {
        keyword: "consulting",
        categoryId: ctx["sales"]!,
        ledgerId: ctx["ledger"]!,
        source: "user",
      },
    });
    expect(applied).toBe(1);
    await expect(createRuleFn({ data: { keyword: "nothing" } })).rejects.toThrow();
    const { rules } = await listRulesFn();
    const rule = rules.find((r) => r.id === ruleId)!;
    expect(rule).toMatchObject({ keyword: "consulting", match_type: "contains", active: true });
    expect(rule.categories?.name).toBe("Sales Revenue");
    expect(rule.ledgers?.label).toBe("E2E Acme Co");
    await updateRuleFn({ data: { id: ruleId, active: false, priority: 5 } });
    expect((await listRulesFn()).rules.find((r) => r.id === ruleId)).toMatchObject({
      active: false,
      priority: 5,
    });
    expect((await getLedgerFn({ data: { id: ctx["ledger"]! } })).rules.length).toBe(1);
    expect((await recategorizeAllFn()).updated).toBe(0); // manual entries are never recategorized
    await deleteRuleFn({ data: { id: ruleId } });
    expect((await listRulesFn()).rules).toEqual([]);
  });

  it("reports, dashboard and accounting statements", async () => {
    const r = await getReportDataFn({
      data: { from: "2026-01-01", to: "2026-12-31", granularity: "month" },
    });
    expect(r.totals.total_income).toBe(1300);
    expect(r.totals.total_expenses).toBe(15.5);
    expect(r.series).toEqual([{ period: "2026-02", income: 1300, expenses: 15.5, net: 1284.5 }]);
    expect(r.top_merchants[0]).toEqual({ name: "Starbucks run", value: 15.5 });
    expect(r.largest_transactions[0]).toHaveProperty("currency");
    const dash = await getDashboardDataFn({ data: { from: "2026-01-01", to: "2026-12-31" } });
    expect(dash).toMatchObject({ accounts: [], items: [], current_balance: 0 });
    const acc = await getAccountingReportsFn({ data: { from: "2026-01-01", to: "2026-12-31" } });
    expect(acc.profit_and_loss.total_revenue).toBe(1300);
    expect(acc.ar_aging.rows[0]).toMatchObject({ label: "E2E Acme Co", total: 1300 });
    expect(acc.balance_sheet.equity.at(-1)!.label).toBe("Retained earnings");
    expect(acc.trial_balance.rows.length).toBeGreaterThan(0);
    // the pending coffee entry is excluded from posted statements
    expect(acc.general_ledger[0]!.entries.length).toBe(1);
  });

  it("1099 vendor profile + CSV export", async () => {
    const ledgerId = ctx["ledger"]!;
    expect((await getVendorProfileFn({ data: { ledgerId, year: 2026 } })).profile).toBeNull();
    await saveVendorProfileFn({
      data: {
        ledgerId,
        is1099Vendor: true,
        formType: "nec",
        legalName: "Ann Acme",
        taxClassification: "individual",
        tinType: "ssn",
        tin: "123-45-6789",
        addressLine1: "1 Main",
        city: "Austin",
        state: "tx",
        postalCode: "78701",
        w9ReceivedAt: "2026-01-01",
      },
    });
    const { profile, summary } = await getVendorProfileFn({ data: { ledgerId, year: 2026 } });
    expect(profile).toMatchObject({ tin_last4: "6789", state: "TX", is_1099_vendor: true });
    expect(JSON.stringify(profile)).not.toContain("123456789");
    expect(summary).toMatchObject({ form: "1099-NEC", threshold: 2000, tin_masked: "***-**-6789" });
    const csv = await export1099CsvFn({ data: { year: 2026 } });
    expect(csv.count).toBe(1);
    expect(csv.csv).toContain("123-45-6789");
    await expect(
      saveVendorProfileFn({ data: { ledgerId, is1099Vendor: true, formType: "nec", tin: "12" } }),
    ).rejects.toThrow("9 digits");
  });

  it("notifications, sync status, plaid + ghl endpoints without credentials", async () => {
    expect((await listNotificationsFn()).notifications).toEqual([]);
    await markNotificationsReadFn();
    expect(await getSyncStatusFn()).toMatchObject({ logs: [], items: [], transactionCount: 2 });
    expect(await getAccountsFn()).toEqual({ items: [], accounts: [] });
    expect(await syncTransactionsFn({ data: {} })).toMatchObject({ synced: 0 });
    expect(await plaidConfigStatusFn()).toHaveProperty("configured");
    await expect(syncGhlInvoicesFn()).rejects.toThrow("isn't linked");
    expect((await listLedgerInvoicesFn({ data: { ledgerId: ctx["ledger"]! } })).invoices).toEqual(
      [],
    );
  });

  it("tenant isolation: a second user sees none of this data", async () => {
    const mine = getTokens()!;
    await auth.signOut();
    await auth.signUp(`e2e-other-${Date.now()}@example.com`, password, "Other");
    expect((await listLedgersFn()).ledgers).toEqual([]);
    expect((await listTransactionsFn({ data: {} })).total).toBe(0);
    await expect(getLedgerFn({ data: { id: ctx["ledger"]! } })).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      updateTransactionFn({ data: { id: ctx["fee"]!, isHidden: true } }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(api.delete(`/entries/${ctx["fee"]}/`)).rejects.toMatchObject({ status: 404 });
    setTokens(mine);
  });

  it("deleting entries and ledgers", async () => {
    await deleteLedgerEntryFn({ data: { id: ctx["fee"]! } });
    await deleteLedgerFn({ data: { id: ctx["ledger"]! } });
    expect((await listLedgersFn()).ledgers).toEqual([]);
    await auth.signOut();
    expect(auth.hasSession()).toBe(false);
    await expect(getProfileFn()).rejects.toMatchObject({ status: 401 });
  });

  it("ghl linking: nothing linked, forged codes rejected, install URL is public", async () => {
    await auth.signIn(email, password);
    expect(await listGhlLinksFn()).toEqual({ locations: [] });
    await expect(getGhlLinkOptionsFn({ data: { code: "forged.code" } })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      confirmGhlLinkFn({ data: { code: "forged.code", locationId: "LOC1" } }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(unlinkGhlLocationFn({ data: { locationId: "NOPE" } })).rejects.toMatchObject({
      status: 404,
    });
    const res = await fetch(`${api_base()}/workspace/install/`, { redirect: "manual" });
    expect([302, 0, 503]).toContain(res.status); // 302 when GHL is configured, 503 (generic) when not; never an auth error
    await auth.signOut();
  });

  it("ghl session endpoint rejects malformed ids", async () => {
    await expect(openGhlWorkspace("bad id!")).rejects.toMatchObject({ status: 403 });
  });
});
