"use client";

import { MEMBERSHIP_QUERY } from "@/lib/membership-freshness";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { billingApi, orgsApi, workspacesApi } from "@/lib/api-client";
import { primaryViewPath } from "@/lib/tenancy";
import { usePermissions } from "@/lib/use-permissions";
import { firstWorkspace, notAdminOf, orgLoadErrorMessage, otherAdminOrgs } from "@/lib/org-access";
import { NotOrgAdmin, OrgLoadError } from "@/components/org/OrgNotices";
import { usePlanFeatures } from "@/lib/use-plan-features";
import {
  inviteUpgradeMessage,
  workspaceCreateBlockedMessage,
  workspaceQuotaLabel,
} from "@/lib/plan-features";
import { PlanSection } from "@/components/billing/PlanSection";
import { BillingCentre } from "@/components/billing/BillingCentre";
import { useCheckoutWatch } from "@/lib/billing/use-checkout-watch";
import { parseCheckoutSessionId } from "@/lib/support";
import { businessGetStartedHref } from "@/lib/billing/business-request";
import { BillingPreviewSwitch } from "@/components/billing/BillingPreviewSwitch";
import { LicencesPanel } from "@/components/billing/LicencesPanel";
import { PendingInviteRow } from "@/components/org/PendingInviteRow";
import { adminWorkspaces, canEditWorkspaceSettings, workspaceSettingsPath } from "@/lib/workspace-admin";
import { OrgMembersTable } from "@/components/org/OrgMembersTable";
import { billingPreviewEnabled, billingUiEnabled } from "@/lib/billing/flags";
import { ADMIN_TABS, adminTabHref, resolveAdminTab, type AdminTab } from "@/lib/billing/admin-centre";
import {
  entitlementsFor,
  parsePreviewPlan,
  planFromStatus,
  type BillingInterval,
  type PackId,
} from "@/lib/billing/plans";
import {
  billingErrorMessage,
  checkoutBody,
  parseCheckoutReturn,
  parsePortalReturn,
  RETURN_REFETCH_MS,
  type CheckoutReturn,
} from "@/lib/billing/checkout";
import { summarizeLicences } from "@/lib/billing/licences";
import { useLicenceRoster } from "@/lib/billing/use-licence-roster";
import { useAppStore } from "@/lib/store";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";

