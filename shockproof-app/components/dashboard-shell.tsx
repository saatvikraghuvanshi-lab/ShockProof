"use client";

import Link from "next/link";
import Image from "next/image";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Fingerprint,
  Gauge,
  History,
  ImageIcon,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  PencilLine,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const appTabs = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { value: "capture", label: "Capture", icon: Camera },
  { value: "advice", label: "Advice", icon: Sparkles },
  { value: "settings", label: "Settings", icon: Settings },
] as const;

type AppTab = (typeof appTabs)[number]["value"];

type ReadingId = number | string;

type MeterReading = {
  id: ReadingId;
  status: ReadingStatus;
  image_url: string;
  storage_path: string | null;
  reading_kwh: number | null;
  confidence: number | null;
  display_type: string | null;
  ai_notes: string | null;
  error_message: string | null;
  current_usage: number | null;
  projected_units: number | null;
  next_slab_at: number | null;
  units_to_next_slab: number | null;
  estimated_bill: number | null;
  estimated_delta: number | null;
  bill_risk: "low" | "medium" | "high" | null;
  advice_json: {
    summary?: string;
    actions?: string[];
    risk_note?: string;
    assumptions?: string[];
    tariff_source?: string;
    previous_reading_kwh?: number | null;
  } | null;
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

function formatKwhValue(value?: number | null) {
  return value === null || value === undefined
    ? "not available"
    : `${Math.round(value).toLocaleString("en-IN")} kWh`;
}

function buildAdviceMailDraft({
  reading,
  selectedState,
  selectedDiscom,
  selectedBillingCycle,
}: {
  reading: MeterReading | null;
  selectedState: string;
  selectedDiscom: string;
  selectedBillingCycle: string;
}) {
  if (!reading) {
    return "ShockProof report\n\nNo processed meter reading is available yet.";
  }

  const estimatedBill =
    reading.estimated_bill === null || reading.estimated_bill === undefined
      ? "not available"
      : new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 0,
        }).format(reading.estimated_bill);

  const lines = [
    "ShockProof meter report",
    "",
    `Reading: ${formatKwhValue(reading.reading_kwh)}`,
    `Current usage: ${formatKwhValue(reading.current_usage)}`,
    `Projected month-end usage: ${formatKwhValue(reading.projected_units)}`,
    `Units to next slab: ${formatKwhValue(reading.units_to_next_slab)}`,
    `Estimated bill risk: ${reading.bill_risk ?? "not available"}`,
    `Estimated bill: ${estimatedBill}`,
    `Tariff context: ${
      [selectedState, selectedDiscom, selectedBillingCycle]
        .filter(Boolean)
        .join(" / ") || "not set"
    }`,
  ];

  if (reading.advice_json?.summary) {
    lines.push("", "Gemini advice:", reading.advice_json.summary);
  }

  if (reading.advice_json?.risk_note) {
    lines.push("", "Risk note:", reading.advice_json.risk_note);
  }

  if (reading.advice_json?.actions?.length) {
    lines.push("", "Recommended actions:");
    reading.advice_json.actions.forEach((action, index) => {
      lines.push(`${index + 1}. ${action}`);
    });
  }

  return lines.join("\n");
}

