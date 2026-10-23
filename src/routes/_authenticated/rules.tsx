import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/rules")({
  beforeLoad: () => {
    throw redirect({ to: "/settings", search: { tab: "rules" } });
  },
});
