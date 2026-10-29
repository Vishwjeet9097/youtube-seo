import { AppError } from "@/lib/api/errors";
import type { SummaryPayload, SummarySectionItem } from "@/types/research";

interface ProviderConfig {
  type: "openai" | "gemini" | "groq";
  apiKey: string;
  baseUrl?: string;
  model: string;
}

function detectAIProvider(): ProviderConfig | null {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return {
      type: "openai",
      apiKey: process.env.OPENAI_API_KEY.trim(),
      baseUrl: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    };
  }
  if (process.env.GROQ_API_KEY?.trim()) {
    return {
      type: "groq",
      apiKey: process.env.GROQ_API_KEY.trim(),
      baseUrl: "https://api.groq.com/openai/v1",
      model: process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile",
    };
  }
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (geminiKey) {
    return {
      type: "gemini",
      apiKey: geminiKey,
      model: process.env.GEMINI_MODEL?.trim() || "gemini-1.5-flash",
    };
  }
  return null;
}

export function isAIProviderConfigured(): boolean {
  return detectAIProvider() !== null;
}

export function chunkText(text: string, maxChunkLength = 12_000): string[] {
  if (text.length <= maxChunkLength) return [text];
  const words = text.split(/\s+/u);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length + 1 > maxChunkLength && currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [word];
      currentLength = word.length;
    } else {
      currentChunk.push(word);
      currentLength += word.length + 1;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks;
}

interface ParsedSummaryStructure {
  overview: string;
  keyTakeaways: string[];
  sections: SummarySectionItem[];
}

function parseModelJson(raw: string): ParsedSummaryStructure {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/i, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    return {
      overview: typeof parsed.overview === "string" ? parsed.overview : "Summary generated from transcript.",
      keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways.map(String) : [],
      sections: Array.isArray(parsed.sections)
        ? parsed.sections.map((s: { title?: string; points?: string[] }) => ({
            title: String(s.title || "Key Discussion"),
            points: Array.isArray(s.points) ? s.points.map(String) : [],
          }))
        : [],
    };
  } catch {
    // If model failed to return strict JSON, parse as text paragraphs
    const lines = cleaned.split(/\r?\n/).filter(Boolean);
    const overview = lines.slice(0, 3).join(" ");
    const takeaways = lines
      .filter((l) => l.trim().startsWith("-") || l.trim().startsWith("*") || /^\d+\./.test(l.trim()))
      .map((l) => l.replace(/^[-*•\d.]+\s*/, "").trim())
      .slice(0, 5);

    return {
      overview: overview || cleaned.slice(0, 500),
      keyTakeaways: takeaways.length > 0 ? takeaways : [overview.slice(0, 200)],
      sections: [{ title: "Main Summary", points: lines.slice(3, 8) }],
    };
  }
}

async function callOpenAICompatible(
  provider: ProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const url = `${provider.baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new AppError(
        "AI_SERVICE_ERROR",
        `AI provider request failed (${response.status}): ${errorBody.slice(0, 150)}`,
        response.status >= 500 ? 502 : 400,
        response.status >= 500,
      );
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(
  provider: ProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new AppError(
        "AI_SERVICE_ERROR",
        `Gemini API request failed (${response.status}): ${errorBody.slice(0, 150)}`,
        response.status >= 500 ? 502 : 400,
        response.status >= 500,
      );
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } finally {
    clearTimeout(timer);
  }
}

async function executeAICompletion(
  provider: ProviderConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  if (provider.type === "gemini") {
    return callGemini(provider, systemPrompt, userPrompt);
  }
  return callOpenAICompatible(provider, systemPrompt, userPrompt);
}

export async function generateTranscriptSummary(params: {
  videoId: string;
  transcript: string;
  summaryType?: "concise" | "detailed";
  language?: string;
}): Promise<SummaryPayload> {
  const provider = detectAIProvider();

  if (!provider) {
    throw new AppError(
      "AI_KEY_NOT_CONFIGURED",
      "AI summarization service is not configured. Please set OPENAI_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY in your environment (.env.local) to enable AI summaries.",
      503,
      false,
    );
  }

  const { videoId, transcript, summaryType = "concise", language } = params;
  const chunks = chunkText(transcript);

  const systemPrompt = `You are a professional video transcript summarizer and research analyst.
Your instructions:
1. Summarize ONLY the provided spoken transcript. Do NOT invent facts or bring outside knowledge.
2. Maintain the source language of the transcript by default (e.g. if the transcript is in Hindi / Devanagari script, provide the summary in Hindi with Devanagari script; if English, use English; if Hinglish, retain conversational tone).
3. ${summaryType === "concise" ? "Provide a high-level concise summary focused on the core takeaway and 3-5 main points." : "Provide an in-depth detailed summary with comprehensive takeaways and chronological or thematic section breakdowns."}
4. Preserve important names, figures, examples, and verifiable facts from the transcript.
5. Return strictly valid JSON with this exact schema:
{
  "overview": "Clear summary overview paragraph",
  "keyTakeaways": ["Key bullet point 1", "Key bullet point 2", "Key bullet point 3"],
  "sections": [
    {
      "title": "Section Title",
      "points": ["Specific point 1", "Specific point 2"]
    }
  ]
}`;

  let contentToSummarize = transcript;

  // Multi-stage summarization for long transcripts
  if (chunks.length > 1) {
    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const chunkPrompt = `Summarize chunk ${i + 1} of ${chunks.length} of the video transcript:\n\n${chunks[i]}`;
      const chunkResult = await executeAICompletion(
        provider,
        "Summarize the key points of this transcript excerpt concisely. Maintain the source language.",
        chunkPrompt,
      );
      chunkSummaries.push(chunkResult);
    }
    contentToSummarize = `Combined section summaries of the full video transcript:\n\n${chunkSummaries.join("\n\n")}`;
  }

  const userPrompt = `Video ID: ${videoId}
${language ? `Preferred Language: ${language}` : "Language: Detect and match source transcript language"}
Mode: ${summaryType}

Transcript content:
${contentToSummarize}

Produce the structured summary JSON now.`;

  const rawJson = await executeAICompletion(provider, systemPrompt, userPrompt);
  const parsed = parseModelJson(rawJson);

  return {
    videoId,
    overview: parsed.overview,
    keyTakeaways: parsed.keyTakeaways,
    sections: parsed.sections,
    language: language || "source",
    modelUsed: `${provider.type} (${provider.model})`,
    summaryType,
    generatedAt: new Date().toISOString(),
  };
}
