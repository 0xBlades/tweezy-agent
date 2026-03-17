import type { ExecuteJobResult, ValidationResult } from "../../../runtime/offeringTypes.js";

// ─── Meta-Prompt ────────────────────────────────────────────────────────────────

function buildMetaPrompt(
  purpose: string,
  model: string,
  tone: string,
  details: string,
  format: string
): string {
  return `You are an elite AI Prompt Engineer — one of the best in the world at crafting prompts that produce exceptional results from AI models.

Your task: Create a production-ready prompt for the following use case.

**Use Case:** ${purpose}
**Target Model:** ${model}
**Tone:** ${tone}
**Output Format:** ${format}
${details ? `**Additional Requirements:** ${details}` : ""}

---

Generate the prompt using this structure based on the requested format:

${format === "system-prompt" ? `
## Output: System Prompt

Create a single, comprehensive system prompt that includes:
1. **Role Definition** — Who the AI is and what it specializes in
2. **Core Capabilities** — What it can do
3. **Behavioral Rules** — Strict rules it must follow
4. **Output Format** — How it should structure responses
5. **Edge Cases** — How to handle unclear or out-of-scope requests
6. **Examples** — 1-2 inline examples of ideal responses

Wrap the final prompt in a code block labeled \`system-prompt\`.
` : ""}

${format === "multi-turn" ? `
## Output: Multi-Turn Prompt Template

Create a conversational prompt template that includes:
1. **System Message** — Base instructions
2. **First User Message Template** — With {placeholders} for variables
3. **Expected Assistant Response Pattern** — What a good first response looks like
4. **Follow-up User Message Templates** — 2-3 follow-up templates
5. **Conversation Flow Guide** — How the conversation should progress

Wrap each message in labeled code blocks.
` : ""}

${format === "chain-of-thought" ? `
## Output: Chain-of-Thought Prompt

Create a prompt that forces step-by-step reasoning:
1. **System Instructions** — Including "think step by step" directives
2. **Reasoning Framework** — Numbered steps the AI should follow
3. **Output Structure** — Separate thinking from final answer
4. **Validation Step** — Self-check before responding

Wrap the final prompt in a code block.
` : ""}

${format === "full-template" ? `
## Output: Full Production Template

Create a complete, copy-paste-ready template that includes:
1. **System Prompt** — Comprehensive base instructions
2. **User Message Template** — With {placeholders}
3. **Few-Shot Examples** — 2-3 input/output examples
4. **Error Handling Instructions** — What to do with bad input
5. **Output Schema** — JSON or structured format definition
6. **Usage Notes** — Tips for the developer using this prompt

Wrap each section in labeled code blocks.
` : ""}

---

RULES FOR PROMPT CREATION:
- Make it specific and actionable, NOT vague
- Include concrete examples where helpful
- Add guardrails to prevent unwanted behavior
- Optimize for the target model's strengths
- Use {placeholder} syntax for dynamic variables
- The prompt should be immediately usable — no "TODO" sections
- Aim for comprehensive but concise (avoid unnecessary verbosity)
- Include a brief "Why this works" explanation at the end

${model !== "general" ? `
MODEL-SPECIFIC OPTIMIZATION for ${model}:
- Tailor instruction style to what ${model} responds best to
- Use formatting conventions that ${model} handles well
- Note any model-specific features or limitations
` : ""}`;
}

// ─── Handlers ───────────────────────────────────────────────────────────────────

export function validateRequirements(request: any): ValidationResult {
  if (!request.purpose || typeof request.purpose !== "string" || request.purpose.trim().length === 0) {
    return { valid: false, reason: "A 'purpose' field describing what the prompt is for is required." };
  }
  return { valid: true };
}

export function requestPayment(request: any): string {
  return `Prompt Writer will craft an optimized prompt for: "${request.purpose}".`;
}

export async function executeJob(request: any): Promise<ExecuteJobResult> {
  const purpose = request.purpose;
  const model = request.model || "general";
  const tone = request.tone || "professional";
  const details = request.details || "";
  const format = request.format || "system-prompt";

  console.log(`[prompt_writer] Generating prompt for: "${purpose}" | model=${model} | format=${format}`);

  const apiKey = process.env.OPENROUTER_API_KEY;
  const llmModel = process.env.OPENROUTER_MODEL || "google/gemini-3-flash-preview";

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
        "X-Title": "Gate AI Prompt Writer",
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          {
            role: "system",
            content: "You are the world's best AI prompt engineer. You create prompts that consistently produce exceptional results. Your prompts are specific, well-structured, and immediately usable in production.",
          },
          {
            role: "user",
            content: buildMetaPrompt(purpose, model, tone, details, format),
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
    const result = data.choices?.[0]?.message?.content?.trim();

    if (!result) {
      return { deliverable: "Error: No content returned from the LLM." };
    }

    console.log(`[prompt_writer] ✅ Prompt generated (${result.length} chars)`);
    return { deliverable: result };
  } catch (error: any) {
    console.error(`[prompt_writer] ❌ Error: ${error.message}`);
    return { deliverable: `Error generating prompt: ${error.message}` };
  }
}
