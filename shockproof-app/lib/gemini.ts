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
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
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
    const message = payload.error?.message ?? "Gemini request failed.";
    throw new Error(
      response.status === 401
        ? `${message} Check that GEMINI_API_KEY is copied from Google AI Studio, not expired/deleted, and that the project can access the Gemini API.`
        : message
    );
  }

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return JSON.parse(text) as T;
}
