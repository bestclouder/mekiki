/**
 * Signal summary generation.
 *
 * Uses OpenAI GPT-4o when OPENAI_API_KEY is set (server-side only, per
 * docs/SECURITY.md). Otherwise degrades to a deterministic rule-based sentence
 * built from the evidence — the core app is fully functional with AI switched
 * off (docs/ARCHITECTURE.md § "Why Core Runs Without AI").
 */

export type SummaryInput = {
  symbol: string;
  name: string;
  signalType: "volume_spike" | "price_move" | "news_event";
  score: number;
  evidence: Record<string, unknown>;
};

export type SummaryOutput = {
  summary: string;
  source: string;
  confidence: number;
};

function ruleBasedSummary(input: SummaryInput): string {
  const { symbol, signalType, evidence } = input;
  switch (signalType) {
    case "volume_spike": {
      const ratio = evidence.volume_ratio as number | undefined;
      return `${symbol} 24h trading volume is ${ratio ? `${ratio}×` : "well above"} its 7-day average — an unusual surge in activity.`;
    }
    case "price_move": {
      const pct = evidence.price_change_pct as number | undefined;
      const dir = (pct ?? 0) >= 0 ? "up" : "down";
      return `${symbol} moved ${dir} ${pct != null ? `${Math.abs(pct)}%` : "sharply"} over the last 24h on notable volume.`;
    }
    case "news_event": {
      const kws = (evidence.matched_keywords as string[] | undefined) ?? [];
      return `${symbol} flagged by recent news${kws.length ? ` mentioning ${kws.join(", ")}` : ""}.`;
    }
  }
}

/** Confidence for rule-based summaries derived from the composite score. */
function ruleBasedConfidence(score: number): number {
  return Math.min(0.98, Math.round((0.7 + score / 300) * 100) / 100);
}

async function openAiSummary(
  input: SummaryInput,
): Promise<SummaryOutput | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.3,
        max_tokens: 80,
        messages: [
          {
            role: "system",
            content:
              "You are a crypto market analyst. Given a signal's evidence JSON, write ONE concise sentence (max 25 words) explaining why the token is interesting right now. No preamble.",
          },
          {
            role: "user",
            content: JSON.stringify({
              token: `${input.name} (${input.symbol})`,
              signal_type: input.signalType,
              evidence: input.evidence,
            }),
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    return {
      summary: text,
      source: "openai/gpt-4o",
      // Self-reported proxy; blended with rule-based floor.
      confidence: Math.min(0.97, ruleBasedConfidence(input.score) + 0.05),
    };
  } catch {
    return null;
  }
}

export async function generateSummary(
  input: SummaryInput,
): Promise<SummaryOutput> {
  const ai = await openAiSummary(input);
  if (ai) return ai;
  return {
    summary: ruleBasedSummary(input),
    source: "rule-based",
    confidence: ruleBasedConfidence(input.score),
  };
}
