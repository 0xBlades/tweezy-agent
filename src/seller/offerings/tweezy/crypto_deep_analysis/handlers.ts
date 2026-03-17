import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";

// ─── Prompt Template ───────────────────────────────────────────────────────────

function buildPrompt(coin: string, timeframe: string, focus: string, context?: string): string {
  return `You are "Tweezy Deep Analysis", an elite crypto research analyst.

Analyze: ${coin}
Timeframe: ${timeframe}
Focus: ${focus}
${context ? `Additional context: ${context}` : ""}

Provide your analysis in the following structured format:

# 🔍 Deep Dive Analysis: ${coin}
**Timeframe:** ${timeframe}

${focus === "all" || focus === "fundamental" ? `## 📊 Fundamental Analysis
- **Project Overview**: Brief description, use case, and value proposition
- **Tokenomics**: Supply metrics, token utility, inflation
- **Team & Development**: Team background, recent updates
- **Ecosystem & Partnerships**: Key integrations, ecosystem growth
- **Competitive Landscape**: Main competitors and advantages
- **Fundamental Score**: Rate 1-10 with justification` : ""}

${focus === "all" || focus === "technical" ? `## 📈 Technical Analysis
- **Price Action**: Recent trend direction and strength
- **Key Support Levels**: 3 critical support levels
- **Key Resistance Levels**: 3 critical resistance levels
- **Moving Averages**: 50MA, 200MA positioning
- **RSI & Momentum**: Current readings
- **Volume Analysis**: Volume trends
- **Chart Patterns**: Notable patterns
- **Technical Score**: Rate 1-10 (1=bearish, 10=bullish)` : ""}

${focus === "all" || focus === "sentiment" ? `## 💭 Sentiment Analysis
- **Social Media Buzz**: Twitter/X activity, mentions
- **Community Health**: Discord/Telegram activity
- **Whale Activity**: Large transactions or movements
- **Narrative Strength**: Current narrative fit
- **News & Catalysts**: Recent news, upcoming events
- **Sentiment Score**: Rate 1-10 (1=fear, 10=greed)` : ""}

## 🎯 Overall Verdict
- **Overall Score**: X/10
- **Recommendation**: STRONG BUY / BUY / HOLD / SELL / STRONG SELL
- **Risk Level**: Low / Medium / High / Extreme
- **Key Risks**: Top 3 risks
- **Key Catalysts**: Top 3 positive catalysts

## 💡 Actionable Insights
3-5 specific actionable recommendations.

RULES:
- Be data-driven and specific with numbers and price levels
- Be honest about uncertainties and risks
- Professional but accessible tone
- Aim for 800-1200 words total
- End with: "⚠️ Disclaimer: This is not financial advice. Always DYOR."`;
}

// ─── Required: implement your service logic here ───────────────────────────────

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const coin = (request.coin || "BTC").toUpperCase();
  const timeframe = request.timeframe || "mid-term";
  const focus = request.focus || "all";
  const context = request.context;

  console.log(`[crypto_deep_analysis] Analyzing ${coin} | timeframe=${timeframe} | focus=${focus}`);

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview";

  if (!apiKey) {
    return { deliverable: "Error: OPENROUTER_API_KEY is not set." };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://virtuals.io",
        "X-Title": "Tweezy Deep Analysis",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: "You are Tweezy Deep Analysis, an elite crypto research analyst. Provide comprehensive, data-driven analysis with specific numbers and actionable insights.",
          },
          {
            role: "user",
            content: buildPrompt(coin, timeframe, focus, context),
          },
        ],
        max_tokens: 3000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { deliverable: `Error from OpenRouter (${response.status}): ${errorText}` };
    }

    const data = await response.json() as any;
    const analysis = data.choices?.[0]?.message?.content?.trim();

    if (!analysis) {
      return { deliverable: `Error: No content returned from the LLM for ${coin}.` };
    }

    console.log(`[crypto_deep_analysis] ✅ Analysis generated for ${coin} (${analysis.length} chars)`);
    return { deliverable: analysis };
  } catch (error: any) {
    console.error(`[crypto_deep_analysis] ❌ Error: ${error.message}`);
    return { deliverable: `Error generating analysis for ${coin}: ${error.message}` };
  }
}

// ─── Optional: validate incoming requests ──────────────────────────────────────

export function validateRequirements(request: any): ValidationResult {
  if (!request.coin || typeof request.coin !== "string" || request.coin.trim().length === 0) {
    return { valid: false, reason: "A 'coin' field (e.g., BTC, ETH, SOL) is required." };
  }
  return { valid: true };
}

// ─── Optional: custom payment request message ──────────────────────────────────

export function requestPayment(request: any): string {
  const coin = (request.coin || "Unknown").toUpperCase();
  const timeframe = request.timeframe || "mid-term";
  return `Tweezy will generate a comprehensive deep-dive analysis for ${coin} (${timeframe}).`;
}
