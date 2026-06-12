import { NextResponse } from "next/server";

import {
  type GeminiUsage,
  generateGeminiJsonWithUsage,
} from "@/lib/gemini";
import {
  calculateProjection,
  type TariffSlab,
} from "@/lib/billing-projections";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ProcessRequest = {
  readingId?: number;
  settings?: {
    state?: string;
    discom?: string;
    billingCycleDay?: number | null;
    language?: string;
    useHinglish?: boolean;
    allowAdvice?: boolean;
  };
};

type OcrResult = {
  reading_kwh?: number | string | null;
  display_number?: number | string | null;
  best_display_number?: number | string | null;
  raw_display_text?: string | null;
  value?: number | string | null;
  confidence?: number;
  display_type?: string;
  meter_type?: string;
  screen_label?: string | null;
  is_energy_register?: boolean;
  is_cumulative_total?: boolean;
  notes?: string;
  is_partial?: boolean;
  rejection_reason?: string | null;
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

function parseMeterReading(ocr: OcrResult, minimumDigits = 5) {
  if (ocr.is_energy_register === false) {
    return null;
  }

  const candidates = [
    ocr.reading_kwh,
    ocr.display_number,
    ocr.best_display_number,
    ocr.raw_display_text,
    ocr.value,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) {
      continue;
    }

    const text = String(candidate).trim();

    if (/[?x*_]/i.test(text)) {
      continue;
    }

    if (/\b\d{1,2}\s*[/-]\s*\d{1,2}(?:\s*[/-]\s*\d{2,4})?\b/.test(text)) {
      continue;
    }

    const normalized = text
      .replace(/,/g, "")
      .replace(/[^\d.]/g, "");

    if (normalized.replace(/\D/g, "").length < minimumDigits) {
      continue;
    }

    const parsed = Number(normalized);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }
  return null;
}

function isAmbiguousDateLikeReading(ocr: OcrResult, readingKwh: number) {
  const rawText = String(ocr.raw_display_text ?? "");
  const reviewText = [
    ocr.raw_display_text,
    ocr.display_type,
    ocr.screen_label,
    ocr.notes,
    ocr.rejection_reason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b\d{1,2}\s*[/-]\s*\d{1,2}(?:\s*[/-]\s*\d{2,4})?\b/.test(rawText)) {
    return true;
  }

  if (/\b(date-like|time-like|ambiguous|ambiguity|provisional|unclear|partial)\b/.test(reviewText)) {
    return true;
  }

  if (/\b(appears? to be|looks like|mimics|rather than)\b/.test(reviewText) && /\b(date|time)\b/.test(reviewText)) {
    return true;
  }

  return ocr.is_partial && readingKwh < 10000;
}

