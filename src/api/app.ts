import { api, endpoint } from "./client";
import type { Category, GaapType, Notification, Rule, SyncLog } from "./types";

/* ------------------------------ categories ------------------------------ */
export const listCategoriesFn = endpoint(async (_: void) => ({
  categories: await api.get<Category[]>("/categories/"),
}));

export const upsertCategoryFn = endpoint(
  async (d: {
    id?: string;
    name: string;
    type: string;
    color?: string;
    icon?: string;
    /** Parent category (one level deep); null makes it top-level. */
    parentId?: string | null;
    sortOrder?: number;
  }) => {
    const body = {
      name: d.name,
      type: d.type as GaapType,
      color: d.color ?? null,
      icon: d.icon ?? null,
      ...(d.parentId !== undefined ? { parent_category: d.parentId } : {}),
      ...(d.sortOrder !== undefined ? { sort_order: d.sortOrder } : {}),
    };
    const row = d.id
      ? await api.patch<Category>(`/categories/${d.id}/`, body)
      : await api.post<Category>("/categories/", body);
    return { id: row.id };
  },
);

/** Saves this user's P&L order for sibling categories (same type and parent), first to last. */
export const reorderCategoriesFn = endpoint(async (d: { ids: string[] }) => {
  await api.post("/categories/reorder/", { ids: d.ids });
  return { ok: true };
});

export const deleteCategoryFn = endpoint(async (d: { id: string }) => {
  await api.delete(`/categories/${d.id}/`);
  return { ok: true };
});

/* --------------------------------- rules -------------------------------- */
export const listRulesFn = endpoint(async (_: void) => ({
  rules: await api.get<Rule[]>("/rules/"),
}));

export const updateRuleFn = endpoint(
  async (d: { id: string; active?: boolean; priority?: number; keyword?: string }) => {
    const { id, ...patch } = d;
    await api.patch(`/rules/${id}/`, patch);
    return { ok: true };
  },
);

export const deleteRuleFn = endpoint(async (d: { id: string }) => {
  await api.delete(`/rules/${d.id}/`);
  return { ok: true };
});

/* ---------------------------- notifications ---------------------------- */
export const listNotificationsFn = endpoint(async (_: void) => ({
  notifications: await api.get<Notification[]>("/notifications/"),
}));

export const markNotificationsReadFn = endpoint(async (_: void) => {
  await api.post("/notifications/mark-read/", {});
  return { ok: true };
});

/* ------------------------------- profile ------------------------------- */
interface Profile {
  id: string;
  email: string;
  full_name: string;
  business_name: string;
}

export const getProfileFn = endpoint(async (_: void) => ({
  profile: await api.get<Profile>("/profile/"),
}));

export const updateProfileFn = endpoint(async (d: { fullName: string; businessName?: string }) => {
  await api.patch("/profile/", {
    full_name: d.fullName,
    ...(d.businessName !== undefined ? { business_name: d.businessName } : {}),
  });
  return { ok: true };
});

/* ----------------------------- sync status ----------------------------- */
export interface SyncStatus {
  logs: SyncLog[];
  items: {
    id: string;
    institution_name: string | null;
    last_sync_at: string | null;
    connection_status: string;
    initial_sync_done: boolean;
    error_message: string | null;
  }[];
  transactionCount: number;
}

export const getSyncStatusFn = endpoint(async (_: void): Promise<SyncStatus> => {
  const r = await api.get<Omit<SyncStatus, "transactionCount"> & { transaction_count: number }>(
    "/sync-status/",
  );
  return { logs: r.logs, items: r.items, transactionCount: r.transaction_count };
});
