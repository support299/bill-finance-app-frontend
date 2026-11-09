import type { ReactNode } from "react";

import { useAccess } from "@/hooks/use-access";

/** Renders its children only for people who may change things (view-only users do not see write controls). */
export function Editable({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can_edit } = useAccess();
  return <>{can_edit ? children : fallback}</>;
}
