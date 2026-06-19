import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/utility/area")({
  // The Concession Area view duplicated the UTILITY operator listing already
  // covered by the Consumer Registry. Redirect there to avoid a redundant page.
  beforeLoad: () => {
    throw redirect({ to: "/utility/uc" });
  },
});
