import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const readingId = Number(id);
  const body = (await request.json()) as { reading_kwh?: number | string };
  const readingKwh = Number(body.reading_kwh);

  if (!Number.isFinite(readingId) || !Number.isFinite(readingKwh) || readingKwh < 0) {
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

  const { error: updateError } = await admin
    .from("meter_readings")
    .update({
      reading_kwh: Math.round(readingKwh),
      confidence: 1,
      display_type: "kWh",
      processed_at: new Date().toISOString(),
      ai_notes: "Manually corrected by user.",
      error_message: null,
      status: "processed",
    })
    .eq("id", reading.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reading_kwh: Math.round(readingKwh) });
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
