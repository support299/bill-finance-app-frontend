import { api, endpoint } from "./client";
import { filterQuery, type TransactionFilters } from "./transactions";

export const PROJECT_ROLES = ["deposit", "equipment", "labor", "other"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];
export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  deposit: "Deposit / revenue",
  equipment: "Equipment",
  labor: "Labor",
  other: "Other cost",
};

export interface ProjectTotals {
  revenue: string;
  costs: Record<"equipment" | "labor" | "other", string>;
  total_costs: string;
  profit: string;
  margin_pct: number | null;
  ignored_count: number;
}

export interface Project {
  id: string;
  name: string;
  ledger_id: string | null;
  status: "open" | "finished";
  budget: string | null;
  notes: string | null;
  /** YYYY-MM-DD; null = open-ended. */
  start_date: string | null;
  end_date: string | null;
  created_at: string;
}

export interface ProjectListFilters {
  status?: "open" | "finished" | "all" | undefined;
  /** Keep projects active somewhere in this window (overlap, so undated projects still show). */
  from?: string | undefined;
  to?: string | undefined;
}

export interface ProjectReport extends ProjectTotals {
  budget: string | null;
  budget_used_pct: number | null;
  transactions: {
    id: string;
    date: string;
    description: string;
    category: string;
    amount: string;
    type: string;
    role: ProjectRole | null;
  }[];
}

export const listProjectsFn = endpoint(async (f: ProjectListFilters | undefined) =>
  api.get<{ projects: (Project & { totals: ProjectTotals })[] }>("/projects/", {
    status: f?.status,
    from: f?.from,
    to: f?.to,
  }),
);

export const createProjectFn = endpoint(
  async (d: {
    name: string;
    ledgerId?: string | null;
    budget?: number | null;
    notes?: string;
    startDate?: string | null;
    endDate?: string | null;
  }) =>
    api.post<Project>("/projects/", {
      name: d.name,
      ...(d.ledgerId !== undefined ? { ledger_id: d.ledgerId } : {}),
      ...(d.budget !== undefined ? { budget: d.budget } : {}),
      ...(d.notes ? { notes: d.notes } : {}),
      ...(d.startDate !== undefined ? { start_date: d.startDate } : {}),
      ...(d.endDate !== undefined ? { end_date: d.endDate } : {}),
    }),
);

export const updateProjectFn = endpoint(
  async (d: {
    id: string;
    name?: string;
    status?: "open" | "finished";
    budget?: number | null;
    ledgerId?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }) =>
    api.patch<Project>(`/projects/${d.id}/`, {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.status ? { status: d.status } : {}),
      ...(d.budget !== undefined ? { budget: d.budget } : {}),
      ...(d.ledgerId !== undefined ? { ledger_id: d.ledgerId } : {}),
      ...(d.startDate !== undefined ? { start_date: d.startDate } : {}),
      ...(d.endDate !== undefined ? { end_date: d.endDate } : {}),
    }),
);

export const deleteProjectFn = endpoint(async (d: { id: string }) =>
  api.delete(`/projects/${d.id}/`),
);

export const getProjectReportFn = endpoint(async (d: { id: string }) =>
  api.get<{ project: Project; report: ProjectReport }>(`/projects/${d.id}/report/`),
);

/** Puts transactions on a project (or removes them with projectId null); ids, or every match of the filters. */
export const assignProjectFn = endpoint(
  async (d: {
    projectId: string | null;
    role?: ProjectRole | null;
    ids?: string[];
    selectAll?: { filters: TransactionFilters; expectedCount: number };
  }) =>
    api.post<{ updated: number }>("/transactions/bulk-assign-project/", {
      project_id: d.projectId,
      ...(d.role !== undefined ? { project_role: d.role } : {}),
      ...(d.selectAll
        ? {
            select_all: true,
            filters: filterQuery(d.selectAll.filters),
            expected_count: d.selectAll.expectedCount,
          }
        : { ids: d.ids ?? [] }),
    }),
);
