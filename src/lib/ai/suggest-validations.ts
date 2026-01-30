import Anthropic from "@anthropic-ai/sdk";
import { getCompanyContext } from "@/app/actions/settings";

export interface ValidationSuggestion {
  statement: string;
  reasoning: string;
}

export interface SuggestValidationsResult {
  suggestions: ValidationSuggestion[];
  success: boolean;
  error?: string;
}

// Only create client if API key exists
function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  return new Anthropic();
}

/**
 * Generate AI suggestions for sub-hypotheses that could help validate the parent hypothesis.
 * 
 * @param hypothesisStatement - The statement of the hypothesis to validate
 * @param hypothesisDescription - Optional description providing more context
 * @param existingChildren - Statements of existing child hypotheses (to avoid duplicates)
 * @param supportingEvidence - Existing supporting evidence for context
 * @param challenges - Existing challenges/counter-arguments for context
 * @returns A list of 3-5 suggested hypotheses
 */
export async function suggestValidations(
  hypothesisStatement: string,
  hypothesisDescription?: string | null,
  existingChildren?: string[],
  supportingEvidence?: string[],
  challenges?: string[]
): Promise<SuggestValidationsResult> {
  const anthropic = getAnthropicClient();
  
  if (!anthropic) {
    return {
      suggestions: [],
      success: false,
      error: "AI not configured. Add ANTHROPIC_API_KEY to your environment.",
    };
  }

  // Get company context if available
  const companyContext = await getCompanyContext();
  const contextSection = companyContext 
    ? `\nCOMPANY/PROJECT CONTEXT:\n${companyContext}\n` 
    : "";

  const descriptionSection = hypothesisDescription 
    ? `\nDESCRIPTION: ${hypothesisDescription}` 
    : "";

  const existingSection = existingChildren && existingChildren.length > 0
    ? `\nEXISTING SUB-HYPOTHESES (avoid duplicating these):\n${existingChildren.map(c => `- ${c}`).join("\n")}`
    : "";

  const supportSection = supportingEvidence && supportingEvidence.length > 0
    ? `\nEXISTING SUPPORTING EVIDENCE:\n${supportingEvidence.map(e => `- ${e}`).join("\n")}`
    : "";

  const challengesSection = challenges && challenges.length > 0
    ? `\nEXISTING CHALLENGES/COUNTER-ARGUMENTS:\n${challenges.map(c => `- ${c}`).join("\n")}`
    : "";

  const prompt = `You are helping a team validate a hypothesis by suggesting sub-hypotheses they should test. Each suggestion should be a testable claim that, if proven true, would provide evidence for or against the parent hypothesis.
${contextSection}
HYPOTHESIS TO VALIDATE: "${hypothesisStatement}"${descriptionSection}${existingSection}${supportSection}${challengesSection}

CRITICAL PRIORITIZATION RULE - FOUNDATIONAL HYPOTHESES FIRST:
Before suggesting hypotheses that assume certain capabilities, features, or systems exist, first check:
1. Does the hypothesis require something that doesn't exist yet (e.g., a referral program, a new feature, a specific metric)?
2. If yes, the MORE FOUNDATIONAL hypothesis should be suggested first (e.g., "A referral program will increase user acquisition" before "Referral rates will be higher for users who use feature X")
3. Look at the existing sub-hypotheses - if they already cover the foundational prerequisites, then it's OK to suggest hypotheses that build on them
4. If no existing sub-hypotheses cover the prerequisite, suggest the foundational one first

Think of it as a dependency chain:
- BAD: Suggesting "Users who complete onboarding have 2x higher retention" when there's no hypothesis about whether onboarding itself is valuable
- GOOD: First suggest "A structured onboarding flow will improve user activation" as the foundation

Generate 3-5 suggested sub-hypotheses that would help validate or refute this hypothesis. Each suggestion should be:
1. Specific and testable (not vague)
2. Directly relevant to proving/disproving the parent
3. Independent of any existing sub-hypotheses
4. Written as a clear hypothesis statement (not a task or question)
5. FOUNDATIONAL FIRST - suggest prerequisites before hypotheses that depend on them
6. Consider any existing challenges - suggest hypotheses that could address or test those counter-arguments

Good hypothesis format: "X will lead to Y" or "Users prefer X over Y" or "System A performs better than B when..."
Bad format: "Test whether X works" or "Investigate Y" or "What if we tried Z?"

Respond ONLY with valid JSON in this exact format:
{
  "suggestions": [
    {
      "statement": "The hypothesis statement",
      "reasoning": "1-2 sentence explanation of why this would help validate the parent"
    }
  ]
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from AI");
    }

    // Parse JSON response
    const result = JSON.parse(textContent.text) as {
      suggestions: ValidationSuggestion[];
    };

    return {
      suggestions: result.suggestions || [],
      success: true,
    };
  } catch (error) {
    console.error("AI validation suggestion error:", error);
    return {
      suggestions: [],
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate suggestions",
    };
  }
}
