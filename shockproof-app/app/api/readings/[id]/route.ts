import { NextResponse } from "next/server";

import {
  calculateProjection,
  type TariffSlab,
} from "@/lib/billing-projections";
import {
  type GeminiUsage,
  generateGeminiJsonWithUsage,
} from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ReadingSettings = {
  state?: string;
  discom?: string;
  billingCycleDay?: number | null;
  language?: string;
  useHinglish?: boolean;
  allowAdvice?: boolean;
};

type AdviceResult = {
  summary?: string;
  actions?: string[];
  risk_note?: string;
  assumptions?: string[];
};

const fallbackDomesticSlabs: TariffSlab[] = [
  { slab_start: 0, slab_end: 100, rate: 4.5, fixed_charge: 100 },
  { slab_start: 100, slab_end: 200, rate: 6, fixed_charge: 100 },
  { slab_start: 200, slab_end: 400, rate: 8, fixed_charge: 100 },
  { slab_start: 400, slab_end: null, rate: 10, fixed_charge: 100 },
];

function parseKwhInput(value: number | string | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  const match = String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function estimateCostUsd(model: string, usage: GeminiUsage) {
  const normalizedModel = model.toLowerCase();
  const rates = normalizedModel.includes("3.1-flash-lite")
    ? { input: 0.45, output: 1.5 }
    : { input: 0.1, output: 0.4 };

  return (
    (usage.promptTokenCount / 1_000_000) * rates.input +
    (usage.candidatesTokenCount / 1_000_000) * rates.output
  );
}

async function recordUsage({
  admin,
  userId,
  readingId,
  model,
  purpose,
  usage,
}: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  readingId: number;
  model: string;
  purpose: string;
  usage: GeminiUsage;
}) {
  try {
    await admin
      .from("ai_usage_events")
      .insert({
        user_id: userId,
        reading_id: readingId,
        provider: "gemini",
        model,
        purpose,
        prompt_tokens: usage.promptTokenCount,
        completion_tokens: usage.candidatesTokenCount,
        total_tokens: usage.totalTokenCount,
        estimated_cost_usd: estimateCostUsd(model, usage),
      })
      .throwOnError();
  } catch {
    // Usage tracking should not block manual correction.
  }
}

