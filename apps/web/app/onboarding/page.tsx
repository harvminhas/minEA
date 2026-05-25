"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { orgsApi } from "@/lib/api-client";
import { primaryViewPath } from "@/lib/tenancy";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

export default function OnboardingPage() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return orgsApi.create(
        {
          name,
          slug: slug || slugify(name),
          workspace_name: "Default",
          workspace_slug: "default",
        },
        token!
      );
    },
    onSuccess: (org) => {
      router.replace(primaryViewPath(org.slug, "default"));
    },
  });

  return (
    <RequireAuth>
      <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md bg-white rounded-xl p-8 shadow-xl">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Create your organisation</h1>
        <p className="text-sm text-gray-500 mb-6">
          minEA is multi-tenant. Your org is the boundary for data, members, and billing.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Organisation name</label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Acme Corp"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">URL slug</label>
            <div className="flex items-center gap-1 text-sm text-gray-400 mb-1">
              <span>/orgs/</span>
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="acme-corp"
              />
            </div>
            <p className="text-xs text-gray-400">Lowercase letters, numbers, and hyphens only.</p>
          </div>
        </div>

        <button
          onClick={() => mutation.mutate()}
          disabled={!name.trim() || mutation.isPending}
          className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2.5 text-sm font-medium transition-colors"
        >
          {mutation.isPending ? "Creating..." : "Create organisation"}
        </button>

        {mutation.isError && (
          <p className="mt-3 text-xs text-red-600">{(mutation.error as Error).message}</p>
        )}
      </div>
      </div>
    </RequireAuth>
  );
}
