"use client";

import Link from "next/link";
import { useState } from "react";
import { LoaderCircle, Mail } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  billingCycleOptions,
  discomReferences,
  indianStatesAndUnionTerritories,
  suggestedDiscomsByState,
} from "@/lib/india-power-options";
import { createClient } from "@/lib/supabase/browser";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [status, setStatus] = useState("");
  const [pendingAction, setPendingAction] = useState<"google" | "email" | null>(
    null
  );
  const suggestedDiscoms = selectedState
    ? suggestedDiscomsByState[selectedState] ?? []
    : [];

  async function createSetupWithEmail() {
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

    setStatus(
      "Setup link sent. Open your email, then ShockProof will continue to the dashboard."
    );
  }

  async function continueWithGoogle() {
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

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-white/10 bg-card/80 shadow-2xl backdrop-blur-xl">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl">
            Create household setup
          </CardTitle>
          <CardDescription>
            Choose local tariff context before the first meter capture.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createSetupWithEmail();
            }}
          >
            <FieldGroup>
              <Field>
                <Button
                  variant="outline"
                  type="button"
                  className="h-11"
                  disabled={pendingAction !== null}
                  onClick={() => void continueWithGoogle()}
                >
                  {pendingAction === "google" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Mail className="size-4" />
                  )}
                  Continue with Google
                </Button>
              </Field>
              <Field>
                <FieldLabel htmlFor="name">Household name</FieldLabel>
                <Input id="name" type="text" placeholder="Home" required />
              </Field>
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
                <FieldLabel>State</FieldLabel>
                <Select value={selectedState} onValueChange={setSelectedState}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {indianStatesAndUnionTerritories.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Discom</FieldLabel>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Discom" />
                  </SelectTrigger>
                  <SelectContent>
                    {discomReferences.map((discom) => (
                      <SelectItem key={discom.value} value={discom.value}>
                        {discom.name} - {discom.region}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Pick the option that matches your electricity bill or service
                  area. This decides which tariff slab rules ShockProof uses.
                </FieldDescription>
                {suggestedDiscoms.length > 0 ? (
                  <div className="mt-3 rounded-xl border border-accent/30 bg-accent/10 p-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-accent">
                      Suggested for {selectedState}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedDiscoms.map((discom) => (
                        <Badge key={discom} variant="secondary">
                          {discom}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Field>
              <Field>
                <FieldLabel>Billing cycle</FieldLabel>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select billing cycle start" />
                  </SelectTrigger>
                  <SelectContent>
                    {billingCycleOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Choose Custom date if your bill cycle starts on another day.
                </FieldDescription>
              </Field>
              <Field>
                <Button type="submit" disabled={pendingAction !== null}>
                  {pendingAction === "email" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  Create setup with email
                </Button>
                {status ? (
                  <FieldDescription className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                    {status}
                  </FieldDescription>
                ) : null}
                <FieldDescription className="text-center">
                  Already set up? <Link href="/login">Sign in</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        You can update Discom and billing cycle later in Settings.
      </FieldDescription>
    </div>
  );
}
