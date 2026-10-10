import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { LegalNotice } from "@/components/auth/LegalNotice";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 px-4">
      <Suspense fallback={<div className="text-white/60 text-sm">Loading...</div>}>
        <AuthForm mode="sign-in" />
      </Suspense>
      <LegalNotice />
    </div>
  );
}