function getBillingCycleDay(option: string, customDay: string) {
  if (option === "Custom date") {
    const parsed = Number(customDay);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 31) : null;
  }

  const match = option.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parseKwhInput(value: string) {
  const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isAmbiguousProcessedReading(reading?: MeterReading | null) {
  if (!reading || reading.status !== "processed" || !reading.reading_kwh) {
    return false;
  }

  if (reading.projected_units !== null || reading.advice_json?.summary) {
    return false;
  }

  if ((reading.confidence ?? 0) >= 0.75 && reading.reading_kwh >= 1000) {
    return false;
  }

  const reviewText = `${reading.ai_notes ?? ""} ${reading.display_type ?? ""}`.toLowerCase();

  return (
    (reading.confidence ?? 0) < 0.75 &&
    /\b(date|time|ambiguous|ambiguity|provisional|unclear|partial)\b/.test(
      reviewText
    )
  );
}

function SettingsSection({
  title,
  description,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible
      className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.03]"
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer list-none items-start justify-between gap-4 p-4 text-left">
        <div className="min-w-0">
          <h3 className="text-xl font-bold">{title}</h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
          {icon}
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid min-w-0 gap-3 px-4 pb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function DeleteReadingDialog({
  readingId,
  label,
  disabled,
  isDeleting,
  onDelete,
}: {
  readingId: ReadingId;
  label: string;
  disabled: boolean;
  isDeleting: boolean;
  onDelete: (readingId: ReadingId) => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-destructive"
          disabled={disabled}
        >
          {isDeleting ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this capture?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the saved reading and its uploaded meter media from
            ShockProof. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => onDelete(readingId)}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
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
  const [mailDraft, setMailDraft] = useState("");
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [isUploadingCapture, setIsUploadingCapture] = useState(false);
  const [deletingReadingId, setDeletingReadingId] = useState<ReadingId | null>(null);
  const [isConfirmingReading, setIsConfirmingReading] = useState(false);
  const [isEditingManualReading, setIsEditingManualReading] = useState(false);
  const [isSavingManualReading, setIsSavingManualReading] = useState(false);
  const [isPasskeyPending, setIsPasskeyPending] = useState(false);
  const [passkeyStatus, setPasskeyStatus] = useState("");
  const suggestedDiscoms = selectedState
    ? suggestedDiscomsByState[selectedState] ?? []
    : [];
  const latestReadingNeedsReview = isAmbiguousProcessedReading(latestReading);
  const hasCleanProcessedReading =
    latestReading?.status === "processed" &&
    !!latestReading.reading_kwh &&
    !latestReadingNeedsReview;
  const hasProjection =
    hasCleanProcessedReading && latestReading.projected_units !== null;
  const hasAdvice =
    hasProjection &&
    permissionPreferences.aiAdvice &&
    !!latestReading.advice_json?.summary;
  const latestReadingConfirmed = latestReading?.ai_notes
    ?.toLowerCase()
    .includes("confirmed by user");
  const latestMailDraft = useMemo(
    () =>
      buildAdviceMailDraft({
        reading: latestReading,
        selectedState,
        selectedDiscom,
        selectedBillingCycle,
      }),
    [latestReading, selectedBillingCycle, selectedDiscom, selectedState]
  );
  const mailBody = mailDraft.trim() ? mailDraft : latestMailDraft;
  const mailHref = `mailto:${settingsDraft.email}?subject=${encodeURIComponent(
    "ShockProof meter report"
  )}&body=${encodeURIComponent(mailBody)}`;

  const metrics = useMemo(
    () => [
      [
        "Current usage",
        hasCleanProcessedReading
          ? `${Math.round(latestReading.current_usage ?? latestReading.reading_kwh ?? 0)} kWh`
          : "-- kWh",
        hasCleanProcessedReading
          ? "usage since previous/baseline reading"
          : latestReading
            ? "Capture uploaded"
            : "Waiting for first meter read",
      ],
      [
        "Month-end projection",
        hasProjection ? `${Math.round(latestReading.projected_units ?? 0)} kWh` : "--",
        hasProjection
          ? "estimated by billing-cycle pace"
          : "needs OCR and tariff setup",
      ],
      [
        "Next slab",
        hasProjection && latestReading.units_to_next_slab !== null
          ? `${Math.round(latestReading.units_to_next_slab)} kWh`
          : "--",
        hasProjection
          ? latestReading.next_slab_at
            ? `threshold at ${Math.round(latestReading.next_slab_at)} kWh`
            : "already in final slab"
          : "needs tariff slabs",
      ],
      [
        "Estimated bill risk",
        hasProjection ? latestReading.bill_risk ?? "low" : "--",
        hasProjection
          ? latestReading.estimated_bill !== null
            ? `estimated bill INR ${Math.round(latestReading.estimated_bill).toLocaleString("en-IN")}`
            : "risk calculated from slab distance"
          : "needs OCR and tariff setup",
      ],
    ],
    [hasCleanProcessedReading, hasProjection, latestReading]
  );

  const loadLatestReading = useCallback(async (currentUserId: string) => {
    const supabase = createClient();
    const { data: readings } = await supabase
      .from("meter_readings")
      .select(
        "id, status, image_url, storage_path, reading_kwh, confidence, display_type, ai_notes, error_message, current_usage, projected_units, next_slab_at, units_to_next_slab, estimated_bill, estimated_delta, bill_risk, advice_json, created_at"
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

  async function deleteReading(readingId: ReadingId) {
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

  async function confirmReading(readingId: ReadingId) {
    if (!userId) {
      return;
    }

    setIsConfirmingReading(true);
    setCaptureStatus("");

    const response = await fetch(`/api/readings/${readingId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirm_reading: true }),
    });
    const payload = await response.json();

    setIsConfirmingReading(false);

    if (!response.ok) {
      setCaptureStatus(payload.error ?? "Could not confirm reading.");
      return;
    }

    setCaptureStatus("Reading confirmed.");
    setLatestReading((current) =>
      current?.id === readingId
        ? {
            ...current,
            ai_notes: current.ai_notes?.includes("Confirmed by user.")
              ? current.ai_notes
              : [current.ai_notes, "Confirmed by user."]
                  .filter(Boolean)
                  .join(" "),
          }
        : current
    );
    await loadLatestReading(userId);
  }

  async function saveManualReading(readingId: ReadingId) {
    if (!userId) {
      return;
    }

    const readingKwh = parseKwhInput(manualReading);

    if (readingKwh === null) {
      setCaptureStatus("Enter a valid kWh number, like 211008 or 211008 kWh.");
      return;
    }

    setIsSavingManualReading(true);

    const response = await fetch(`/api/readings/${readingId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reading_kwh: readingKwh,
        settings: {
          state: selectedState,
          discom: selectedDiscom,
          billingCycleDay: getBillingCycleDay(
            selectedBillingCycle,
            customCycleDay
          ),
          language: selectedLanguage,
          useHinglish: featurePreferences.hinglishAdvice,
          allowAdvice: permissionPreferences.aiAdvice,
        },
      }),
    });
    const payload = await response.json();

    setIsSavingManualReading(false);

    if (!response.ok) {
      setCaptureStatus(payload.error ?? "Could not save manual reading.");
      return;
    }

    setManualReading("");
    setIsEditingManualReading(false);
    setCaptureStatus(
      `Saved ${payload.reading_kwh} kWh manually${
        payload.advice ? " with projection + advice" : ""
      }.`
    );
    await loadLatestReading(userId);
  }

  async function handleCaptureFile(file?: File) {
    if (!file) {
      return;
    }

    setCaptureFileName(file.name);
    setCaptureStatus("");
    setIsEditingManualReading(false);

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
        "id, status, image_url, storage_path, reading_kwh, confidence, display_type, ai_notes, error_message, current_usage, projected_units, next_slab_at, units_to_next_slab, estimated_bill, estimated_delta, bill_risk, advice_json, created_at"
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
      body: JSON.stringify({
        readingId: reading.id,
        settings: {
          state: selectedState,
          discom: selectedDiscom,
          billingCycleDay: getBillingCycleDay(
            selectedBillingCycle,
            customCycleDay
          ),
          language: selectedLanguage,
          useHinglish: featurePreferences.hinglishAdvice,
          allowAdvice: permissionPreferences.aiAdvice,
        },
      }),
    });
    const processPayload = await processResponse.json();

    if (!processResponse.ok) {
      setCaptureStatus(processPayload.error ?? "Processing failed.");
      setIsUploadingCapture(false);
      return;
    }

    setCaptureStatus(
      processPayload.reading_kwh
        ? `Processed. Gemini read ${processPayload.reading_kwh} kWh and generated projection${processPayload.advice ? " + advice" : ""}.`
        : "Processed. Dashboard updated."
    );
    setLatestReading((current) => {
      if (!current || current.id !== reading.id) {
        return current;
      }

      return {
        ...current,
        status: "processed",
        reading_kwh: processPayload.reading_kwh ?? current.reading_kwh,
        confidence: processPayload.confidence ?? current.confidence,
        display_type: processPayload.display_type ?? current.display_type,
        ai_notes: processPayload.notes ?? current.ai_notes,
        error_message: null,
        current_usage:
          processPayload.projection?.currentUsage ?? current.current_usage,
        projected_units:
          processPayload.projection?.projectedUnits ?? current.projected_units,
        next_slab_at:
          processPayload.projection?.nextSlabAt ?? current.next_slab_at,
        units_to_next_slab:
          processPayload.projection?.unitsToNextSlab ?? current.units_to_next_slab,
        estimated_bill:
          processPayload.projection?.estimatedBill ?? current.estimated_bill,
        estimated_delta:
          processPayload.projection?.estimatedDelta ?? current.estimated_delta,
        bill_risk: processPayload.projection?.billRisk ?? current.bill_risk,
        advice_json: processPayload.advice
          ? {
              ...processPayload.advice,
              tariff_source:
                processPayload.tariff_source ??
                current.advice_json?.tariff_source,
              previous_reading_kwh:
                processPayload.previous_reading_kwh ??
                current.advice_json?.previous_reading_kwh,
            }
          : current.advice_json,
      };
    });
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
    <main className="min-h-svh overflow-x-hidden px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-7xl min-w-0 flex-col gap-4">
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
          <Menubar className="border-white/10 bg-white/5">
            <MenubarMenu>
              <MenubarTrigger className="gap-2 text-muted-foreground">
                <Settings className="size-4" />
                <span className="hidden sm:inline">Account</span>
              </MenubarTrigger>
              <MenubarContent align="end">
                <MenubarItem onSelect={() => setActiveTab("settings")}>
                  <Settings className="size-4" />
                  Settings
                </MenubarItem>
                <MenubarItem
                  variant="destructive"
                  onSelect={() => void signOut()}
                >
                  <LogOut className="size-4" />
                  Sign out
                </MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </header>

        <section className="rounded-3xl border border-white/10 bg-background/55 p-3 shadow-2xl backdrop-blur-xl">
          <div className="w-full">
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as AppTab)}
            >
            <TabsList
              className="grid h-12 w-full grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-white/8 p-1"
              aria-label="Dashboard sections"
            >
              {appTabs.map((tab) => {
                const Icon = tab.icon;

                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={cn(
                      "flex h-10 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-xs font-bold transition-colors sm:text-sm",
                      "data-active:bg-background data-active:text-foreground data-active:shadow-sm",
                      "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="hidden truncate sm:inline">{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            </Tabs>

            {activeTab === "dashboard" ? (
            <section className="mt-3 space-y-3">
              <div className="grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
                <Card
                  className={cn(
                    "border-white/10 bg-card/70",
                    hasCleanProcessedReading &&
                      "border-emerald-400/30 bg-emerald-950/20"
                  )}
                >
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
                        <p
                          className={cn(
                            "text-sm font-bold",
                            hasCleanProcessedReading
                              ? "text-emerald-300"
                              : latestReadingNeedsReview
                                ? "text-amber-300"
                                : "text-muted-foreground"
                          )}
                        >
                          {latestReadingNeedsReview
                            ? "OCR needs review"
                            : hasCleanProcessedReading
                              ? "Gemini OCR complete"
                              : latestReading
                                ? "Capture uploaded"
                                : "Awaiting meter reading"}
                        </p>
                        <h2 className="text-2xl font-extrabold">
                          {latestReadingNeedsReview
                            ? "Check the extracted value"
                            : hasCleanProcessedReading
                              ? `${Math.round(latestReading.reading_kwh ?? 0)} kWh extracted`
                              : latestReading
                                ? "Ready for OCR"
                                : "No reading yet"}
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {latestReadingNeedsReview
                            ? "Gemini's note suggests this may be a date/time-like value. Correct it manually before using projections."
                            : hasCleanProcessedReading
                              ? `${latestReading.display_type ?? "kWh"} display detected with ${Math.round(
                                  (latestReading.confidence ?? 0) * 100
                                )}% confidence. ${hasProjection ? "Projection and slab risk are calculated." : "Projection still needs tariff context."}`
                              : latestReading
                                ? "The capture is stored in Supabase. Gemini extraction is the next pipeline step."
                                : "Record a meter clip to calculate projected usage, slab threshold, and bill-risk trajectory."}
                        </p>
                      </div>
                    </div>
                    <Progress
                      value={
                        hasAdvice
                          ? 100
                          : hasProjection
                            ? 85
                            : hasCleanProcessedReading
                              ? 65
                              : latestReading
                                ? 35
                                : 0
                      }
                    />
                  </CardContent>
                </Card>

                <Alert
                  className={cn(
                    "border-accent/30 bg-accent/10",
                    hasCleanProcessedReading &&
                      "border-emerald-400/40 bg-emerald-950/20 text-emerald-50"
                  )}
                >
                  <Gauge className="size-4" />
                  <AlertTitle>
                    {latestReadingNeedsReview
                      ? "OCR needs review"
                      : hasAdvice
                        ? "Projection and advice ready"
                        : hasCleanProcessedReading
                          ? "Gemini OCR saved"
                      : latestReading
                        ? "Supabase upload ready"
                        : "Ready for first capture"}
                  </AlertTitle>
                  <AlertDescription>
                    {latestReadingNeedsReview
                      ? "Gemini returned a date/time-like value. Save the correct kWh manually before using projection or advice."
                      : hasAdvice
                        ? latestReading.advice_json?.summary
                        : latestReading?.error_message ??
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
            <section className="mt-3 min-w-0">
              <Card className="min-w-0 border-white/10 bg-card/70">
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
                    <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="font-bold">
                          {hasCleanProcessedReading
                            ? `${Math.round(latestReading.reading_kwh ?? 0)} kWh detected`
                            : latestReading.status === "failed"
                              ? "OCR needs correction"
                              : "Capture saved"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {latestReadingConfirmed
                            ? "You marked this reading as correct."
                            : hasCleanProcessedReading
                              ? "Confirm it, edit it if Gemini misread the display, or delete the capture."
                              : "Edit the reading manually if OCR cannot finish."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {hasCleanProcessedReading ? (
                          <Button
                            type="button"
                            size="sm"
                            className="gap-2"
                            disabled={isConfirmingReading || latestReadingConfirmed}
                            onClick={() => void confirmReading(latestReading.id)}
                          >
                            {isConfirmingReading ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-4" />
                            )}
                            {latestReadingConfirmed ? "Confirmed" : "Looks correct"}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="gap-2"
                          onClick={() => setIsEditingManualReading((value) => !value)}
                        >
                          <PencilLine className="size-4" />
                          Edit reading
                        </Button>
                        <DeleteReadingDialog
                          readingId={latestReading.id}
                          label="Delete capture"
                          disabled={deletingReadingId === latestReading.id}
                          isDeleting={deletingReadingId === latestReading.id}
                          onDelete={(readingId) => void deleteReading(readingId)}
                        />
                      </div>
                    </div>
                  ) : null}
                  {latestReading ? (
                    <Collapsible
                      className={cn(
                        "rounded-xl border border-white/10 bg-white/5 p-4",
                        (latestReadingNeedsReview ||
                          latestReading.status === "failed") &&
                          "border-amber-400/30 bg-amber-950/20"
                      )}
                      open={
                        isEditingManualReading ||
                        latestReadingNeedsReview ||
                        latestReading.status === "failed"
                      }
                      onOpenChange={setIsEditingManualReading}
                    >
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left text-sm font-bold">
                        <span>Manual correction fallback</span>
                        <ChevronDown
                          className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            (isEditingManualReading ||
                              latestReadingNeedsReview ||
                              latestReading.status === "failed") &&
                              "rotate-180"
                          )}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                      <p className="mt-2 text-xs font-medium text-muted-foreground">
                        Use this only when OCR is unsure, the meter screen is blurred, or the value needs correction.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
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
                          Save correction
                        </Button>
                      </div>
                      </CollapsibleContent>
                    </Collapsible>
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
                      {hasAdvice
                        ? "Ready"
                        : permissionPreferences.aiAdvice
                          ? "Pending"
                          : "Disabled"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    className={cn(
                      "rounded-2xl border border-white/10 bg-white/5 p-5",
                      hasAdvice && "border-emerald-400/30 bg-emerald-950/20"
                    )}
                  >
                    <Sparkles className="mb-4 size-5 text-accent" />
                    <h3 className="text-xl font-extrabold">
                      {hasAdvice
                        ? latestReading.advice_json?.summary
                        : permissionPreferences.aiAdvice
                          ? "No advice generated yet."
                          : "AI advice is disabled."}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {hasAdvice
                        ? latestReading.advice_json?.risk_note ??
                          "Advice is based on the latest processed reading and projection."
                        : permissionPreferences.aiAdvice
                          ? hasCleanProcessedReading
                            ? "This reading was processed before advice generation existed, or tariff settings were missing. Upload again or save a manual correction to generate advice."
                            : "Once a meter reading is processed, ShockProof will show clear household actions, projected savings, and slab-risk warnings here."
                          : "Turn AI advice back on in Settings before generating household recommendations."}
                    </p>
                  </div>
                  {hasAdvice ? (
                    <div className="grid gap-3">
                      {(latestReading.advice_json?.actions ?? []).map((action) => (
                        <label
                          key={action}
                          className="flex min-w-0 items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-semibold text-muted-foreground"
                        >
                          <Checkbox checked disabled className="mt-0.5" />
                          <span className="break-words">{action}</span>
                        </label>
                      ))}
                      {latestReading.advice_json?.assumptions?.length ? (
                        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs font-medium text-muted-foreground">
                          Assumptions:{" "}
                          {latestReading.advice_json.assumptions.join("; ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-card/70">
                <CardHeader>
                  <CardDescription>Share report</CardDescription>
                  <CardTitle className="text-xl font-extrabold">
                    Mail-ready summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Textarea
                    rows={8}
                    value={mailDraft}
                    placeholder={latestMailDraft}
                    onChange={(event) => setMailDraft(event.target.value)}
                    className="min-h-40 resize-y"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      Edit this before sending. If left blank, ShockProof uses
                      the latest generated report.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setMailDraft(latestMailDraft)}
                      >
                        Use latest report
                      </Button>
                      {latestReading ? (
                        <Button asChild>
                          <a href={mailHref}>Open email draft</a>
                        </Button>
                      ) : (
                        <Button type="button" disabled>
                          Open email draft
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid min-w-0 gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(4,minmax(0,1fr))]">
                {[
                  [
                    "Video upload",
                    latestReading ? "Saved" : "Waiting",
                    latestReading?.storage_path ?? "Upload a capture first.",
                    !!latestReading,
                  ],
                  [
                    "Gemini OCR",
                    latestReadingNeedsReview
                      ? "Review"
                      : hasCleanProcessedReading
                        ? "Done"
                        : latestReading?.status ?? "Waiting",
                    latestReadingNeedsReview
                      ? "OCR looked date-like; correct it before projecting."
                      : hasCleanProcessedReading
                        ? `${Math.round(latestReading.reading_kwh ?? 0)} kWh extracted.`
                        : "Extracts the meter display from the capture.",
                    hasCleanProcessedReading,
                  ],
                  [
                    "Postgres slabs",
                    hasProjection
                      ? latestReading.advice_json?.tariff_source === "fallback"
                        ? "Fallback"
                        : "Calculated"
                      : "Waiting",
                    hasProjection
                      ? `${Math.round(latestReading.projected_units ?? 0)} kWh projected, ${latestReading.bill_risk ?? "low"} risk${
                          latestReading.advice_json?.tariff_source === "fallback"
                            ? " using fallback slabs."
                            : "."
                        }`
                      : "Calculates current usage, projected usage, next slab, and bill risk.",
                    hasProjection,
                  ],
                  [
                    "AI advice",
                    hasAdvice
                      ? "Ready"
                      : permissionPreferences.aiAdvice
                        ? "Waiting"
                        : "Disabled",
                    hasAdvice
                      ? latestReading.advice_json?.summary ?? "Advice generated."
                      : "Generated after OCR and projection complete.",
                    hasAdvice,
                  ],
                ].map(([step, status, detail, done]) => (
                  <Card
                    key={String(step)}
                    className={cn(
                      "min-w-0 border-white/10 bg-card/70",
                      done && "border-emerald-400/30 bg-emerald-950/20"
                    )}
                  >
                    <CardContent className="grid min-h-24 content-center gap-2 p-4 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold">{step}</p>
                        <Badge variant="secondary">{status}</Badge>
                      </div>
                      <p className="break-words text-xs font-medium text-muted-foreground">
                        {detail}
                      </p>
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
                <CardContent className="grid min-w-0 gap-6">
                  <SettingsSection
                    title="Model usage"
                    description="App-tracked Gemini calls and estimated spend."
                    icon={<Cpu className="size-5" />}
                  >
                    <div className="grid min-w-0 gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(4,minmax(0,1fr))]">
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
                          className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4"
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
                            className="flex min-w-0 flex-col gap-1 rounded-xl border border-white/10 bg-white/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="font-bold">{event.model}</p>
                              <p className="break-words text-muted-foreground">
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
                  </SettingsSection>

                  <SettingsSection
                    title="Reading history"
                    description="Uploaded captures, OCR results, manual corrections, and failed attempts."
                    icon={<History className="size-5" />}
                  >
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
                            <DeleteReadingDialog
                              readingId={reading.id}
                              label="Delete"
                              disabled={deletingReadingId === reading.id}
                              isDeleting={deletingReadingId === reading.id}
                              onDelete={(readingId) => void deleteReading(readingId)}
                            />
                          </div>
                        ))
                      ) : (
                        <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-medium text-muted-foreground">
                          No saved readings yet.
                        </p>
                      )}
                    </div>
                  </SettingsSection>

                  <SettingsSection
                    title="User info"
                    description="Basic household details for account and bill context."
                  >
                    <div className="grid min-w-0 gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
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
                  </SettingsSection>

                  <SettingsSection
                    title="Tariff location"
                    description="Select the state, Discom, and billing cycle printed on the electricity bill."
                  >
                    <div className="grid min-w-0 gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(4,minmax(0,1fr))]">
                      <Select value={selectedState} onValueChange={setSelectedState}>
                        <SelectTrigger className="w-full min-w-0">
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
                        <SelectTrigger className="w-full min-w-0">
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
                        <SelectTrigger className="w-full min-w-0">
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
                    <Alert className="min-w-0 overflow-hidden border-accent/30 bg-accent/10 [&>*]:min-w-0">
                      <Gauge className="size-4" />
                      <AlertTitle>
                        {suggestedDiscoms.length > 0
                          ? `Suggested for ${selectedState}`
                          : "Discom reference"}
                      </AlertTitle>
                      <AlertDescription className="min-w-0 break-words text-wrap [overflow-wrap:anywhere]">
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
                  </SettingsSection>

                  <SettingsSection
                    title="Language"
                    description="Controls AI warning tone and household advice language."
                  >
                    <Select
                      value={selectedLanguage}
                      onValueChange={setSelectedLanguage}
                    >
                      <SelectTrigger className="w-full max-w-sm min-w-0">
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
                  </SettingsSection>

                  <SettingsSection
                    title="First-time guide"
                    description="Set up the tariff context first, then add secure device access after the account is working."
                  >
                    <Accordion type="single" collapsible className="grid gap-2">
                      {[
                        [
                          "1. Match your electricity bill",
                          "Select the state, Discom, billing cycle, and language used at home. This is what later projections and slab warnings will use.",
                        ],
                        [
                          "2. Capture the meter display",
                          "Use a sharp photo when the kWh display is visible. Use video only when the meter cycles between screens.",
                        ],
                        [
                          "3. Review OCR before trusting it",
                          "If Gemini is unsure or mistakes a date for a reading, save the correct kWh manually from the Capture tab.",
                        ],
                        [
                          "4. Watch slab risk and advice",
                          "Once readings and tariff rules are connected, ShockProof can compare current usage with the billing cycle and warn before slab jumps.",
                        ],
                      ].map(([title, copy]) => (
                        <AccordionItem
                          key={title}
                          value={title}
                          className="rounded-xl border border-white/10 bg-white/5 px-4"
                        >
                          <AccordionTrigger className="text-left font-bold">
                            {title}
                          </AccordionTrigger>
                          <AccordionContent className="text-sm text-muted-foreground">
                            {copy}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                    <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="font-bold">Passkeys by device</p>
                      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
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
                          <div key={device} className="min-w-0">
                            <p className="text-sm font-bold">{device}</p>
                            <p className="break-words text-sm text-muted-foreground">
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
                  </SettingsSection>

                  <SettingsSection
                    title="Feature switches"
                    description="Controls alerts, advice language, and realtime refresh behavior."
                  >
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
                  </SettingsSection>

                  <SettingsSection
                    title="Passkey access"
                    description="Register this browser/device for fingerprint, Face ID, Windows Hello, or device PIN sign-in."
                  >
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
                  </SettingsSection>

                  <SettingsSection
                    title="Permissions"
                    description="Camera and notifications request browser permission; uploads and AI advice are app consent controls."
                  >
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
                  </SettingsSection>
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
