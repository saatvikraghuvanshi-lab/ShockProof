"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Cpu,
  Fingerprint,
  Gauge,
  History,
  ImageIcon,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Settings,
  Sparkles,
  Trash2,
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
  reading_kwh: number | null;
  confidence: number | null;
  display_type: string | null;
  ai_notes: string | null;
  error_message: string | null;
  created_at?: string | null;
};

type UsageEvent = {
  id: number;
  model: string;
  purpose: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  created_at: string;
};

type UsageSummary = {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  recentEvents: UsageEvent[];
};

const featureLabels = {
  slabJumpAlerts: [
    "Slab jump alerts",
    "Notify before projected usage crosses a tariff threshold.",
  ],
  hinglishAdvice: [
    "Hinglish advice",
    "Use simple, household-friendly AI recommendations.",
  ],
  realtimeDashboard: [
    "Realtime dashboard",
    "Refresh when processing status completes.",
  ],
} as const;

const permissionLabels = {
  cameraAccess: [
    "Camera access",
    "Required for the 5-second smart meter capture flow.",
  ],
  notifications: [
    "Notifications",
    "Needed for slab-jump alerts before the bill shock happens.",
  ],
  videoUpload: [
    "Video upload",
    "Allows meter clips to be uploaded to secure storage for processing.",
  ],
  aiAdvice: [
    "AI advice",
    "Lets ShockProof generate localized savings guidance from tariff math.",
  ],
} as const;

const defaultSettingsDraft = {
  fullName: "",
  phone: "",
  email: "",
  consumerNumber: "",
};

type StoredSettings = {
  selectedState: string;
  selectedDiscom: string;
  selectedBillingCycle: string;
  customCycleDay: string;
  selectedLanguage: string;
  settingsDraft: typeof defaultSettingsDraft;
  featurePreferences: FeaturePreferences;
  permissionPreferences: PermissionPreferences;
};

type FeaturePreferences = {
  slabJumpAlerts: boolean;
  hinglishAdvice: boolean;
  realtimeDashboard: boolean;
};

type PermissionPreferences = {
  cameraAccess: boolean;
  notifications: boolean;
  videoUpload: boolean;
  aiAdvice: boolean;
};

type PermissionStatuses = Partial<Record<keyof PermissionPreferences, string>>;

const defaultFeaturePreferences: FeaturePreferences = {
  slabJumpAlerts: false,
  hinglishAdvice: false,
  realtimeDashboard: true,
};

const defaultPermissionPreferences: PermissionPreferences = {
  cameraAccess: false,
  notifications: false,
  videoUpload: true,
  aiAdvice: true,
};

const estimatedUsdToInrRate = 95.42;

const defaultStoredSettings: StoredSettings = {
  selectedState: "",
  selectedDiscom: "",
  selectedBillingCycle: "",
  customCycleDay: "",
  selectedLanguage: "",
  settingsDraft: defaultSettingsDraft,
  featurePreferences: defaultFeaturePreferences,
  permissionPreferences: defaultPermissionPreferences,
};

function readStoredSettings(): StoredSettings {
  if (typeof window === "undefined") {
    return defaultStoredSettings;
  }

  const storedSettings = window.localStorage.getItem("shockproof-settings");

  if (!storedSettings) {
    return defaultStoredSettings;
  }

  try {
    const parsed = JSON.parse(storedSettings) as Partial<StoredSettings>;

    return {
      selectedState: parsed.selectedState ?? "",
      selectedDiscom: parsed.selectedDiscom ?? "",
      selectedBillingCycle: parsed.selectedBillingCycle ?? "",
      customCycleDay: parsed.customCycleDay ?? "",
      selectedLanguage: parsed.selectedLanguage ?? "",
      settingsDraft: {
        ...defaultSettingsDraft,
        ...parsed.settingsDraft,
      },
      featurePreferences: {
        ...defaultFeaturePreferences,
        ...parsed.featurePreferences,
      },
      permissionPreferences: {
        ...defaultPermissionPreferences,
        ...parsed.permissionPreferences,
      },
    };
  } catch {
    window.localStorage.removeItem("shockproof-settings");
    return defaultStoredSettings;
  }
}

