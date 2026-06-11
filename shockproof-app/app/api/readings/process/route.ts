import { NextResponse } from "next/server";

import { calculateProjection } from "@/lib/billing-projections";
import { generateGeminiJson } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ProcessRequest = {
  readingId?: string;
};

type OcrResult = {
  reading_kwh: number;
  confidence?: number;
  display_type?: string;
  notes?: string;
};

type AdviceResult = {
  title: string;
  message: string;
  actions: string[];
};

export async function POST(request: Request) {
  const { readingId } = (await request.json()) as ProcessRequest;

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
    .select(
      "id, household_id, captured_by, file_path, file_type, captured_at, households(id, owner_id, state, discom, billing_cycle_day)"
    )
    .eq("id", readingId)
    .single();

  const household = Array.isArray(reading?.households)
    ? reading?.households[0]
    : reading?.households;

  if (readingError || !reading || !household || household.owner_id !== user.id) {
    return NextResponse.json({ error: "Reading not found." }, { status: 404 });
  }

  if (!reading.file_path) {
    return NextResponse.json({ error: "Reading has no uploaded file." }, { status: 400 });
  }

  try {
    await admin
      .from("meter_readings")
      .update({ status: "processing", error_message: null })
      .eq("id", reading.id);

    const { data: fileData, error: fileError } = await admin.storage
      .from("meter-captures")
      .download(reading.file_path);

    if (fileError || !fileData) {
      throw new Error(fileError?.message ?? "Unable to download meter capture.");
    }

    if (fileData.size > 20 * 1024 * 1024) {
      throw new Error("Meter capture is over 20 MB. Upload a shorter clip or photo.");
    }

    const mimeType =
      fileData.type ||
      (reading.file_type === "video" ? "video/mp4" : "image/jpeg");
    const base64 = Buffer.from(await fileData.arrayBuffer()).toString("base64");
    const ocrModel = process.env.GEMINI_OCR_MODEL ?? "gemini-3.1-flash-lite";
    const adviceModel =
      process.env.GEMINI_ADVICE_MODEL ?? "gemini-3.1-flash-lite";
    const ocr = await generateGeminiJson<OcrResult>({
      model: ocrModel,
      parts: [
        {
          text:
            "You are reading an Indian digital electricity meter. Find the screen or frame showing kWh, import energy, or total active energy. Ignore date, time, voltage, current, power factor, and max demand screens. Return strict JSON with reading_kwh as an integer number, confidence from 0 to 1, display_type, and notes.",
        },
        {
          inlineData: {
            mimeType,
            data: base64,
          },
        },
      ],
    });

    const readingKwh = Math.round(Number(ocr.reading_kwh));

    if (!Number.isFinite(readingKwh) || readingKwh < 0) {
      throw new Error("Gemini did not return a valid kWh reading.");
    }

    const { data: previousReading } = await admin
      .from("meter_readings")
      .select("reading_kwh")
      .eq("household_id", reading.household_id)
      .neq("id", reading.id)
      .not("reading_kwh", "is", null)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: slabs } = await admin
      .from("tariff_slabs")
      .select("slab_start, slab_end, rate, fixed_charge")
      .eq("state", household.state)
      .eq("discom", household.discom)
      .eq("consumer_category", "domestic")
      .order("slab_start", { ascending: true });
    const projection = calculateProjection({
      currentReadingKwh: readingKwh,
      previousReadingKwh: previousReading?.reading_kwh ?? null,
      capturedAt: new Date(reading.captured_at),
      billingCycleDay: household.billing_cycle_day,
      slabs: slabs ?? [],
    });
    const advice = await generateGeminiJson<AdviceResult>({
      model: adviceModel,
      parts: [
        {
          text: `Generate concise household electricity-saving advice. Tone: calm, practical, non-alarming. Do not invent tariff rules or amounts. Return JSON with title, message, and actions array. Context: ${JSON.stringify({
            state: household.state,
            discom: household.discom,
            readingKwh,
            projection,
          })}`,
        },
      ],
    });

    await admin
      .from("meter_readings")
      .update({
        reading_kwh: readingKwh,
        confidence: ocr.confidence ?? null,
        display_type: ocr.display_type ?? "kWh",
        status: "processed",
        processed_at: new Date().toISOString(),
        ai_notes: ocr.notes ?? null,
      })
      .eq("id", reading.id);

    await admin.from("reading_projections").insert({
      reading_id: reading.id,
      current_usage: projection.currentUsage,
      projected_units: projection.projectedUnits,
      next_slab_at: projection.nextSlabAt,
      units_to_next_slab: projection.unitsToNextSlab,
      estimated_bill: projection.estimatedBill,
      estimated_delta: projection.estimatedDelta,
      bill_risk: projection.billRisk,
      advice_json: advice,
    });

    return NextResponse.json({
      reading_kwh: readingKwh,
      projection,
      advice,
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
