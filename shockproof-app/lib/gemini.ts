type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export async function generateGeminiJson<T>({
  model,
  parts,
}: {
  model: string;
  parts: GeminiPart[];
}): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  if (!apiKey.startsWith("AIza")) {
    throw new Error(
      "GEMINI_API_KEY is set, but it does not look like a Google AI Studio API key. Create an API key in Google AI Studio and paste that value into .env.local."
    );
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts,
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    }
  );
  const payload = (await response.json()) as GeminiResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Gemini request failed.");
  }

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return JSON.parse(text) as T;
}
