"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Fingerprint,
  Gauge,
  ImageIcon,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Settings,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";

import {
  billingCycleOptions,
  discomReferences,
  indianStatesAndUnionTerritories,
  languageOptions,
  suggestedDiscomsByState,
} from "@/lib/india-power-options";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";
import type { ReadingStatus } from "@/lib/supabase/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const pipeline = ["Video upload", "Gemini OCR", "Postgres slabs", "AI advice"];

const appTabs = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { value: "capture", label: "Capture", icon: Camera },
  { value: "advice", label: "Advice", icon: Sparkles },
  { value: "settings", label: "Settings", icon: Settings },
] as const;

type AppTab = (typeof appTabs)[number]["value"];

type MeterReading = {
  id: number;
  status: ReadingStatus;
  image_url: string;
  storage_path: string | null;
  created_at: string;
};

const permissions = [
  ["Camera access", "Required for the 5-second smart meter capture flow."],
  ["Notifications", "Needed for slab-jump alerts before the bill shock happens."],
  ["Video upload", "Allows meter clips to be uploaded to secure storage for processing."],
  ["AI advice", "Lets ShockProof generate localized savings guidance from tariff math."],
];

export function DashboardShell() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [userId, setUserId] = useState("");
  const [latestReading, setLatestReading] = useState<MeterReading | null>(null);
  const [selectedState, setSelectedState] = useState("");
  const [captureFileName, setCaptureFileName] = useState("");
  const [captureStatus, setCaptureStatus] = useState("");
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [isUploadingCapture, setIsUploadingCapture] = useState(false);
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);
  const [passkeyStatus, setPasskeyStatus] = useState("");
  const suggestedDiscoms = selectedState
    ? suggestedDiscomsByState[selectedState] ?? []
    : [];

  const metrics = useMemo(
    () => [
      [
        "Current",
        "-- kWh",
        latestReading?.created_at
          ? `Uploaded ${new Date(latestReading.created_at).toLocaleDateString()}`
          : "Waiting for first meter read",
      ],
      [
        "Projected",
        "--",
        "Gemini OCR is next",
      ],
      [
        "Next slab",
        "--",
        "Projection starts after OCR",
      ],
      [
        "Status",
        latestReading?.status ?? "Ready",
        latestReading?.storage_path ?? "Start with meter capture",
      ],
    ],
    [latestReading]
  );

  const loadLatestReading = useCallback(async (currentUserId: string) => {
    const supabase = createClient();
    const { data: reading } = await supabase
      .from("meter_readings")
      .select("id, status, image_url, storage_path, created_at")
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setLatestReading((reading as MeterReading | null) ?? null);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      setUserId(session.user.id);
      await loadLatestReading(session.user.id);

      setIsCheckingAuth(false);
    }

    void checkSession();
  }, [loadLatestReading, router]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`dashboard-updates-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meter_readings",
          filter: `user_id=eq.${userId}`,
        },
        () => void loadLatestReading(userId)
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadLatestReading, userId]);

  async function signOut() {
    const supabase = createClient();

    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function registerPasskey() {
    setPasskeyStatus("");
    setIsPasskeyPending(true);

    const supabase = createClient();
    const { error } = await supabase.auth.registerPasskey();

    setIsPasskeyPending(false);

    if (error) {
      setPasskeyStatus(
        `${error.message}. Make sure passkeys are enabled in Supabase Auth and you are using localhost or HTTPS.`
      );
      return;
    }

    setPasskeyStatus(
      "Passkey added. Next time you can use Continue with passkey on the login screen."
    );
  }

  async function handleCaptureFile(file?: File) {
    if (!file) {
      return;
    }

    setCaptureFileName(file.name);
    setCaptureStatus("");

    if (!userId) {
      setCaptureStatus("Account session is still loading. Try again in a moment.");
      return;
    }

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setCaptureStatus("Choose an image or video meter capture.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setCaptureStatus("Use a file under 20 MB so Gemini can process it inline.");
      return;
    }

    setIsUploadingCapture(true);
    setCaptureStatus("Uploading capture...");

    const supabase = createClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const filePath = `${userId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("meter-captures")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      setCaptureStatus(uploadError.message);
      setIsUploadingCapture(false);
      return;
    }

    setCaptureStatus("Creating meter reading...");

    const {
      data: { publicUrl },
    } = supabase.storage.from("meter-captures").getPublicUrl(filePath);
    const { data: reading, error: readingError } = await supabase
      .from("meter_readings")
      .insert({
        image_url: publicUrl,
        storage_path: filePath,
        status: "uploaded",
        user_id: userId,
      })
      .select("id, status, image_url, storage_path, created_at")
      .single();

    if (readingError || !reading) {
      setCaptureStatus(readingError?.message ?? "Could not create reading.");
      setIsUploadingCapture(false);
      return;
    }

    setLatestReading(reading as MeterReading);

    setCaptureStatus("Uploaded. Extracting kWh with Gemini...");

    const processResponse = await fetch("/api/readings/process", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ readingId: reading.id }),
    });
    const processPayload = await processResponse.json();

    if (!processResponse.ok) {
      setCaptureStatus(processPayload.error ?? "Processing failed.");
      setIsUploadingCapture(false);
      return;
    }

    setCaptureStatus(
      processPayload.reading_kwh
        ? `Processed. Gemini read ${processPayload.reading_kwh} kWh.`
        : "Processed. Dashboard updated."
    );
    setIsUploadingCapture(false);
    await loadLatestReading(userId);
  }

  if (isCheckingAuth) {
    return (
      <main className="grid min-h-svh place-items-center px-6 text-center">
        <div>
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-white/10 text-white">
            <Image
              src="/shockproof-logo.png"
              alt=""
              width={48}
              height={48}
              className="size-12 rounded-full object-cover"
            />
          </div>
          <p className="text-2xl font-extrabold">Checking access</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Redirecting to sign in if this household is not authenticated.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-svh px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-7xl flex-col gap-4">
        <header className="flex items-center justify-between rounded-2xl border border-white/10 bg-card/70 px-4 py-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Image
              src="/shockproof-logo.png"
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-full object-cover"
              priority
            />
            <div>
              <p className="text-base font-extrabold leading-none">ShockProof</p>
              <p className="text-xs font-semibold text-muted-foreground">
                Smart Meter Tariff Guard
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 rounded-full text-muted-foreground hover:bg-white/10 hover:text-white"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </header>

        <section className="rounded-3xl border border-white/10 bg-background/55 p-3 shadow-2xl backdrop-blur-xl">
          <div className="w-full">
            <nav
              className="grid h-12 w-full grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-white/8 p-1"
              aria-label="Dashboard sections"
            >
              {appTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.value;

                return (
                  <button
                    key={tab.value}
                    type="button"
                    className={cn(
                      "flex h-10 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-xs font-bold transition-colors sm:text-sm",
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setActiveTab(tab.value)}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="hidden truncate sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {activeTab === "dashboard" ? (
            <section className="mt-3 space-y-3">
              <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
                <Card className="border-white/10 bg-card/70">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardDescription>Tariff guard</CardDescription>
                        <CardTitle className="text-2xl font-extrabold">
                          Bill trajectory
                        </CardTitle>
                      </div>
                      <Badge variant="secondary">
                        {latestReading?.status ?? "Not synced"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-[132px_1fr] sm:items-center">
                      <div className="grid size-32 place-items-center rounded-full border border-white/10 bg-white/5">
                        <div className="text-center">
                          <p className="text-3xl font-extrabold">
                            --
                          </p>
                          <p className="text-xs font-semibold text-muted-foreground">
                            to next slab
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-destructive">
                          {latestReading ? "Capture uploaded" : "Awaiting meter reading"}
                        </p>
                        <h2 className="text-2xl font-extrabold">
                          {latestReading ? "Ready for OCR" : "No reading yet"}
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {latestReading
                            ? "The capture is stored in Supabase. Gemini extraction is the next pipeline step."
                            : "Record a meter clip to calculate projected usage, slab threshold, and bill-risk trajectory."}
                        </p>
                      </div>
                    </div>
                    <Progress
                      value={
                        latestReading ? 35 : 0
                      }
                    />
                  </CardContent>
                </Card>

                <Alert className="border-accent/30 bg-accent/10">
                  <Gauge className="size-4" />
                  <AlertTitle>
                    {latestReading ? "Supabase upload ready" : "Ready for first capture"}
                  </AlertTitle>
                  <AlertDescription>
                    {latestReading?.storage_path ??
                      "Connect state, Discom, and billing cycle before generating slab-aware advice."}
                  </AlertDescription>
                </Alert>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map(([label, value, hint]) => (
                  <Card key={label} className="border-white/10 bg-card/70">
                    <CardHeader className="pb-2">
                      <CardDescription>{label}</CardDescription>
                      <CardTitle className="text-2xl font-extrabold">
                        {value}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs font-medium text-muted-foreground">
                        {hint}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
            ) : null}

            {activeTab === "capture" ? (
            <section className="mt-3">
              <Card className="border-white/10 bg-card/70">
                <CardHeader>
                  <CardDescription>Meter capture</CardDescription>
                  <CardTitle className="text-2xl font-extrabold">Add a meter reading</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid min-h-[300px] place-items-center rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_10%_8%,hsl(218_100%_56%/.6),transparent_32%),linear-gradient(135deg,#111827,#07101c)] p-8">
                    <div className="w-full max-w-sm rounded-2xl border-8 border-white/10 bg-background p-8 text-center shadow-2xl">
                      <p className="text-sm font-extrabold text-muted-foreground">
                        kWh
                      </p>
                      <p className="font-mono text-6xl font-bold tracking-tight">
                        -----
                      </p>
                      <p className="text-xs font-bold text-muted-foreground">
                        METER DISPLAY
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Button asChild className="h-12" disabled={isUploadingCapture}>
                      <label htmlFor="meter-photo-capture">
                        <Camera className="size-4" />
                        Take photo
                      </label>
                    </Button>
                    <Button
                      asChild
                      variant="secondary"
                      className="h-12"
                      disabled={isUploadingCapture}
                    >
                      <label htmlFor="meter-video-capture">
                        <Video className="size-4" />
                        Record video
                      </label>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="h-12"
                      disabled={isUploadingCapture}
                    >
                      <label htmlFor="meter-gallery-upload">
                        <Upload className="size-4" />
                        Upload gallery
                      </label>
                    </Button>
                  </div>
                  <input
                    id="meter-photo-capture"
                    className="hidden"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => void handleCaptureFile(event.target.files?.[0])}
                  />
                  <input
                    id="meter-video-capture"
                    className="hidden"
                    type="file"
                    accept="video/*"
                    capture="environment"
                    onChange={(event) => void handleCaptureFile(event.target.files?.[0])}
                  />
                  <input
                    id="meter-gallery-upload"
                    className="hidden"
                    type="file"
                    accept="image/*,video/*"
                    onChange={(event) => void handleCaptureFile(event.target.files?.[0])}
                  />
                  <Alert className="border-white/10 bg-white/5">
                    <ImageIcon className="size-4" />
                    <AlertTitle>
                      {isUploadingCapture
                        ? "Capture processing"
                        : captureFileName
                          ? "Latest capture"
                          : "Capture guidance"}
                    </AlertTitle>
                    <AlertDescription>
                      {captureStatus
                        ? `${captureFileName ? `${captureFileName}: ` : ""}${captureStatus}`
                        : captureFileName
                          ? `${captureFileName} is selected.`
                        : "Use photo for a clear kWh display, video when the meter cycles through screens, or gallery upload for an existing clip."}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </section>
            ) : null}

            {activeTab === "advice" ? (
            <section className="mt-3 space-y-3">
              <Card className="border-white/10 bg-card/70">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardDescription>Gemini advice</CardDescription>
                      <CardTitle className="text-2xl font-extrabold">
                        Savings plan
                      </CardTitle>
                    </div>
                    <Badge variant="secondary">
                      Pending
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <Sparkles className="mb-4 size-5 text-accent" />
                    <h3 className="text-xl font-extrabold">
                      No advice generated yet.
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Once a meter reading is processed, ShockProof will show clear household actions, projected savings, and slab-risk warnings here.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {[
                      "Advice will appear after Gemini OCR is connected",
                      "Savings actions will use selected Discom rules",
                      "Follow-up reminder will use the billing cycle date",
                    ].map((item) => (
                      <label
                        key={item}
                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-semibold text-muted-foreground"
                      >
                        <Checkbox disabled />
                        {item}
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-3 sm:grid-cols-4">
                {pipeline.map((step) => (
                  <Card key={step} className="border-white/10 bg-card/70">
                    <CardContent className="grid min-h-20 place-items-center p-4 text-center text-sm font-bold">
                      {step}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
            ) : null}

            {activeTab === "settings" ? (
            <section className="mt-3">
              <Card className="border-white/10 bg-card/70">
                <CardHeader>
                  <CardDescription>Account setup</CardDescription>
                  <CardTitle className="text-2xl font-extrabold">
                    Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-6">
                  <section className="grid gap-3">
                    <div>
                      <h3 className="text-xl font-bold">User info</h3>
                      <p className="text-sm text-muted-foreground">
                        Basic household details for account and bill context.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input placeholder="Full name" />
                      <Input placeholder="Phone number" />
                      <Input placeholder="Email address" type="email" />
                      <Input placeholder="Consumer / account number" />
                    </div>
                  </section>

                  <section className="grid gap-3">
                    <div>
                      <h3 className="text-xl font-bold">Tariff location</h3>
                      <p className="text-sm text-muted-foreground">
                        Select the state, Discom, and billing cycle printed on
                        the electricity bill.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Select value={selectedState} onValueChange={setSelectedState}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select state / UT" />
                        </SelectTrigger>
                        <SelectContent>
                          {indianStatesAndUnionTerritories.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

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

                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Billing cycle" />
                        </SelectTrigger>
                        <SelectContent>
                          {billingCycleOptions.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input placeholder="Custom cycle day" type="number" min={1} max={31} />
                    </div>
                    <Alert className="border-accent/30 bg-accent/10">
                      <Gauge className="size-4" />
                      <AlertTitle>
                        {suggestedDiscoms.length > 0
                          ? `Suggested for ${selectedState}`
                          : "Discom reference"}
                      </AlertTitle>
                      <AlertDescription>
                        {suggestedDiscoms.length > 0 ? (
                          <span className="mt-2 flex flex-wrap gap-2">
                            {suggestedDiscoms.map((discom) => (
                              <Badge key={discom} variant="secondary">
                                {discom}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          "BESCOM is for Bengaluru/Karnataka areas, MSEDCL covers most of Maharashtra, TANGEDCO/TNEB is for Tamil Nadu, and BSES/Tata Power-DDL options are for Delhi zones. Use the provider name printed on the bill when unsure."
                        )}
                      </AlertDescription>
                    </Alert>
                  </section>

                  <section className="grid gap-3">
                    <div>
                      <h3 className="text-xl font-bold">Language</h3>
                      <p className="text-sm text-muted-foreground">
                        Controls AI warning tone and household advice language.
                      </p>
                    </div>
                    <Select>
                      <SelectTrigger className="max-w-sm">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        {languageOptions.map((language) => (
                          <SelectItem key={language} value={language}>
                            {language}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </section>

                  <div className="grid gap-3">
                    {[
                      ["Slab jump alerts", "Notify before projected usage crosses a tariff threshold."],
                      ["Hinglish advice", "Use simple, household-friendly AI recommendations."],
                      ["Realtime dashboard", "Refresh when processing status completes."],
                    ].map(([title, description]) => (
                      <div
                        key={title}
                        className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4"
                      >
                        <div>
                          <p className="font-bold">{title}</p>
                          <p className="text-sm text-muted-foreground">
                            {description}
                          </p>
                        </div>
                        <Switch />
                      </div>
                    ))}
                  </div>

                  <section className="grid gap-3">
                    <div>
                      <h3 className="text-xl font-bold">Passkey access</h3>
                      <p className="text-sm text-muted-foreground">
                        Register this browser/device for fingerprint, Face ID,
                        Windows Hello, or device PIN sign-in.
                      </p>
                    </div>
                    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-bold">This device</p>
                        <p className="text-sm text-muted-foreground">
                          Works after the first Google or email sign-in.
                        </p>
                      </div>
                      <Button
                        type="button"
                        className="sm:w-auto"
                        disabled={isPasskeyPending}
                        onClick={() => void registerPasskey()}
                      >
                        {isPasskeyPending ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Fingerprint className="size-4" />
                        )}
                        Add passkey
                      </Button>
                    </div>
                    {passkeyStatus ? (
                      <Alert className="border-white/10 bg-white/5">
                        <Fingerprint className="size-4" />
                        <AlertTitle>Passkey status</AlertTitle>
                        <AlertDescription>{passkeyStatus}</AlertDescription>
                      </Alert>
                    ) : null}
                  </section>

                  <section className="grid gap-3">
                    <div>
                      <h3 className="text-xl font-bold">Permissions</h3>
                      <p className="text-sm text-muted-foreground">
                        These will connect to browser and Supabase permissions
                        during implementation.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      {permissions.map(([title, description]) => (
                        <div
                          key={title}
                          className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4"
                        >
                          <div>
                            <p className="font-bold">{title}</p>
                            <p className="text-sm text-muted-foreground">
                              {description}
                            </p>
                          </div>
                          <Switch />
                        </div>
                      ))}
                    </div>
                  </section>
                </CardContent>
              </Card>
            </section>
            ) : null}
          </div>
        </section>

        <footer className="mt-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 py-2 text-xs font-medium text-muted-foreground">
          <span>ShockProof prototype</span>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms & Conditions
          </Link>
        </footer>
      </div>
    </main>
  );
}
