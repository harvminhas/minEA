"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useAppBoot } from "@/lib/app-boot-context";
import { orgsApi, workspacesApi } from "@/lib/api-client";
import {
  STARTUP_AUTH_STEPS,
  STARTUP_HOME_STEPS,
  STARTUP_SHELL_STEPS,
  StartupLoader,
} from "@/components/ui/StartupLoader";

function isPublicBootPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/auth")) return true;
  if (pathname === "/contact") return true;
  if (pathname.startsWith("/share/")) return true;
  if (pathname.startsWith("/invites/")) return true;
  return false;
}

function parseOrgSlug(pathname: string): string | null {
  const match = pathname.match(/^\/orgs\/([^/]+)/);
  return match?.[1] ?? null;
}

function parseWorkspaceSlug(pathname: string): string | null {
  const match = pathname.match(/^\/orgs\/[^/]+\/workspaces\/([^/]+)/);
  return match?.[1] ?? null;
}

function setBootPending(active: boolean) {
  document.body.classList.toggle("app-boot-pending", active);
}

export function AppBootGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isLoaded, sessionReady, isSignedIn, getToken } = useAuth();
  const { homeStep, setHomeStep } = useAppBoot();

  const isPublic = isPublicBootPath(pathname);
  const orgSlug = parseOrgSlug(pathname);
  const workspaceSlug = parseWorkspaceSlug(pathname);
  const isEmbed = pathname.includes("/embed/");
  const needsOrg = Boolean(orgSlug && !isEmbed);
  const needsWorkspace = Boolean(workspaceSlug && !isEmbed);

  const authReady = isLoaded && sessionReady;

  const { isFetched: orgFetched } = useQuery({
    queryKey: ["org", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return orgsApi.get(orgSlug!, token);
    },
    enabled: needsOrg && authReady && isSignedIn,
    retry: false,
  });

  const { isFetched: workspaceFetched } = useQuery({
    queryKey: ["workspace", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return workspacesApi.get(orgSlug!, workspaceSlug!, token);
    },
    enabled: needsWorkspace && authReady && isSignedIn,
    retry: false,
  });

  useEffect(() => {
    if (pathname !== "/home") setHomeStep(0);
  }, [pathname, setHomeStep]);

  const bootActive = useMemo(() => {
    if (isPublic) return false;
    if (!isLoaded || !sessionReady) return true;
    if (!isSignedIn) {
      return !isPublic;
    }
    if (pathname === "/home") return true;
    if (needsOrg && !orgFetched) return true;
    if (needsWorkspace && !workspaceFetched) return true;
    return false;
  }, [
    isPublic,
    isLoaded,
    sessionReady,
    isSignedIn,
    pathname,
    needsOrg,
    orgFetched,
    needsWorkspace,
    workspaceFetched,
  ]);

  const { steps, stepIndex } = useMemo(() => {
    if (!isLoaded) return { steps: STARTUP_AUTH_STEPS, stepIndex: 0 };
    if (!sessionReady) return { steps: STARTUP_AUTH_STEPS, stepIndex: 1 };
    if (!isSignedIn) return { steps: STARTUP_AUTH_STEPS, stepIndex: 2 };
    if (pathname === "/home") {
      return { steps: STARTUP_HOME_STEPS, stepIndex: homeStep };
    }
    if (needsOrg && !orgFetched) {
      return { steps: STARTUP_SHELL_STEPS, stepIndex: 0 };
    }
    if (needsWorkspace && !workspaceFetched) {
      return { steps: STARTUP_SHELL_STEPS, stepIndex: 1 };
    }
    return { steps: STARTUP_AUTH_STEPS, stepIndex: 2 };
  }, [
    isLoaded,
    sessionReady,
    isSignedIn,
    pathname,
    homeStep,
    needsOrg,
    orgFetched,
    needsWorkspace,
    workspaceFetched,
  ]);

  useLayoutEffect(() => {
    setBootPending(bootActive);
  }, [bootActive]);

  return (
    <>
      {bootActive && (
        <StartupLoader stepIndex={stepIndex} steps={steps} overlay />
      )}
      {children}
    </>
  );
}
