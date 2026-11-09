import { useQuery } from "@tanstack/react-query";

import { getWorkspaceMeFn, type WorkspaceMe } from "@/api/access";

const OWNER: WorkspaceMe = {
  actor: null,
  access: "owner",
  can_edit: true,
  can_manage_users: false,
  can_switch: false,
  location: null,
};

/** What the signed-in person may do. Optimistic (full access) until the server answers; the backend enforces either way. */
export function useAccess(): WorkspaceMe & { isViewer: boolean; loaded: boolean } {
  const query = useQuery({
    queryKey: ["workspace-me"],
    queryFn: () => getWorkspaceMeFn({ data: undefined }),
    staleTime: 60_000,
  });
  const me = query.data ?? OWNER;
  return { ...me, isViewer: me.access === "viewer", loaded: Boolean(query.data) };
}
