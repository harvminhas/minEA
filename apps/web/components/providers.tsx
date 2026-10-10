"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth-context";
import { AppBootProvider } from "@/lib/app-boot-context";
import { AppBootGate } from "@/components/ui/AppBootGate";
import { LastAppPathTracker } from "@/components/LastAppPathTracker";
import { Toaster } from "@/components/ui/toaster";
import { installDuplicateKeyProbe } from "@/lib/dev/duplicate-key-probe";

// Dev only (no-op in production): print the key and component stack of any duplicate-key warning.
if (process.env.NODE_ENV !== "production") installDuplicateKeyProbe();

const ReactQueryDevtools = dynamic(
  () => import("@tanstack/react-query-devtools").then((mod) => mod.ReactQueryDevtools),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <AppBootProvider>
          <LastAppPathTracker />
          <AppBootGate>{children}</AppBootGate>
        </AppBootProvider>
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </AuthProvider>
  );
}
