"use client";

import { createContext, useContext, useEffect } from "react";
import { AccessProvider } from "@/lib/access-context";

export interface ShareSession {
  token: string;
  orgSlug: string;
  workspaceSlug: string;
  orgName?: string;
  workspaceName?: string;
  sharedByName?: string | null;
}

const ShareSessionContext = createContext<ShareSession | null>(null);
const TenancyOverrideContext = createContext<{ orgSlug: string; workspaceSlug: string } | null>(
  null
);

let activeShareSession: ShareSession | null = null;

export function setActiveShareSession(session: ShareSession | null) {
  activeShareSession = session;
}

export function getShareApiPath(apiPath: string): string | null {
  if (!activeShareSession) return null;
  const base = `/orgs/${activeShareSession.orgSlug}/workspaces/${activeShareSession.workspaceSlug}`;
  if (!apiPath.startsWith(base)) return null;
  const suffix = apiPath.slice(base.length);
  return `/shares/${activeShareSession.token}/data${suffix}`;
}

export function ShareSessionProvider({
  session,
  children,
}: {
  session: ShareSession;
  children: React.ReactNode;
}) {
  // Set synchronously so the first render's queries route through the share API.
  setActiveShareSession(session);

  useEffect(() => {
    setActiveShareSession(session);
    return () => setActiveShareSession(null);
  }, [session.token, session.orgSlug, session.workspaceSlug]);

  return (
    <AccessProvider mode="share">
      <ShareSessionContext.Provider value={session}>
        <TenancyOverrideContext.Provider
          value={{ orgSlug: session.orgSlug, workspaceSlug: session.workspaceSlug }}
        >
          {children}
        </TenancyOverrideContext.Provider>
      </ShareSessionContext.Provider>
    </AccessProvider>
  );
}

export function useShareSession() {
  return useContext(ShareSessionContext);
}

export function useTenancyOverride() {
  return useContext(TenancyOverrideContext);
}