function formatReadingDate(value?: string | null) {
  if (!value) {
    return "Just now";
  }

  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRupeeCost(valueUsd: number) {
  const valueInr = valueUsd * estimatedUsdToInrRate;

  if (valueInr > 0 && valueInr < 0.01) {
    return `₹${valueInr.toFixed(4)}`;
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: valueInr >= 1 ? 2 : 4,
  }).format(valueInr);
}

export function DashboardShell() {
  const router = useRouter();
  const initialSettings = useMemo(() => readStoredSettings(), []);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [userId, setUserId] = useState("");
  const [latestReading, setLatestReading] = useState<MeterReading | null>(null);
  const [readingHistory, setReadingHistory] = useState<MeterReading[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary>({
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    recentEvents: [],
  });
  const [selectedState, setSelectedState] = useState(
    initialSettings.selectedState
  );
  const [selectedDiscom, setSelectedDiscom] = useState(
    initialSettings.selectedDiscom
  );
  const [selectedBillingCycle, setSelectedBillingCycle] = useState(
    initialSettings.selectedBillingCycle
  );
  const [customCycleDay, setCustomCycleDay] = useState(
    initialSettings.customCycleDay
  );
  const [selectedLanguage, setSelectedLanguage] = useState(
    initialSettings.selectedLanguage
  );
  const [settingsDraft, setSettingsDraft] = useState(
    initialSettings.settingsDraft
  );
  const [featurePreferences, setFeaturePreferences] = useState(
    initialSettings.featurePreferences
  );
  const [permissionPreferences, setPermissionPreferences] = useState(
    initialSettings.permissionPreferences
  );
  const [permissionStatuses, setPermissionStatuses] =
    useState<PermissionStatuses>({});
  const [captureFileName, setCaptureFileName] = useState("");
  const [captureStatus, setCaptureStatus] = useState("");
  const [manualReading, setManualReading] = useState("");
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [isUploadingCapture, setIsUploadingCapture] = useState(false);
  const [deletingReadingId, setDeletingReadingId] = useState<number | null>(null);
  const [isSavingManualReading, setIsSavingManualReading] = useState(false);
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);
  const [passkeyStatus, setPasskeyStatus] = useState("");
  const suggestedDiscoms = selectedState
    ? suggestedDiscomsByState[selectedState] ?? []
    : [];

  const metrics = useMemo(
    () => [
      [
        "Current",
        latestReading?.reading_kwh
          ? `${Math.round(latestReading.reading_kwh)} kWh`
          : "-- kWh",
        latestReading?.reading_kwh
          ? `${Math.round((latestReading.confidence ?? 0) * 100)}% OCR confidence`
          : latestReading
            ? "Capture uploaded"
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
        latestReading?.error_message ??
          latestReading?.ai_notes ??
          latestReading?.storage_path ??
          "Start with meter capture",
      ],
    ],
    [latestReading]
  );

  const loadLatestReading = useCallback(async (currentUserId: string) => {
    const supabase = createClient();
    const { data: readings } = await supabase
      .from("meter_readings")
      .select(
        "id, status, image_url, storage_path, reading_kwh, confidence, display_type, ai_notes, error_message, created_at"
      )
      .eq("user_id", currentUserId)
      .order("id", { ascending: false })
      .limit(10);
    const typedReadings = (readings as MeterReading[] | null) ?? [];
    const reading =
      typedReadings.find((item) => item.status === "processed" && item.reading_kwh) ??
      typedReadings[0] ??
      null;

    setReadingHistory(typedReadings);
    setLatestReading(reading);

    const { data: usageEvents } = await supabase
      .from("ai_usage_events")
      .select(
        "id, model, purpose, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, created_at"
      )
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(50);
    const typedEvents = (usageEvents as UsageEvent[] | null) ?? [];

    setUsageSummary({
      calls: typedEvents.length,
      promptTokens: typedEvents.reduce(
        (total, event) => total + (event.prompt_tokens ?? 0),
        0
      ),
      completionTokens: typedEvents.reduce(
        (total, event) => total + (event.completion_tokens ?? 0),
        0
      ),
      totalTokens: typedEvents.reduce(
        (total, event) => total + (event.total_tokens ?? 0),
        0
      ),
      estimatedCostUsd: typedEvents.reduce(
        (total, event) => total + (event.estimated_cost_usd ?? 0),
        0
      ),
      recentEvents: typedEvents.slice(0, 6),
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();

    async function checkSession() {
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error("Session check timed out.")),
            5000
          );
        }),
      ]).catch(() => null);
      const session = sessionResult?.data.session;

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
    window.localStorage.setItem(
      "shockproof-settings",
      JSON.stringify({
        selectedState,
        selectedDiscom,
        selectedBillingCycle,
        customCycleDay,
        selectedLanguage,
        settingsDraft,
        featurePreferences,
        permissionPreferences,
      })
    );
  }, [
    customCycleDay,
    featurePreferences,
    permissionPreferences,
    selectedBillingCycle,
    selectedDiscom,
    selectedLanguage,
    selectedState,
    settingsDraft,
  ]);

  useEffect(() => {
    if (!userId || !featurePreferences.realtimeDashboard) {
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
  }, [featurePreferences.realtimeDashboard, loadLatestReading, userId]);

  async function signOut() {
    const supabase = createClient();

    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function setFeaturePreference(
    key: keyof FeaturePreferences,
    checked: boolean
  ) {
    setFeaturePreferences((preferences) => ({
      ...preferences,
      [key]: checked,
    }));

    if (key === "hinglishAdvice" && checked) {
      setSelectedLanguage("Hinglish");
    }
  }

  function setPermissionPreference(
    key: keyof PermissionPreferences,
    checked: boolean
  ) {
    setPermissionPreferences((preferences) => ({
      ...preferences,
      [key]: checked,
    }));
  }

  function setPermissionStatus(
    key: keyof PermissionPreferences,
    message: string
  ) {
    setPermissionStatuses((statuses) => ({
      ...statuses,
      [key]: message,
    }));
  }

  async function toggleSlabAlerts(checked: boolean) {
    setFeaturePreference("slabJumpAlerts", checked);

    if (checked && !("Notification" in window)) {
      setFeaturePreference("slabJumpAlerts", false);
      setPermissionStatus(
        "notifications",
        "Notifications are not available in this browser, so slab alerts are off."
      );
      return;
    }

    if (checked) {
      const permission = await Notification.requestPermission();

      if (permission === "granted") {
        setPermissionPreference("notifications", true);
        setPermissionStatus("notifications", "Browser notifications enabled.");
        return;
      }

      setFeaturePreference("slabJumpAlerts", false);
      setPermissionPreference("notifications", false);
      setPermissionStatus(
        "notifications",
        "Notification permission was not granted, so slab alerts are off."
      );
    }
  }

  async function toggleCameraAccess(checked: boolean) {
    if (!checked) {
      setPermissionPreference("cameraAccess", false);
      setPermissionStatus("cameraAccess", "Camera capture disabled.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionStatus("cameraAccess", "Camera access is not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      stream.getTracks().forEach((track) => track.stop());
      setPermissionPreference("cameraAccess", true);
      setPermissionStatus("cameraAccess", "Camera permission granted.");
    } catch {
      setPermissionPreference("cameraAccess", false);
      setPermissionStatus("cameraAccess", "Camera permission was blocked or cancelled.");
    }
  }

  async function toggleNotifications(checked: boolean) {
    if (!checked) {
      setPermissionPreference("notifications", false);
      setFeaturePreference("slabJumpAlerts", false);
      setPermissionStatus("notifications", "Notifications disabled.");
      return;
    }

    if (!("Notification" in window)) {
      setPermissionStatus("notifications", "Notifications are not available in this browser.");
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      setPermissionPreference("notifications", true);
      setPermissionStatus("notifications", "Browser notifications enabled.");
      return;
    }

    setPermissionPreference("notifications", false);
    setPermissionStatus("notifications", "Notification permission was blocked or dismissed.");
  }

  function toggleVideoUpload(checked: boolean) {
    setPermissionPreference("videoUpload", checked);
    setPermissionStatus(
      "videoUpload",
      checked ? "Photo and video uploads enabled." : "Video uploads disabled; photos still work."
    );
  }

  function toggleAiAdvice(checked: boolean) {
    setPermissionPreference("aiAdvice", checked);
    setPermissionStatus(
      "aiAdvice",
      checked ? "AI advice generation enabled." : "AI advice generation disabled."
    );
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

  async function deleteReading(readingId: number) {
    if (!userId) {
      return;
    }

    setDeletingReadingId(readingId);
    setCaptureStatus("");

    const response = await fetch(`/api/readings/${readingId}`, {
      method: "DELETE",
    });
    const payload = await response.json();

    setDeletingReadingId(null);

    if (!response.ok) {
      setCaptureStatus(payload.error ?? "Could not delete reading.");
      return;
    }

    if (latestReading?.id === readingId) {
      setCaptureFileName("");
      setCaptureStatus("Reading deleted.");
    }

    await loadLatestReading(userId);
  }

  async function saveManualReading(readingId: number) {
    if (!userId) {
      return;
    }

    const readingKwh = Number(manualReading);

    if (!Number.isFinite(readingKwh) || readingKwh < 0) {
      setCaptureStatus("Enter a valid kWh number.");
      return;
    }

    setIsSavingManualReading(true);

    const response = await fetch(`/api/readings/${readingId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reading_kwh: readingKwh }),
    });
    const payload = await response.json();

    setIsSavingManualReading(false);

    if (!response.ok) {
      setCaptureStatus(payload.error ?? "Could not save manual reading.");
      return;
    }

    setManualReading("");
    setCaptureStatus(`Saved ${payload.reading_kwh} kWh manually.`);
    await loadLatestReading(userId);
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

    if (file.type.startsWith("video/") && !permissionPreferences.videoUpload) {
      setCaptureStatus("Video upload is disabled in Settings. Use a photo or turn video upload back on.");
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
      .select(
        "id, status, image_url, storage_path, reading_kwh, confidence, display_type, ai_notes, error_message"
      )
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
              src="/shockproof-mark.svg"
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
              src="/shockproof-mark.svg"
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
                          {latestReading?.reading_kwh
                            ? "Gemini OCR complete"
                            : latestReading
                              ? "Capture uploaded"
                              : "Awaiting meter reading"}
                        </p>
                        <h2 className="text-2xl font-extrabold">
                          {latestReading?.reading_kwh
                            ? `${Math.round(latestReading.reading_kwh)} kWh extracted`
                            : latestReading
                              ? "Ready for OCR"
                              : "No reading yet"}
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {latestReading?.reading_kwh
                            ? `${latestReading.display_type ?? "kWh"} display detected with ${Math.round(
                                (latestReading.confidence ?? 0) * 100
                              )}% confidence.`
                            : latestReading
                            ? "The capture is stored in Supabase. Gemini extraction is the next pipeline step."
                            : "Record a meter clip to calculate projected usage, slab threshold, and bill-risk trajectory."}
                        </p>
                      </div>
                    </div>
                    <Progress
                      value={
                        latestReading?.reading_kwh ? 65 : latestReading ? 35 : 0
                      }
                    />
                  </CardContent>
                </Card>

                <Alert className="border-accent/30 bg-accent/10">
                  <Gauge className="size-4" />
                  <AlertTitle>
                    {latestReading?.reading_kwh
                      ? "Gemini OCR saved"
                      : latestReading
                        ? "Supabase upload ready"
                        : "Ready for first capture"}
                  </AlertTitle>
                  <AlertDescription>
                    {latestReading?.error_message ??
                      latestReading?.ai_notes ??
                      latestReading?.storage_path ??
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
                    <Button
                      asChild
                      className="h-12"
                      disabled={isUploadingCapture || !permissionPreferences.cameraAccess}
                    >
                      <label
                        htmlFor={
                          permissionPreferences.cameraAccess
                            ? "meter-photo-capture"
                            : undefined
                        }
                      >
                        <Camera className="size-4" />
                        Take photo
                      </label>
                    </Button>
                    <Button
                      asChild
                      variant="secondary"
                      className="h-12"
                      disabled={isUploadingCapture || !permissionPreferences.videoUpload}
                    >
                      <label
                        htmlFor={
                          permissionPreferences.videoUpload
                            ? "meter-video-capture"
                            : undefined
                        }
                      >
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
                    disabled={!permissionPreferences.cameraAccess}
                    onChange={(event) => void handleCaptureFile(event.target.files?.[0])}
                  />
                  <input
                    id="meter-video-capture"
                    className="hidden"
                    type="file"
                    accept="video/*"
                    capture="environment"
                    disabled={!permissionPreferences.videoUpload}
                    onChange={(event) => void handleCaptureFile(event.target.files?.[0])}
                  />
                  <input
                    id="meter-gallery-upload"
                    className="hidden"
                    type="file"
                    accept={
                      permissionPreferences.videoUpload
                        ? "image/*,video/*"
                        : "image/*"
                    }
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
                        : permissionPreferences.cameraAccess
                          ? "Use photo for a clear kWh display, video when the meter cycles through screens, or gallery upload for an existing clip."
                          : "Enable camera access in Settings to use Take photo. Gallery upload still works for existing images."}
                    </AlertDescription>
                  </Alert>
                  {latestReading ? (
                    <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:grid-cols-[1fr_auto]">
                      <Input
                        inputMode="numeric"
                        placeholder="Correct kWh reading"
                        value={manualReading}
                        onChange={(event) => setManualReading(event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isSavingManualReading}
                        onClick={() => void saveManualReading(latestReading.id)}
                      >
                        {isSavingManualReading ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : null}
                        Save reading
                      </Button>
                    </div>
                  ) : null}
                  {latestReading ? (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={deletingReadingId === latestReading.id}
                        onClick={() => void deleteReading(latestReading.id)}
                      >
                        {deletingReadingId === latestReading.id ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                        Delete capture
                      </Button>
                    </div>
                  ) : null}
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
                      {permissionPreferences.aiAdvice ? "Pending" : "Disabled"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                    <Sparkles className="mb-4 size-5 text-accent" />
                    <h3 className="text-xl font-extrabold">
                      {permissionPreferences.aiAdvice
                        ? "No advice generated yet."
                        : "AI advice is disabled."}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {permissionPreferences.aiAdvice
                        ? "Once a meter reading is processed, ShockProof will show clear household actions, projected savings, and slab-risk warnings here."
                        : "Turn AI advice back on in Settings before generating household recommendations."}
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {[
                      permissionPreferences.aiAdvice
                        ? "Advice will appear after Gemini OCR is connected"
                        : "AI advice consent is currently off",
                      featurePreferences.hinglishAdvice
                        ? "Savings actions will use Hinglish wording"
                        : "Savings actions will use selected language",
                      "Follow-up reminder will use the billing cycle date",
                    ].map((item) => (
                      <label
                        key={item}
                        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-semibold text-muted-foreground"
                      >
                        <Checkbox
                          disabled
                          checked={
                            item === "AI advice consent is currently off" ||
                            item === "Savings actions will use Hinglish wording"
                          }
                        />
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
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold">Model usage</h3>
                        <p className="text-sm text-muted-foreground">
                          App-tracked Gemini calls and estimated spend.
                        </p>
                      </div>
                      <Cpu className="size-5 text-muted-foreground" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        ["Calls", usageSummary.calls.toString(), "Gemini requests"],
                        [
                          "Input",
                          usageSummary.promptTokens.toLocaleString(),
                          "prompt tokens",
                        ],
                        [
                          "Output",
                          usageSummary.completionTokens.toLocaleString(),
                          "response tokens",
                        ],
                        [
                          "Estimate",
                          formatRupeeCost(usageSummary.estimatedCostUsd),
                          `approx at ₹${estimatedUsdToInrRate}/USD`,
                        ],
                      ].map(([label, value, hint]) => (
                        <div
                          key={label}
                          className="rounded-xl border border-white/10 bg-white/5 p-4"
                        >
                          <p className="text-sm font-medium text-muted-foreground">
                            {label}
                          </p>
                          <p className="mt-2 text-2xl font-extrabold">
                            {value}
                          </p>
                          <p className="mt-1 text-xs font-medium text-muted-foreground">
                            {hint}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-2">
                      {usageSummary.recentEvents.length > 0 ? (
                        usageSummary.recentEvents.map((event) => (
                          <div
                            key={event.id}
                            className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <p className="font-bold">{event.model}</p>
                              <p className="text-muted-foreground">
                                {event.purpose} -{" "}
                                {(event.total_tokens ?? 0).toLocaleString()} tokens
                              </p>
                            </div>
                            <p className="font-bold">
                              {formatRupeeCost(event.estimated_cost_usd ?? 0)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-medium text-muted-foreground">
                          Usage appears here after OCR or advice calls.
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="grid gap-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-bold">Reading history</h3>
                        <p className="text-sm text-muted-foreground">
                          Uploaded captures, OCR results, manual corrections,
                          and failed attempts.
                        </p>
                      </div>
                      <History className="size-5 text-muted-foreground" />
                    </div>
                    <div className="grid gap-3">
                      {readingHistory.length > 0 ? (
                        readingHistory.map((reading) => (
                          <div
                            key={reading.id}
                            className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-bold">
                                  {reading.reading_kwh
                                    ? `${Math.round(reading.reading_kwh)} kWh`
                                    : "Pending OCR"}
                                </p>
                                <Badge variant="secondary">{reading.status}</Badge>
                              </div>
                              <p className="mt-1 truncate text-sm text-muted-foreground">
                                {formatReadingDate(reading.created_at)} -{" "}
                                {reading.ai_notes ??
                                  reading.error_message ??
                                  reading.storage_path}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="gap-2 text-muted-foreground hover:text-destructive sm:w-auto"
                              disabled={deletingReadingId === reading.id}
                              onClick={() => void deleteReading(reading.id)}
                            >
                              {deletingReadingId === reading.id ? (
                                <LoaderCircle className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                              Delete
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-medium text-muted-foreground">
                          No saved readings yet.
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="grid gap-3">
                    <div>
                      <h3 className="text-xl font-bold">User info</h3>
                      <p className="text-sm text-muted-foreground">
                        Basic household details for account and bill context.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        placeholder="Full name"
                        value={settingsDraft.fullName}
                        onChange={(event) =>
                          setSettingsDraft((draft) => ({
                            ...draft,
                            fullName: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Phone number"
                        value={settingsDraft.phone}
                        onChange={(event) =>
                          setSettingsDraft((draft) => ({
                            ...draft,
                            phone: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Email address"
                        type="email"
                        value={settingsDraft.email}
                        onChange={(event) =>
                          setSettingsDraft((draft) => ({
                            ...draft,
                            email: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Consumer / account number"
                        value={settingsDraft.consumerNumber}
                        onChange={(event) =>
                          setSettingsDraft((draft) => ({
                            ...draft,
                            consumerNumber: event.target.value,
                          }))
                        }
                      />
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

                      <Select value={selectedDiscom} onValueChange={setSelectedDiscom}>
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

                      <Select
                        value={selectedBillingCycle}
                        onValueChange={setSelectedBillingCycle}
                      >
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

                      <Input
                        placeholder="Custom cycle day"
                        type="number"
                        min={1}
                        max={31}
                        value={customCycleDay}
                        onChange={(event) => setCustomCycleDay(event.target.value)}
                      />
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
                            {suggestedDiscoms.map((discom) => {
                              const discomValue =
                                discomReferences.find(
                                  (reference) =>
                                    reference.value.toLowerCase() ===
                                      discom.toLowerCase() ||
                                    reference.name
                                      .toLowerCase()
                                      .includes(discom.toLowerCase())
                                )?.value ?? "";

                              return (
                                <button
                                  key={discom}
                                  type="button"
                                  disabled={!discomValue}
                                  className={cn(
                                    "rounded-full px-3 py-1 text-xs font-bold transition",
                                    selectedDiscom === discomValue
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                                    !discomValue && "cursor-not-allowed opacity-60"
                                  )}
                                  onClick={() => setSelectedDiscom(discomValue)}
                                >
                                  {discom}
                                </button>
                              );
                            })}
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
                    <Select
                      value={selectedLanguage}
                      onValueChange={setSelectedLanguage}
                    >
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

                  <section className="grid gap-3">
                    <div>
                      <h3 className="text-xl font-bold">First-time guide</h3>
                      <p className="text-sm text-muted-foreground">
                        Set up the tariff context first, then add secure device
                        access after the account is working.
                      </p>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="font-bold">1. Match your electricity bill</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Select the state, Discom, billing cycle, and language
                          used at home. This is what later projections and slab
                          warnings will use.
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="font-bold">2. Capture the meter display</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Use a sharp photo when the kWh display is visible.
                          Use video only when the meter cycles between screens.
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="font-bold">3. Review OCR before trusting it</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          If Gemini is unsure or mistakes a date for a reading,
                          save the correct kWh manually from the Capture tab.
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <p className="font-bold">4. Watch slab risk and advice</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Once readings and tariff rules are connected,
                          ShockProof can compare current usage with the billing
                          cycle and warn before slab jumps.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="font-bold">Passkeys by device</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {[
                          [
                            "Windows laptop",
                            "Use Windows Hello with fingerprint, face unlock, or device PIN.",
                          ],
                          [
                            "Android phone",
                            "Use screen lock, fingerprint, or face unlock from the signed-in browser.",
                          ],
                          [
                            "iPhone or iPad",
                            "Use Face ID, Touch ID, or device passcode. iCloud Keychain can sync it.",
                          ],
                          [
                            "Mac",
                            "Use Touch ID or the Mac password. iCloud Keychain can sync it.",
                          ],
                        ].map(([device, guidance]) => (
                          <div key={device}>
                            <p className="text-sm font-bold">{device}</p>
                            <p className="text-sm text-muted-foreground">
                              {guidance}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        Add the passkey from this signed-in browser. On the next
                        login, use Continue with passkey on the same device or a
                        synced device.
                      </p>
                    </div>
                  </section>

                  <div className="grid gap-3">
                    {(
                      Object.entries(featureLabels) as Array<
                        [keyof FeaturePreferences, readonly [string, string]]
                      >
                    ).map(([key, [title, description]]) => (
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
                        <Switch
                          checked={featurePreferences[key]}
                          onCheckedChange={(checked) => {
                            if (key === "slabJumpAlerts") {
                              void toggleSlabAlerts(checked);
                              return;
                            }

                            setFeaturePreference(key, checked);
                          }}
                        />
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
                        Camera and notifications request browser permission;
                        uploads and AI advice are app consent controls.
                      </p>
                    </div>
                    <div className="grid gap-3">
                      {(
                        Object.entries(permissionLabels) as Array<
                          [keyof PermissionPreferences, readonly [string, string]]
                        >
                      ).map(([key, [title, description]]) => (
                        <div
                          key={title}
                          className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4"
                        >
                          <div>
                            <p className="font-bold">{title}</p>
                            <p className="text-sm text-muted-foreground">
                              {description}
                            </p>
                            {permissionStatuses[key] ? (
                              <p className="mt-1 text-xs font-semibold text-accent">
                                {permissionStatuses[key]}
                              </p>
                            ) : null}
                          </div>
                          <Switch
                            checked={permissionPreferences[key]}
                            onCheckedChange={(checked) => {
                              if (key === "cameraAccess") {
                                void toggleCameraAccess(checked);
                                return;
                              }

                              if (key === "notifications") {
                                void toggleNotifications(checked);
                                return;
                              }

                              if (key === "videoUpload") {
                                toggleVideoUpload(checked);
                                return;
                              }

                              toggleAiAdvice(checked);
                            }}
                          />
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
