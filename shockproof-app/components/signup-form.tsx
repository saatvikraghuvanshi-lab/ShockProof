"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  billingCycleOptions,
  discomReferences,
  indianStatesAndUnionTerritories,
  suggestedDiscomsByState,
} from "@/lib/india-power-options";
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
  const router = useRouter();
  const [selectedState, setSelectedState] = useState("");
  const suggestedDiscoms = selectedState
    ? suggestedDiscomsByState[selectedState] ?? []
    : [];

  function completeSignup() {
    window.localStorage.setItem("shockproof-auth", "true");
    router.push("/dashboard");
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
              completeSignup();
            }}
          >
            <FieldGroup>
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
                <Button type="submit">Create setup</Button>
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
