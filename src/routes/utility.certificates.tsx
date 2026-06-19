import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/utility/certificates")({
  // Connection Certificates was a backend-less "future module" preview with no
  // live data. Redirect to the Consumer Registry until the module is real.
  beforeLoad: () => {
    throw redirect({ to: "/utility/uc" });
  },
});