function getOcrPrompt({ retryValue }: { retryValue?: number | null } = {}) {
  return [
    "You are an OCR system for Indian electricity meters. Identify the meter display type first, then extract only the cumulative active energy reading in kWh.",
    "Supported Indian meter styles include: single-phase LCD static kWh meters, three-phase LCD meters, prepaid/keypad smart meters, DLMS/AMI smart meters, net meters with import/export screens, TOD/time-of-day meters, older electromechanical odometer meters, and video captures where the screen cycles through multiple pages.",
    "Target register priority: Total Import Active Energy kWh, Cumulative kWh, Imp kWh, Import kWh, T kWh, A+ kWh, 1.8.0, or total active energy. For net meters, prefer import kWh over export kWh unless import is not visible.",
    "Do not use instant load kW, voltage V, current A, power factor PF, frequency Hz, balance/credit, prepaid amount, relay status, meter number, serial number, barcode, consumer number, date, month/year, time, demand kVA/kW, export kWh, MD, TOD slot values, or printed labels.",
    "For LCD/video cycling meters, inspect all visible screens and pick the screen that is clearly the cumulative import kWh energy register.",
    "For odometer/mechanical meters, read the main black/white digit register as kWh; ignore small red decimal wheels unless needed for rounding.",
    "If the main number includes a decimal point, return reading_kwh rounded to the nearest integer and raw_display_text with the decimal preserved.",
    "If the screen is a date/time/month-year or any non-energy page, set is_energy_register false, reading_kwh null, and explain rejection_reason.",
    "If the unit/register label is unclear but the display is very likely cumulative energy, set is_energy_register true and lower confidence.",
    "If any digit is unclear, put ? in raw_display_text, set is_partial true, and do not guess the digit.",
    retryValue
      ? `A previous pass returned ${retryValue}, which may be a partial read. Re-inspect the whole LCD and return the full number if more digits are visible.`
      : "",
    "Return strict JSON only with reading_kwh, raw_display_text, confidence, display_type, meter_type, screen_label, is_energy_register, is_cumulative_total, notes, is_partial, and rejection_reason.",
  ].join(" ");
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
    // Usage tracking should never block meter processing.
  }
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
    return {
      slabs: fallbackDomesticSlabs,
      source: "fallback",
    };
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
      return {
        slabs: fallbackDomesticSlabs,
        source: "fallback",
      };
    }

    return {
      slabs: data as TariffSlab[],
      source: "tariff_slabs",
    };
  } catch {
    return {
      slabs: fallbackDomesticSlabs,
      source: "fallback",
    };
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

export async function POST(request: Request) {
  const { readingId, settings } = (await request.json()) as ProcessRequest;

  if (!readingId) {
    return NextResponse.json({ error: "readingId is required." }, { status: 400 });
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
    .select("id, user_id, storage_path, image_url, status")
    .eq("id", readingId)
    .single();

  if (readingError || !reading || reading.user_id !== user.id) {
    return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  }

  if (!reading.storage_path) {
    return NextResponse.json({ error: "Reading has no uploaded file." }, { status: 400 });
  }

  try {
    await admin
      .from("meter_readings")
      .update({ status: "processing", error_message: null })
      .eq("id", reading.id);

    const { data: fileData, error: fileError } = await admin.storage
      .from("meter-captures")
      .download(reading.storage_path);

    if (fileError || !fileData) {
      throw new Error(fileError?.message ?? "Unable to download meter capture.");
    }

    if (fileData.size > 20 * 1024 * 1024) {
      throw new Error("Meter capture is over 20 MB. Upload a shorter clip or photo.");
    }

    const mimeType = fileData.type || "image/jpeg";
    const base64 = Buffer.from(await fileData.arrayBuffer()).toString("base64");
    const ocrModel = process.env.GEMINI_OCR_MODEL ?? "gemini-2.5-flash-lite";
    const ocrParts = [
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
    ];
    const initialOcr = await generateGeminiJsonWithUsage<OcrResult>({
      model: ocrModel,
      parts: [
        {
          text: getOcrPrompt(),
        },
        ...ocrParts,
      ],
    });
    let ocr = initialOcr.data;
    await recordUsage({
      admin,
      userId: user.id,
      readingId: reading.id,
      model: ocrModel,
      purpose: "meter_ocr",
      usage: initialOcr.usage,
    });

    let readingKwh = parseMeterReading(ocr);

    if (ocr.is_energy_register === false) {
      throw new Error(
        ocr.rejection_reason ??
          "Gemini found a meter screen, but it was not the cumulative kWh energy register. Upload a photo or video showing the kWh/import energy screen."
      );
    }

    if (readingKwh === null) {
      const partialReading = parseMeterReading(ocr, 3);
      const reviewModel =
        process.env.GEMINI_OCR_REVIEW_MODEL ??
        process.env.GEMINI_ADVICE_MODEL ??
        "gemini-3.1-flash-lite";

      const reviewOcr = await generateGeminiJsonWithUsage<OcrResult>({
        model: reviewModel,
        parts: [
          {
            text: getOcrPrompt({ retryValue: partialReading }),
          },
          ...ocrParts,
        ],
      });
      ocr = reviewOcr.data;
      await recordUsage({
        admin,
        userId: user.id,
        readingId: reading.id,
        model: reviewModel,
        purpose: "meter_ocr_review",
        usage: reviewOcr.usage,
      });
      readingKwh = parseMeterReading(ocr);
    }

    if (ocr.is_energy_register === false) {
      throw new Error(
        ocr.rejection_reason ??
          "Gemini found a meter screen, but it was not the cumulative kWh energy register. Upload a photo or video showing the kWh/import energy screen."
      );
    }

    if (readingKwh !== null && isAmbiguousDateLikeReading(ocr, readingKwh)) {
      throw new Error(
        "Gemini returned a date-like or partial reading instead of a clear kWh value. Use a sharper photo or enter the reading manually."
      );
    }

    if (readingKwh === null) {
      throw new Error(
        "Gemini could not read a complete cumulative kWh/import energy value. Try a closer photo with the kWh label visible, or upload a short video while the meter cycles through screens."
      );
    }

    const previousReadingKwh = await loadPreviousReading({
      admin,
      userId: user.id,
      readingId: reading.id,
    });
    const { slabs, source: tariffSource } = await loadTariffSlabs({
      admin,
      state: settings?.state,
      discom: settings?.discom,
    });
    const projection = calculateProjection({
      currentReadingKwh: readingKwh,
      previousReadingKwh,
      capturedAt: new Date(),
      billingCycleDay: settings?.billingCycleDay ?? null,
      slabs,
    });
    let adviceJson: AdviceResult | null = null;

    if (settings?.allowAdvice !== false) {
      const adviceModel =
        process.env.GEMINI_ADVICE_MODEL ?? "gemini-3.1-flash-lite";
      const advice = await generateGeminiJsonWithUsage<AdviceResult>({
        model: adviceModel,
        parts: [
          {
            text: getAdvicePrompt({
              projection,
              state: settings?.state,
              discom: settings?.discom,
              language: settings?.language,
              useHinglish: settings?.useHinglish,
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
        purpose: "household_advice",
        usage: advice.usage,
      });
    }

    await admin
      .from("meter_readings")
      .update({
        reading_kwh: readingKwh,
        confidence: ocr.confidence ?? null,
        display_type: ocr.display_type ?? "kWh",
        processed_at: new Date().toISOString(),
        ai_notes:
          ocr.notes ??
          (ocr.raw_display_text ? `Raw display: ${ocr.raw_display_text}` : null),
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

    return NextResponse.json({
      reading_kwh: readingKwh,
      confidence: ocr.confidence ?? null,
      display_type: ocr.display_type ?? "kWh",
      notes: ocr.notes ?? null,
      projection,
      advice: adviceJson,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Processing failed.";

    await admin
      .from("meter_readings")
      .update({ status: "failed", error_message: message })
      .eq("id", reading.id);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
