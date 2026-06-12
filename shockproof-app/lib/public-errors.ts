export function getPublicErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const lower = message.toLowerCase();

  if (lower.includes("missing gemini_api_key")) {
    return "AI processing is not configured yet. Add the Gemini API key in deployment settings.";
  }

  if (
    lower.includes("api key not valid") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid authentication") ||
    lower.includes("authentication credentials")
  ) {
    return "Gemini rejected the API key. Check the production Gemini key and model access.";
  }

  if (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("resource exhausted")
  ) {
    return "Gemini usage is temporarily limited. Try again later or check the API quota.";
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("fetch failed")
  ) {
    return "Network connection to the AI or database service failed. Try again in a moment.";
  }

  if (lower.includes("json") && lower.includes("parse")) {
    return "The AI response could not be read. Try another capture or upload again.";
  }

  if (
    lower.includes("unable to download meter capture") ||
    lower.includes("object not found") ||
    lower.includes("storage")
  ) {
    return "The uploaded meter capture could not be read from storage. Delete it and upload again.";
  }

  if (lower.includes("over 20 mb")) {
    return "The capture is over 20 MB. Upload a shorter clip or a compressed photo.";
  }

  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "The database rejected this action. Check Supabase RLS and storage policies.";
  }

  return message || "Something went wrong. Please try again.";
}