export default function OrgSettingsPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken, user, resendVerificationEmail, reloadUser } = useAuth();
  const queryClient = useQueryClient();
  const {
    canManageOrg,
    canCreateWorkspace,
    canManageBilling,
    canDeleteOrg,
    canInviteOrgMembers,
    isOrgAdmin,
    orgRole,
  } = usePermissions();
  const { plan } = usePlanFeatures();
  const { setActiveOrg, setActiveWorkspace } = useAppStore();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [verifyLink, setVerifyLink] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturn | null>(null);
  const [portalReturn, setPortalReturn] = useState(false);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);

  const emailVerified = user ? !user.requiresEmailVerification : false;

  useEffect(() => {
    const billing = searchParams.get("billing");
    if (billing === "success") {
      setBillingMessage(
        "Welcome to Business! Your plan updates in a few seconds."
      );
      void queryClient.invalidateQueries({ queryKey: ["org", orgSlug] });
      void queryClient.invalidateQueries({ queryKey: ["billing-status", orgSlug] });
      router.replace(`/orgs/${orgSlug}/settings`, { scroll: false });
    } else if (billing === "cancelled") {
      setBillingMessage("Checkout cancelled — no charge was made.");
      router.replace(`/orgs/${orgSlug}/settings`, { scroll: false });
    }
  }, [searchParams, orgSlug, queryClient, router]);

  // Back from Stripe Checkout (?checkout=success|cancelled) or the Customer Portal
  // (?portal=return). Webhooks update the plan, so refetch a few times, then drop the params.
  useEffect(() => {
    const checkout = parseCheckoutReturn(searchParams.get("checkout"));
    const portal = parsePortalReturn(searchParams.get("portal"));
    if (!checkout && !portal) return;
    if (checkout) setCheckoutReturn(checkout);
    if (checkout === "success") setCheckoutSessionId(parseCheckoutSessionId(searchParams.get("session_id")));
    if (portal) setPortalReturn(true);
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["org", orgSlug] });
      void queryClient.invalidateQueries({ queryKey: ["billing-status", orgSlug] });
    };
    refresh();
    const timers =
      checkout === "success" || portal ? RETURN_REFETCH_MS.map((ms) => setTimeout(refresh, ms)) : [];
    router.replace(adminTabHref(orgSlug, "billing"), { scroll: false });
    return () => timers.forEach(clearTimeout);
  }, [searchParams, orgSlug, queryClient, router]);

  async function startCheckout(pack: PackId, interval: BillingInterval) {
    const token = await getToken();
    const { checkout_url } = await billingApi.startCheckout(orgSlug, checkoutBody(pack, interval), token!);
    window.location.assign(checkout_url);
  }

  async function openBillingPortal() {
    const token = await getToken();
    const { portal_url } = await billingApi.openPortal(orgSlug, token!);
    window.location.assign(portal_url);
  }

  const {
    data: org,
    isError: orgError,
    error: orgLoadError,
    refetch: refetchOrg,
    isFetching: orgFetching,
  } = useQuery({
    queryKey: ["org", orgSlug],
    ...MEMBERSHIP_QUERY,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return orgsApi.get(orgSlug, token);
    },
  });

  // Every org this user belongs to (with role), for the not-admin message.
  const { data: myOrgs } = useQuery({
    queryKey: ["orgs"],
    ...MEMBERSHIP_QUERY,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return orgsApi.list(token);
    },
    enabled: notAdminOf(org),
  });

  const { data: members } = useQuery({
    queryKey: ["members", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return orgsApi.listMembers(orgSlug, token!);
    },
    enabled: canManageOrg,
  });

  const { data: invites } = useQuery({
    queryKey: ["invites", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return orgsApi.listInvites(orgSlug, token!);
    },
    enabled: canManageOrg,
  });

  const { data: workspaces } = useQuery({
    queryKey: ["workspaces", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return workspacesApi.list(orgSlug, token!);
    },
  });

  const {
    data: billingStatus,
    isError: billingStatusError,
    refetch: refetchBillingStatus,
  } = useQuery({
    queryKey: ["billing-status", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return billingApi.status(orgSlug, token!);
    },
    enabled: !!orgSlug,
  });

  const canCreateOwnWorkspace =
    canCreateWorkspace && (billingStatus?.can_create_own_workspace ?? true);

  // Admin centre (NEXT_PUBLIC_BILLING_UI). Flag off: tab is null and every section renders as before.
  const billingUi = billingUiEnabled();
  const tab = resolveAdminTab(searchParams.get("tab"), billingUi);
  const show = (t: AdminTab) => tab === null || tab === t;
  const preview = parsePreviewPlan(searchParams.get("preview"), billingPreviewEnabled());
  // From billing status only; null while it loads (never guessed from org.plan).
  const realPlan = planFromStatus(billingStatus);
  // Back from a successful Checkout: poll until the subscription shows; after 60 s show
  // "still setting up" with Get help, and report the session so the owner hears after 5 min.
  const checkoutPhase = useCheckoutWatch({
    active: checkoutReturn === "success",
    planActive: !!billingStatus?.has_subscription,
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: ["org", orgSlug] });
      void queryClient.invalidateQueries({ queryKey: ["billing-status", orgSlug] });
    },
    reportPending: async () => {
      if (!checkoutSessionId) return;
      const token = await getToken();
      if (token) await billingApi.reportCheckoutPending(orgSlug, checkoutSessionId, token);
    },
  });
  const displayPlan = planFromStatus(billingStatus, preview);
  const roster = useLicenceRoster(
    orgSlug,
    members,
    workspaces,
    billingUi && canManageOrg && (tab === "licences" || tab === "billing")
  );
  const licenceSummary = useMemo(
    () =>
      roster.rows && displayPlan
        ? summarizeLicences(
            roster.rows.filter((r) => r.hasLicence).length,
            entitlementsFor(displayPlan).licences
          )
        : null,
    [roster.rows, displayPlan]
  );
  const billingHref = adminTabHref(orgSlug, "billing", preview);
  // Billing tab: owner (as before) plus org admins. The API enforces owner/admin + verified email.
  const canSeeBilling = canManageBilling || isOrgAdmin;


  const inviteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return orgsApi.createInvite(orgSlug, { email: inviteEmail, role: inviteRole }, token!);
    },
    onSuccess: (data) => {
      setInviteEmail("");
      setInviteError(null);
      setLastInviteUrl(`${window.location.origin}${data.invite_url}`);
      queryClient.invalidateQueries({ queryKey: ["invites", orgSlug] });
    },
    onError: (err: Error) => setInviteError(billingUi ? billingErrorMessage(err) : err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const token = await getToken();
      return orgsApi.revokeInvite(orgSlug, inviteId, token!);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites", orgSlug] }),
  });

  const [memberError, setMemberError] = useState<string | null>(null);
  const refreshPeople = () => {
    // Seats are counted live from memberships, so refetching members/invites/billing updates them.
    void queryClient.invalidateQueries({ queryKey: ["members", orgSlug] });
    void queryClient.invalidateQueries({ queryKey: ["invites", orgSlug] });
    void queryClient.invalidateQueries({ queryKey: ["billing-status", orgSlug] });
  };
  const memberMutation = useMutation({
    mutationFn: async (
      action: { kind: "role"; userId: string; role: string } | { kind: "remove"; userId: string } | { kind: "leave" }
    ) => {
      const token = await getToken();
      if (action.kind === "role") return void (await orgsApi.changeMemberRole(orgSlug, action.userId, action.role, token!));
      if (action.kind === "remove") return orgsApi.removeMember(orgSlug, action.userId, token!);
      return orgsApi.leaveOrg(orgSlug, token!);
    },
    onSuccess: (_d, action) => {
      setMemberError(null);
      if (action.kind === "role" || action.kind === "remove") {
        // Show the change at once; the refetch below confirms it.
        queryClient.setQueryData(["members", orgSlug], (old: { user_id: string; role: string }[] | undefined) =>
          action.kind === "role"
            ? old?.map((m) => (m.user_id === action.userId ? { ...m, role: action.role } : m))
            : old?.filter((m) => m.user_id !== action.userId)
        );
      }
      if (action.kind === "leave") {
        void queryClient.invalidateQueries({ queryKey: ["orgs"] });
        router.replace("/");
        return;
      }
      refreshPeople();
    },
    onError: (err: Error, action) => {
      if (action.kind === "leave") setMemberError(err.message);
    },
  });
  const resendMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      const token = await getToken();
      return orgsApi.resendInvite(orgSlug, inviteId, token!);
    },
    onSuccess: () => refreshPeople(),
  });

  const membersBlock = (
    <>
    {isOrgAdmin && (
      <Link href={`/orgs/${orgSlug}/settings/people`} data-testid="people-teams-link" className="mb-3 inline-flex text-[13px] font-medium text-[#5b4ce6]">
        People &amp; teams: owner teams, named owners and roles →
      </Link>
    )}
    {isOrgAdmin && (
      <Link href={`/orgs/${orgSlug}/settings/clouds`} data-testid="clouds-tenants-link" className="mb-3 ml-4 inline-flex text-[13px] font-medium text-[#5b4ce6]">
        Clouds &amp; tenants: providers, tenants and regions →
      </Link>
    )}
    <OrgMembersTable
      members={members}
      actorRole={orgRole}
      actorEmail={user?.email}
      busy={memberMutation.isPending && memberMutation.variables?.kind === "leave"}
      error={memberError}
      onChangeRole={(userId, role) => memberMutation.mutateAsync({ kind: "role", userId, role })}
      onRemove={(userId) => memberMutation.mutateAsync({ kind: "remove", userId })}
      onLeave={() => memberMutation.mutate({ kind: "leave" })}
    />
    </>
  );

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteOrgError, setDeleteOrgError] = useState<string | null>(null);

  const deleteOrgMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return orgsApi.deleteOrg(orgSlug, token!);
    },
    onSuccess: () => {
      setActiveOrg(null);
      setActiveWorkspace(null);
      queryClient.clear();
      router.replace("/onboarding");
    },
    onError: (err: Error) => {
      setDeleteOrgError(err.message);
      setShowDeleteConfirm(false);
    },
  });

  async function handleResendVerification() {
    setVerifyLoading(true);
    setVerifyMessage(null);
    setVerifyLink(null);
    try {
      const result = await resendVerificationEmail();
      setVerifyMessage(result.message);
      if (result.verification_link) setVerifyLink(result.verification_link);
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : "Could not send email");
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleReloadVerification() {
    setVerifyLoading(true);
    setVerifyMessage(null);
    try {
      await reloadUser();
      setVerifyMessage("Status refreshed. If you verified, you can invite members now.");
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : "Could not refresh status");
    } finally {
      setVerifyLoading(false);
    }
  }

  if (!org && orgError) {
    return (
      <OrgLoadError message={orgLoadErrorMessage(orgLoadError)} onRetry={() => void refetchOrg()} retrying={orgFetching} />
    );
  }

  // Members and viewers: explain, don't redirect (the API refuses their admin calls anyway).
  // The cached role may predate a promotion: wait for the fresh read before saying "not an admin".
  if (org && notAdminOf(org) && orgFetching) {
    return (
      <div className="p-8 max-w-xl mx-auto text-sm text-gray-500" data-testid="org-access-checking">
        Checking your access…
      </div>
    );
  }
  if (org && notAdminOf(org)) {
    const ws = firstWorkspace(workspaces);
    return (
      <NotOrgAdmin
        orgName={org.name}
        role={org.role}
        askHref={ws ? primaryViewPath(orgSlug, ws.slug) : null}
        adminOrgs={otherAdminOrgs(myOrgs, orgSlug)}
        orgSlug={orgSlug}
        adminWorkspaces={adminWorkspaces(workspaces, org.role)}
      />
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {org?.name ?? orgSlug} — {billingUi && canManageOrg ? "Admin centre" : "Settings"}
      </h1>
      {org && (
        <p className="text-sm text-gray-500 mb-6 capitalize">
          Your role: <span className="font-medium text-gray-700">{org.role}</span>
        </p>
      )}

      {billingUi && canManageOrg && billingPreviewEnabled() && (
        <BillingPreviewSwitch preview={preview} realLabel={realPlan ? entitlementsFor(realPlan).label : "…"} />
      )}

      {billingUi && canManageOrg && (
        <nav className="mb-6 flex gap-1 border-b border-gray-200" aria-label="Admin centre">
          {ADMIN_TABS.filter((t) => t.id !== "billing" || canSeeBilling).map((t) => (
            <Link
              key={t.id}
              href={adminTabHref(orgSlug, t.id, preview)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                tab === t.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}

      {show("general") && (
      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">Workspaces</h2>
          {canCreateOwnWorkspace && (
            <Link
              href={`/orgs/${orgSlug}/workspaces/new`}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              + New workspace
            </Link>
          )}
        </div>
        {billingStatus && (
          <p className="text-xs text-gray-400 mb-4">
            {workspaceQuotaLabel(
              billingStatus.own_workspace_count,
              billingStatus.own_workspace_limit
            )}
            {!billingStatus.can_create_own_workspace && canCreateWorkspace && (
              <span className="block text-gray-500 mt-1">
                {workspaceCreateBlockedMessage(plan, billingStatus.own_workspace_limit)}
              </span>
            )}
          </p>
        )}
        {(workspaces ?? []).length > 0 ? (
          <div className="space-y-2">
            {(workspaces ?? []).map((ws) => (
              <div
                key={ws.id}
                className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:border-indigo-300 text-sm"
              >
                <Link href={primaryViewPath(orgSlug, ws.slug)} className="min-w-0 flex-1">
                  <span className="font-medium">{ws.name}</span>
                  <span className="text-gray-400 ml-2">/{ws.slug}</span>
                </Link>
                {canEditWorkspaceSettings(org?.role, ws.role) && (
                  <Link
                    href={workspaceSettingsPath(orgSlug, ws.slug)}
                    data-testid="org-ws-settings-link"
                    className="text-xs text-indigo-600 hover:text-indigo-700 ml-3 flex-shrink-0"
                  >
                    Settings &amp; members
                  </Link>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No workspaces available yet. Ask an org admin to add you to a workspace.
          </p>
        )}
      </section>
      )}

      {!canManageOrg && (
        <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-2">Membership</h2>
          <p className="text-sm text-gray-600">
            You are an org member. An admin must invite you to a workspace with a member or viewer
            role before you can access repository content.
          </p>
        </section>
      )}

      {!emailVerified && (
        <section className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-amber-950 mb-2">Verify your email</h2>
          <p className="text-sm text-amber-900 mb-4">
            Your account ({user?.email}) must be verified before you can invite members or perform
            sensitive actions. Check your inbox and spam folder for the verification email.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={verifyLoading}
              onClick={handleResendVerification}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium"
            >
              {verifyLoading ? "Sending…" : "Resend verification email"}
            </button>
            <button
              type="button"
              disabled={verifyLoading}
              onClick={handleReloadVerification}
              className="bg-white hover:bg-amber-100 disabled:opacity-50 text-amber-950 border border-amber-300 px-4 py-2 rounded-md text-sm font-medium"
            >
              I&apos;ve verified — refresh status
            </button>
          </div>
          {verifyMessage && <p className="text-sm text-amber-800 mt-3">{verifyMessage}</p>}
          {verifyLink && (
            <p className="text-sm text-amber-900 mt-3 break-all">
              Verification link:{" "}
              <a href={verifyLink} className="text-indigo-700 underline font-medium">
                {verifyLink}
              </a>
            </p>
          )}
        </section>
      )}

      {canManageOrg && show("licences") && (
      <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        {billingUi ? (
          <div className="mb-4">
            <LicencesPanel
              rows={roster.rows}
              error={roster.error}
              summary={licenceSummary}
              displayPlan={displayPlan}
              billingHref={billingHref}
              orgSlug={orgSlug}
              pendingInvites={(invites ?? []).filter((i) => i.status === "pending").length}
            />
            <div className="mt-6">
              {membersBlock}
            </div>
          </div>
        ) : (
        <>
        {membersBlock}
        </>
        )}

        <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Invite to org</h3>
            {!canInviteOrgMembers ? (
              <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
                <p>{inviteUpgradeMessage(plan)}</p>
                <Link
                  href={businessGetStartedHref({ org: orgSlug, from: "invite" })}
                  data-testid="invite-business-get-started"
                  className="inline-block mt-2 text-indigo-600 font-medium hover:text-indigo-700"
                >
                  Get started with Business →
                </Link>
              </div>
            ) : (
              <>
                {!emailVerified && (
                  <p className="text-sm text-amber-700 mb-3">
                    Verify your email above before inviting others.
                  </p>
                )}
                <div className="flex gap-2">
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="email@company.com"
                    className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="border border-gray-200 rounded-md px-2 py-2 text-sm"
                  >
                    <option value="member">
                      {billingUi ? "Member — no workspace access until added" : "Member — contributor license"}
                    </option>
                    <option value="admin">
                      {billingUi ? "Admin — uses a licence" : "Admin — contributor license"}
                    </option>
                  </select>
                  <button
                    onClick={() => inviteMutation.mutate()}
                    disabled={!inviteEmail || !emailVerified || inviteMutation.isPending}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50"
                  >
                    Invite
                  </button>
                </div>
                {inviteError && <p className="text-sm text-red-600 mt-2">{inviteError}</p>}
                {lastInviteUrl && (
                  <p className="text-xs text-gray-600 mt-2 break-all">
                    Invite link:{" "}
                    <a href={lastInviteUrl} className="text-indigo-600 underline">
                      {lastInviteUrl}
                    </a>
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  {billingUi
                    ? "Licences cover people who edit; viewers are free and unlimited. Give workspace access from each workspace's Members page."
                    : "Business plan: contributor licenses are capped; viewers are unlimited."}
                </p>
              </>
            )}
        </div>
      </section>
      )}

      {billingUi && canSeeBilling && show("billing") && (
        <BillingCentre
          orgSlug={orgSlug}
          displayPlan={displayPlan}
          realPlan={realPlan}
          previewing={!!preview}
          billingStatus={billingStatus}
          licences={licenceSummary}
          statusError={billingStatusError && !billingStatus}
          onRetryStatus={() => void refetchBillingStatus()}
          checkoutReturn={checkoutReturn}
          checkoutPhase={checkoutPhase}
          checkoutSessionId={checkoutSessionId}
          portalReturn={portalReturn}
          onCheckout={startCheckout}
          onOpenPortal={openBillingPortal}
        />
      )}

      {!billingUi && canManageBilling && (
        <PlanSection
          orgSlug={orgSlug}
          org={org}
          billingMessage={billingMessage}
          onClearBillingMessage={() => setBillingMessage(null)}
        />
      )}

      {canDeleteOrg && show("general") && (
        <section className="bg-white rounded-lg border border-red-100 p-6 mb-6">
          <h2 className="font-semibold text-red-900 mb-2">Danger zone</h2>
          <p className="text-sm text-gray-600 mb-4">
            Permanently delete this organization, all workspaces, and all repository data. You will
            be asked to create a new organization, like when you first signed up.
          </p>
          {deleteOrgError && (
            <p className="text-sm text-red-600 mb-3">{deleteOrgError}</p>
          )}
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="border border-red-300 text-red-700 hover:bg-red-50 px-4 py-2 rounded-md text-sm font-medium"
            >
              Delete organization
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="border border-gray-200 px-4 py-2 rounded-md text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteOrgMutation.mutate()}
                disabled={deleteOrgMutation.isPending}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {deleteOrgMutation.isPending ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          )}
        </section>
      )}

      {canManageOrg && show("licences") && (
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Pending invites</h2>
          <div className="divide-y divide-gray-100">
            {(invites ?? []).filter((i) => i.status === "pending").map((inv) => (
              <PendingInviteRow
                key={inv.id}
                invite={inv}
                onResend={async (id) => `${window.location.origin}${(await resendMutation.mutateAsync(id)).invite_url}`}
                onRevoke={(id) => revokeMutation.mutateAsync(id)}
              />
            ))}
            {(invites ?? []).filter((i) => i.status === "pending").length === 0 && (
              <p className="text-sm text-gray-400 py-2">No pending invites</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
