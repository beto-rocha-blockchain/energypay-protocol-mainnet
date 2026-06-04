import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { installChunkReload } from "@/lib/chunk-reload";

export const getRouter = () => {
  // Auto-reload tabs running a stale bundle after a deploy (no-op on the server).
  installChunkReload();
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
