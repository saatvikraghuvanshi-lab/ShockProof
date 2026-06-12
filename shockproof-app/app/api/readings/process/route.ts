import { NextResponse } from "next/server";

import { generateGeminiJson } from "@/lib/gemini";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ProcessRequest = {
  readingId?: number;
};

type OcrResult = {
  reading_kwh?: number | string | null;
  display_number?: number | string | null;
  best_display_number?: number | string | null;
  value?: number | string | null;
  confidence?: number;
  display_type?: string;
  notes?: string;
};

function parseMeterReading(ocr: OcrResult) {
  const candidates = [
    ocr.reading_kwh,
    ocr.display_number,
    ocr.best_display_number,
    ocr.value,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) {
      continue;
    }

    const normalized = String(candidate).replace(/[^\d.]/g, "");
    const parsed = Number(normalized);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }

  const fallbackMatch = JSON.stringify(ocr).match(/\d{3,}(?:\.\d+)?/);

  if (!fallbackMatch) {
    return null;
  }

  const parsed = Number(fallbackMatch[0]);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

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
    const ocr = await generateGeminiJson<OcrResult>({
      model: ocrModel,
      parts: [
        {
          text:
            "You are reading an Indian digital electricity meter photo. Extract the main number shown on the green LCD display. If a kWh, import energy, or total active energy label is visible, set display_type to kWh. If the label is not visible but the LCD number is clear, still return that number as reading_kwh and lower the confidence. Ignore barcode numbers, serial numbers, voltage, current, power factor, date, and time. Return strict JSON only: reading_kwh as a number or numeric string, confidence from 0 to 1, display_type, and notes. For the provided photo, prefer the large LCD display digits over all printed text.",
        },
        {
          inlineData: {
            mimeType,
            data: base64,
          },
        },
      ],
    });

    const readingKwh = parseMeterReading(ocr);

    if (readingKwh === null) {
      throw new Error("Gemini did not return a valid kWh reading.");
    }

    await admin
      .from("meter_readings")
      .update({
        reading_kwh: readingKwh,
        confidence: ocr.confidence ?? null,
        display_type: ocr.display_type ?? "kWh",
        processed_at: new Date().toISOString(),
        ai_notes: ocr.notes ?? null,
        error_message: null,
        status: "processed",
      })
      .eq("id", reading.id);

    return NextResponse.json({
      reading_kwh: readingKwh,
      confidence: ocr.confidence ?? null,
      display_type: ocr.display_type ?? "kWh",
      notes: ocr.notes ?? null,
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
