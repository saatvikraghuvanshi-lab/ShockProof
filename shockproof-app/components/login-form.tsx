"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fingerprint, Mail } from "lucide-react";

import { cn } from "@/lib/utils";
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

  function completeSignIn() {
    window.localStorage.setItem("shockproof-auth", "true");
    router.push("/dashboard");
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
              completeSignIn();
            }}
          >
            <FieldGroup>
              <Field>
                <Button type="button" className="h-11" onClick={completeSignIn}>
                  <Fingerprint className="size-4" />
                  Continue with passkey
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  className="h-11"
                  onClick={completeSignIn}
                >
                  <Mail className="size-4" />
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
                  required
                />
              </Field>
              <Field>
                <Button type="submit">Send magic link</Button>
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