async function loadPreviousReading({
  admin,
  userId,
  readingId,
}: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  readingId: number;
}) {
  const { data } = await admin
    .from("meter_readings")
    .select("reading_kwh")
    .eq("user_id", userId)
    .eq("status", "processed")
    .not("reading_kwh", "is", null)
    .lt("id", readingId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.reading_kwh === null || data?.reading_kwh === undefined
    ? null
    : Number(data.reading_kwh);
}

async function loadTariffSlabs({
  admin,
  state,
  discom,
}: {
  admin: ReturnType<typeof createAdminClient>;
  state?: string;
  discom?: string;
}) {
  if (!state || !discom) {
    return { slabs: fallbackDomesticSlabs, source: "fallback" };
  }

  try {
    const { data, error } = await admin
      .from("tariff_slabs")
      .select("slab_start, slab_end, rate, fixed_charge")
      .eq("state", state)
      .eq("discom", discom)
      .eq("consumer_category", "domestic")
      .order("slab_start", { ascending: true });

    if (error || !data || data.length === 0) {
      return { slabs: fallbackDomesticSlabs, source: "fallback" };
    }

    return { slabs: data as TariffSlab[], source: "tariff_slabs" };
  } catch {
    return { slabs: fallbackDomesticSlabs, source: "fallback" };
  }
}

function getAdvicePrompt({
  projection,
  state,
  discom,
  language,
  useHinglish,
  tariffSource,
}: {
  projection: ReturnType<typeof calculateProjection>;
  state?: string;
  discom?: string;
  language?: string;
  useHinglish?: boolean;
  tariffSource: string;
}) {
  return [
    "Generate concise household electricity-saving advice for ShockProof.",
    "Return strict JSON only with summary, actions, risk_note, and assumptions.",
    "Keep actions practical and specific for a household.",
    "Do not invent tariff amounts. If slab data is fallback/estimated, say the advice is provisional.",
    `Language style: ${useHinglish ? "Hinglish" : language || "English"}.`,
    `State: ${state || "not selected"}. Discom: ${discom || "not selected"}. Tariff source: ${tariffSource}.`,
    `Current usage: ${projection.currentUsage} kWh.`,
    `Projected month-end usage: ${projection.projectedUnits} kWh.`,
    `Next slab at: ${projection.nextSlabAt ?? "none"} kWh.`,
    `Units to next slab: ${projection.unitsToNextSlab ?? "none"}.`,
    `Estimated bill: INR ${projection.estimatedBill}.`,
    `Risk: ${projection.billRisk}. Days elapsed: ${projection.daysElapsed}. Days left: ${projection.daysLeft}.`,
  ].join(" ");
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const readingId = Number(id);
  const body = (await request.json()) as {
    reading_kwh?: number | string;
    settings?: ReadingSettings;
  };
  const readingKwh = parseKwhInput(body.reading_kwh);

  if (!Number.isFinite(readingId) || readingKwh === null) {
    return NextResponse.json({ error: "Valid reading_kwh is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: reading, error: readingError } = await admin
    .from("meter_readings")
    .select("id, user_id")
    .eq("id", readingId)
    .single();

  if (readingError || !reading || reading.user_id !== user.id) {
    return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  }

  const previousReadingKwh = await loadPreviousReading({
    admin,
    userId: user.id,
    readingId,
  });
  const { slabs, source: tariffSource } = await loadTariffSlabs({
    admin,
    state: body.settings?.state,
    discom: body.settings?.discom,
  });
  const projection = calculateProjection({
    currentReadingKwh: Math.round(readingKwh),
    previousReadingKwh,
    capturedAt: new Date(),
    billingCycleDay: body.settings?.billingCycleDay ?? null,
    slabs,
  });
  let adviceJson: AdviceResult | null = null;

  if (body.settings?.allowAdvice !== false) {
    const adviceModel =
      process.env.GEMINI_ADVICE_MODEL ?? "gemini-3.1-flash-lite";
    const advice = await generateGeminiJsonWithUsage<AdviceResult>({
      model: adviceModel,
      parts: [
        {
          text: getAdvicePrompt({
            projection,
            state: body.settings?.state,
            discom: body.settings?.discom,
            language: body.settings?.language,
            useHinglish: body.settings?.useHinglish,
            tariffSource,
          }),
        },
      ],
    });
    adviceJson = advice.data;
    await recordUsage({
      admin,
      userId: user.id,
      readingId: reading.id,
      model: adviceModel,
      purpose: "manual_reading_advice",
      usage: advice.usage,
    });
  }

  const { error: updateError } = await admin
    .from("meter_readings")
    .update({
      reading_kwh: Math.round(readingKwh),
      confidence: 1,
      display_type: "kWh",
      processed_at: new Date().toISOString(),
      ai_notes: "Manually corrected by user.",
      current_usage: projection.currentUsage,
      projected_units: projection.projectedUnits,
      next_slab_at: projection.nextSlabAt,
      units_to_next_slab: projection.unitsToNextSlab,
      estimated_bill: projection.estimatedBill,
      estimated_delta: projection.estimatedDelta,
      bill_risk: projection.billRisk,
      advice_json: adviceJson
        ? {
            ...adviceJson,
            tariff_source: tariffSource,
            previous_reading_kwh: previousReadingKwh,
          }
        : null,
      error_message: null,
      status: "processed",
    })
    .eq("id", reading.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    reading_kwh: Math.round(readingKwh),
    projection,
    advice: adviceJson,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const readingId = Number(id);

  if (!Number.isFinite(readingId)) {
    return NextResponse.json({ error: "Invalid reading id." }, { status: 400 });
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: reading, error: readingError } = await admin
    .from("meter_readings")
    .select("id, user_id, storage_path")
    .eq("id", readingId)
    .single();

  if (readingError || !reading || reading.user_id !== user.id) {
    return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  }

  if (reading.storage_path) {
    await admin.storage.from("meter-captures").remove([reading.storage_path]);
  }

  try {
    await admin
      .from("ai_usage_events")
      .delete()
      .eq("reading_id", reading.id)
      .throwOnError();
  } catch {
    // Usage tracking may not be installed yet.
  }

  const { error: deleteError } = await admin
    .from("meter_readings")
    .delete()
    .eq("id", reading.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
