"use client";



import { use } from "react";

import { useQuery } from "@tanstack/react-query";

import { sharesApi } from "@/lib/api-client";

import { ShareSessionProvider } from "@/lib/share-context";

import { ShareContent } from "@/components/share/ShareContent";

import { ShareFooterCta, ShareTopNav } from "@/components/share/SharePageChrome";



export default function SharePage({ params }: { params: Promise<{ token: string }> }) {

  const { token } = use(params);



  const { data: preview, isLoading, isError } = useQuery({

    queryKey: ["share", token],

    queryFn: () => sharesApi.preview(token),

  });



  if (isLoading) {

    return (

      <div className="min-h-screen flex flex-col bg-gray-50">

        <div className="h-12 bg-[#0f172a]" />

        <div className="flex-1 flex items-center justify-center">

          <p className="text-sm text-gray-500">Loading shared view…</p>

        </div>

      </div>

    );

  }



  if (isError || !preview) {

    return (

      <div className="min-h-screen flex flex-col bg-gray-50">

        <div className="h-12 bg-[#0f172a]" />

        <div className="flex-1 flex items-center justify-center px-4">

          <div className="text-center max-w-md">

            <h1 className="text-lg font-semibold text-gray-900 mb-2">Link not found</h1>

            <p className="text-sm text-gray-500">This share link may have been removed or is invalid.</p>

          </div>

        </div>

      </div>

    );

  }



  if (preview.revoked || preview.expired) {

    return (

      <div className="min-h-screen flex flex-col bg-gray-50">

        <div className="h-12 bg-[#0f172a]" />

        <div className="flex-1 flex items-center justify-center px-4">

          <div className="text-center max-w-md">

            <h1 className="text-lg font-semibold text-gray-900 mb-2">Link unavailable</h1>

            <p className="text-sm text-gray-500">

              {preview.revoked

                ? "This share link has been revoked."

                : "This share link has expired. Ask the owner for a new link."}

            </p>

          </div>

        </div>

      </div>

    );

  }



  return (

    <ShareSessionProvider

      session={{

        token,

        orgSlug: preview.org_slug,

        workspaceSlug: preview.workspace_slug,

        orgName: preview.org_name,

        workspaceName: preview.workspace_name,

        sharedByName: preview.shared_by_name,

      }}

    >

      <div className="min-h-screen bg-gray-50 flex flex-col">

        <ShareTopNav preview={preview} />

        <main className="flex-1">

          <ShareContent preview={preview} />

        </main>

        <footer className="mt-auto border-t border-gray-200 bg-gray-50">

          <ShareFooterCta />

        </footer>

      </div>

    </ShareSessionProvider>

  );

}


