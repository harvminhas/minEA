"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { onForbiddenRefreshMembership } from "@/lib/membership-freshness";
import { retryUnlessClientError } from "@/lib/org-unavailable";
import { AuthProvider } from "@/lib/auth-context";
import { AppBootProvider } from "@/lib/app-boot-context";
import { AppBootGate } from "@/components/ui/AppBootGate";
import { LastAppPathTracker } from "@/components/LastAppPathTracker";
import { Toaster } from "@/components/ui/toaster";
import { ObjectLimitNotice } from "@/components/billing/ObjectLimitNotice";
import { installDuplicateKeyProbe } from "@/lib/dev/duplicate-key-probe";
import { CatalogWriteSync } from "@/lib/use-model-catalog";

// Dev only (no-op in production): print the key and component stack of any duplicate-key warning.
if (process.env.NODE_ENV !== "production") installDuplicateKeyProbe();

const ReactQueryDevtools = dynamic(
  () => import("@tanstack/react-query-devtools").then((mod) => mod.ReactQueryDevtools),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    // A 403 from any call means the cached role may be stale: refetch the role queries.
    const client: QueryClient = new QueryClient({
        queryCache: new QueryCache({ onError: (err, query) => onForbiddenRefreshMembership(client, err, query.queryKey) }),
        mutationCache: new MutationCache({ onError: (err) => onForbiddenRefreshMembership(client, err) }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            // 4xx never succeeds on retry (a deleted org stays deleted); network/5xx get one more try.
            retry: (count, err) => retryUnlessClientError(count, err),
          },
        },
      });
    return client;
  });

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <CatalogWriteSync />
        <AppBootProvider>
          <LastAppPathTracker />
          <AppBootGate>{children}</AppBootGate>
        </AppBootProvider>
        <Toaster />
        <ObjectLimitNotice />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </AuthProvider>
  );
}
