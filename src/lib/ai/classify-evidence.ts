import Anthropic from "@anthropic-ai/sdk";
import type { EvidenceDirection } from "@prisma/client";
import { getCompanyContext } from "@/app/actions/settings";

export interface EvidenceClassification {
  direction: EvidenceDirection;
  strength: number; // 1-5
  reasoning: string;
}

// Only create client if API key exists
function getAnthropicClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  return new Anthropic();
}

/**
 * Use AI to classify evidence text in the context of a hypothesis.
 * 
 * Returns:
 * - direction: How the evidence relates to the hypothesis
 * - strength: How strong/convincing the evidence is (1-5)
 * - reasoning: Brief explanation of the classification
 */
export async function classifyEvidence(
  hypothesisStatement: string,
  evidenceText: string
): Promise<EvidenceClassification> {
  // Get company context if available
  const companyContext = await getCompanyContext();
  const contextSection = companyContext 
    ? `\nCOMPANY/PROJECT CONTEXT:\n${companyContext}\n` 
    : "";

  const prompt = `You are analyzing evidence in the context of a hypothesis. Your task is to classify how the evidence relates to the hypothesis.
${contextSection}
HYPOTHESIS: "${hypothesisStatement}"

EVIDENCE: "${evidenceText}"

Analyze the evidence and respond with a JSON object containing:
1. "direction": How the evidence relates to the hypothesis. Must be one of:
   - "SUPPORTS" - Directly supports/validates the hypothesis
   - "WEAKLY_SUPPORTS" - Somewhat supports the hypothesis, but not strongly
   - "NEUTRAL" - Neither supports nor refutes, or is tangential
   - "WEAKLY_REFUTES" - Raises some doubt about the hypothesis
   - "REFUTES" - Directly contradicts/invalidates the hypothesis

2. "strength": How strong or convincing is this evidence (1-5):
   - 1 = Very weak (anecdotal, opinion, single data point)
   - 2 = Weak (limited data, indirect connection)
   - 3 = Moderate (reasonable data, clear connection)
   - 4 = Strong (substantial data, direct connection)
   - 5 = Very strong (comprehensive data, definitive connection)

3. "reasoning": A brief (1-2 sentence) explanation of your classification.

Respond ONLY with valid JSON, no other text.`;

  // Check if API key is configured
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    // Fallback to neutral when no API key
    return {
      direction: "NEUTRAL",
      strength: 3,
      reasoning: "AI classification not configured - using default",
    };
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
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
      direction: string;
      strength: number;
      reasoning: string;
    };

    // Validate and normalize direction
    const validDirections: EvidenceDirection[] = [
      "SUPPORTS",
      "WEAKLY_SUPPORTS",
      "NEUTRAL",
      "WEAKLY_REFUTES",
      "REFUTES",
    ];
    
    const direction = validDirections.includes(result.direction as EvidenceDirection)
      ? (result.direction as EvidenceDirection)
      : "NEUTRAL";

    // Clamp strength to 1-5
    const strength = Math.max(1, Math.min(5, Math.round(result.strength)));

    return {
      direction,
      strength,
      reasoning: result.reasoning || "",
    };
  } catch (error) {
    console.error("AI classification error:", error);
    
    // Fallback to neutral if AI fails
    return {
      direction: "NEUTRAL",
      strength: 3,
      reasoning: "Auto-classification unavailable",
    };
  }
}
