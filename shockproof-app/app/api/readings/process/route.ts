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
  raw_display_text?: string | null;
  value?: number | string | null;
  confidence?: number;
  display_type?: string;
  notes?: string;
  is_partial?: boolean;
};

function parseMeterReading(ocr: OcrResult, minimumDigits = 5) {
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

    const normalized = text.replace(/[^\d.]/g, "");

    if (normalized.replace(/\D/g, "").length < minimumDigits) {
      continue;
    }

    const parsed = Number(normalized);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }

  const fallbackMatch = JSON.stringify(ocr).match(/\d{5,}(?:\.\d+)?/);

  if (!fallbackMatch) {
    return null;
  }

  const parsed = Number(fallbackMatch[0]);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function getOcrPrompt({ retryValue }: { retryValue?: number | null } = {}) {
  return [
    "You are reading an Indian digital electricity meter photo.",
    "Extract the complete main number shown on the green LCD display.",
    "Most real meter readings have 5 or 6 digits. Do not stop after the first 3 or 4 visible digits if more digits are present.",
    "Ignore barcode numbers, serial numbers, printed labels, voltage, current, power factor, date, and time.",
    "If a kWh, import energy, or total active energy label is visible, set display_type to kWh.",
    "If the unit label is unclear but the LCD number is clear, still return the full LCD number and lower confidence.",
    "If any LCD digit is unclear, put the uncertain digit in raw_display_text using ? and set is_partial true.",
    retryValue
      ? `A previous pass returned ${retryValue}, which may be a partial read. Re-inspect the whole LCD and return the full number if more digits are visible.`
      : "",
    "Return strict JSON only with reading_kwh, raw_display_text, confidence, display_type, notes, and is_partial.",
  ].join(" ");
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
    const ocrParts = [
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
    ];
    let ocr = await generateGeminiJson<OcrResult>({
      model: ocrModel,
      parts: [
        {
          text: getOcrPrompt(),
        },
        ...ocrParts,
      ],
    });

    let readingKwh = parseMeterReading(ocr);

    if (readingKwh === null) {
      const partialReading = parseMeterReading(ocr, 3);
      const reviewModel =
        process.env.GEMINI_OCR_REVIEW_MODEL ??
        process.env.GEMINI_ADVICE_MODEL ??
        "gemini-3.1-flash-lite";

      ocr = await generateGeminiJson<OcrResult>({
        model: reviewModel,
        parts: [
          {
            text: getOcrPrompt({ retryValue: partialReading }),
          },
          ...ocrParts,
        ],
      });
      readingKwh = parseMeterReading(ocr);
    }

    if (readingKwh === null) {
      throw new Error(
        "Gemini could not read the full LCD number clearly. Try a closer, sharper photo with the entire green display visible."
      );
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
