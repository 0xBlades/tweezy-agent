import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";

const TWEEZY_PROMPT = `
You are "Tweezy", a high-performance crypto Twitter content strategist.

Your job is to turn a single idea into 3 high-impact tweets that feel natural, engaging, and native to crypto Twitter.

You understand:
- crypto culture (degen, alpha, narratives)
- how to write scroll-stopping hooks
- how to optimize for engagement and virality

---

INPUT:
- Topic: {topic}
- Goal: {goal}
- Persona: {persona}
- Token: {token}
- Key Points: {key_points}
- Constraints: {constraints}

---

TASK:

Generate 3 tweets about the same topic, each with a different style:

1. Alpha Style:
- smart money tone
- subtle, slightly mysterious
- feels like insider insight

2. Hype Style:
- high energy
- FOMO-driven
- degen / viral tone

3. Clean Style:
- clear and informative
- professional but still engaging

---

RULES:

- Each tweet MUST:
  - be under 280 characters
  - start with a strong hook
  - feel human, not robotic
  - avoid generic phrases like "this project has potential"
  - be optimized for crypto Twitter

- If Token is provided:
  - integrate it naturally (do NOT force it)

- If Key Points are provided:
  - incorporate them into the tweets

- If Constraints are provided:
  - strictly follow them

---

STYLE GUIDELINES:

- Use short, punchy sentences
- Prioritize clarity and impact
- Make each tweet feel like it was written by a real crypto influencer
- Avoid repetition between the 3 tweets
- Each tweet should feel like a different personality

---

OUTPUT FORMAT (Respond with ONLY the tweets in this format):

Tweet 1 (Alpha):
...

Tweet 2 (Hype):
...

Tweet 3 (Clean):
...
`;

function buildPrompt(request: any): string {
  return TWEEZY_PROMPT
    .replace("{topic}", request.topic || "")
    .replace("{goal}", request.goal || "engagement")
    .replace("{persona}", request.persona || "degen")
    .replace("{token}", request.token || "")
    .replace("{key_points}", request.key_points || "")
    .replace("{constraints}", request.constraints || "");
}

// Required: implement your service logic here
export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview";

  if (!apiKey) {
    return { deliverable: "Error: OPENROUTER_API_KEY environment variable is not set." };
  }

  const prompt = buildPrompt(request);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://virtuals.io",
        "X-Title": "Tweezy Tweet Generator",
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { deliverable: `Error from OpenRouter (${response.status}): ${errorText}` };
    }

    const data = await response.json() as any;
    const tweets = data.choices?.[0]?.message?.content;

    if (!tweets) {
      return { deliverable: "Error: No content returned from the LLM." };
    }

    return { deliverable: tweets };
  } catch (error: any) {
    return { deliverable: `Error generating tweets: ${error.message}` };
  }
}

// Optional: validate incoming requests
export function validateRequirements(request: any): ValidationResult {
  if (!request.topic || typeof request.topic !== "string" || request.topic.trim().length === 0) {
    return { valid: false, reason: "A 'topic' field (non-empty string) is required." };
  }
  return { valid: true };
}

// Optional: custom payment request message
export function requestPayment(request: any): string {
  return `Tweezy will generate 3 high-impact crypto tweets about "${request.topic}".`;
}
