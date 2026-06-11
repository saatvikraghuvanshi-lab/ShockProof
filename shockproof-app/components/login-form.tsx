"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Fingerprint, LoaderCircle, Mail } from "lucide-react";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return new URLSearchParams(window.location.search).get("message") ?? "";
  });
  const [pendingAction, setPendingAction] = useState<
    "passkey" | "google" | "email" | null
  >(null);

  async function signInWithPasskey() {
    setStatus("");
    setPendingAction("passkey");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPasskey();

    setPendingAction(null);

    if (error) {
      setStatus(
        `${error.message}. If passkeys are not enabled in Supabase yet, use Google or email for now.`
      );
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function signInWithGoogle() {
    setStatus("");
    setPendingAction("google");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setPendingAction(null);
      setStatus(error.message);
    }
  }

  async function sendMagicLink() {
    setStatus("");
    setPendingAction("email");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    setPendingAction(null);

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Magic link sent. Open your email and continue from that link.");
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-white/10 bg-card/80 shadow-2xl backdrop-blur-xl">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl">
            Welcome back
          </CardTitle>
          <CardDescription>
            Sign in to check tariff risk and meter reading status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMagicLink();
            }}
          >
            <FieldGroup>
              <Field>
                <Button
                  type="button"
                  className="h-11"
                  disabled={pendingAction !== null}
                  onClick={() => void signInWithPasskey()}
                >
                  {pendingAction === "passkey" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Fingerprint className="size-4" />
                  )}
                  Continue with passkey
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  className="h-11"
                  disabled={pendingAction !== null}
                  onClick={() => void signInWithGoogle()}
                >
                  {pendingAction === "google" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Mail className="size-4" />
                  )}
                  Continue with Google
                </Button>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Fallback sign in
              </FieldSeparator>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <Button type="submit" disabled={pendingAction !== null}>
                  {pendingAction === "email" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  Send magic link
                </Button>
                {status ? (
                  <FieldDescription className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                    {status}
                  </FieldDescription>
                ) : null}
                <FieldDescription className="text-center">
                  New household? <Link href="/signup">Create setup</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        No passwords needed. ShockProof is designed for passkeys, Google, and
        low-friction household access.
      </FieldDescription>
    </div>
  );
}
