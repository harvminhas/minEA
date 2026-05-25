import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <Suspense fallback={<div className="text-white/60 text-sm">Loading...</div>}>
        <AuthForm mode="sign-up" />
      </Suspense>
    </div>
  );
}
