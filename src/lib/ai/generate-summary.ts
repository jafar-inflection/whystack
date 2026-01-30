import Anthropic from "@anthropic-ai/sdk";
import { getCompanyContext } from "@/app/actions/settings";

export interface ExecutiveSummaryResult {
  validationPlan: string;      // How this hypothesis will be validated (children description)
  progressSummary: string;     // Progress and confidence so far
  biggerPicture: string | null; // How this matters to the bigger picture (only for level 1+)
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

export interface HypothesisContext {
  statement: string;
  confidence: number;
  isNew: boolean; // True if the hypothesis hasn't been evaluated yet
  supportCount: number; // Number of supporting evidence pieces
  challengeCount: number; // Number of challenging evidence pieces
  children: HypothesisContext[];
}

export interface ParentContext {
  statement: string;
  confidence: number;
  isNew: boolean;
}

/**
 * Recursively build a text representation of the hypothesis tree
 * NEW hypotheses are marked as "in progress" rather than showing confidence
 */
function buildContextTree(hypothesis: HypothesisContext, depth: number = 0): string {
  const indent = "  ".repeat(depth);
  
  // For NEW hypotheses, don't treat confidence as meaningful
  let statusLabel: string;
  if (hypothesis.isNew) {
    statusLabel = "In progress - awaiting documentation";
  } else if (hypothesis.confidence > 80) {
    statusLabel = "Validated";
  } else if (hypothesis.confidence < 20) {
    statusLabel = "Refuted";
  } else {
    statusLabel = `${hypothesis.confidence}% confidence`;
  }
  
  // Build evidence note showing both support and challenges
  const evidenceParts: string[] = [];
  if (hypothesis.supportCount > 0) {
    evidenceParts.push(`${hypothesis.supportCount} supporting`);
  }
  if (hypothesis.challengeCount > 0) {
    evidenceParts.push(`${hypothesis.challengeCount} challenging`);
  }
  const evidenceNote = evidenceParts.length > 0 ? `, ${evidenceParts.join(", ")} evidence` : "";
  let text = `${indent}- ${hypothesis.statement} (${statusLabel}${evidenceNote})`;
  
  for (const child of hypothesis.children) {
    text += "\n" + buildContextTree(child, depth + 1);
  }
  
  return text;
}

/**
 * Count only evaluated hypotheses and calculate meaningful stats
 */
function calculateProgressStats(children: HypothesisContext[]): { 
  totalEvaluated: number; 
  avgConfidence: number;
  validated: number;
  refuted: number;
  totalProposed: number;
  totalSupport: number;
  totalChallenges: number;
} {
  let totalEvaluated = 0;
  let totalProposed = 0;
  let sumConfidence = 0;
  let validated = 0;
  let refuted = 0;
  let totalSupport = 0;
  let totalChallenges = 0;
  
  function traverse(nodes: HypothesisContext[]) {
    for (const node of nodes) {
      totalSupport += node.supportCount;
      totalChallenges += node.challengeCount;
      if (node.isNew) {
        totalProposed++;
      } else {
        totalEvaluated++;
        sumConfidence += node.confidence;
        if (node.confidence > 80) validated++;
        if (node.confidence < 20) refuted++;
      }
      traverse(node.children);
    }
  }
  
  traverse(children);
  
  return {
    totalEvaluated,
    avgConfidence: totalEvaluated > 0 ? Math.round(sumConfidence / totalEvaluated) : 0,
    validated,
    refuted,
    totalProposed,
    totalSupport,
    totalChallenges,
  };
}

/**
 * Generate an Executive Summary for a hypothesis with 3 sections:
 * 1. Validation Plan - How this hypothesis will be validated (children description)
 * 2. Progress Summary - Current state of confidence (excluding NEW hypotheses)
 * 3. Bigger Picture - How this matters to parent hypotheses (only for non-root)
 */
export async function generateExecutiveSummary(
  hypothesisStatement: string,
  hypothesisConfidence: number,
  hypothesisIsNew: boolean,
  children: HypothesisContext[],
  parentChain: ParentContext[] // From immediate parent to root
): Promise<ExecutiveSummaryResult> {
  const anthropic = getAnthropicClient();
  
  if (!anthropic) {
    return {
      validationPlan: "",
      progressSummary: "",
      biggerPicture: null,
      success: false,
      error: "AI not configured. Add ANTHROPIC_API_KEY to your environment.",
    };
  }

  // Build context from children tree
  let childrenContext = "";
  if (children.length > 0) {
    childrenContext = "\nSUB-HYPOTHESES (validation approach):\n";
    for (const child of children) {
      childrenContext += buildContextTree(child, 0) + "\n";
    }
  }
  
  // Build parent chain context
  let parentContext = "";
  if (parentChain.length > 0) {
    parentContext = "\nPARENT CHAIN (from immediate parent to root):\n";
    for (let i = 0; i < parentChain.length; i++) {
      const parent = parentChain[i];
      const status = parent.isNew ? "In progress" : 
                     parent.confidence > 80 ? "Validated" :
                     parent.confidence < 20 ? "Refuted" :
                     `${parent.confidence}%`;
      parentContext += `${i + 1}. ${parent.statement} (${status})\n`;
    }
  }
  
  // Calculate progress stats
  const stats = calculateProgressStats(children);
  const ownStatus = hypothesisIsNew ? "in progress (awaiting documentation)" : `${hypothesisConfidence}% confidence`;
  
  let statsContext = `\nPROGRESS STATS:\n`;
  statsContext += `- This hypothesis: ${ownStatus}\n`;
  if (children.length > 0) {
    statsContext += `- Sub-hypotheses with recorded data: ${stats.totalEvaluated}${stats.totalEvaluated > 0 ? ` (avg ${stats.avgConfidence}% confidence)` : ''}\n`;
    statsContext += `- Sub-hypotheses in progress: ${stats.totalProposed}\n`;
    if (stats.validated > 0) statsContext += `- Validated: ${stats.validated}\n`;
    if (stats.refuted > 0) statsContext += `- Refuted: ${stats.refuted}\n`;
    if (stats.totalSupport > 0 || stats.totalChallenges > 0) {
      statsContext += `- Total evidence collected: ${stats.totalSupport} supporting, ${stats.totalChallenges} challenging\n`;
    }
  }

  // Get company context if available
  const companyContext = await getCompanyContext();
  const companySection = companyContext 
    ? `\nCOMPANY/PROJECT CONTEXT:\n${companyContext}\n` 
    : "";

  const prompt = `You are creating an executive summary for a hypothesis in a research/validation system.
${companySection}
HYPOTHESIS: "${hypothesisStatement}"
${childrenContext}${parentContext}${statsContext}

IMPORTANT RULES FOR INTERPRETING STATUS:
- "Proposed - not yet evaluated" means work may be in progress but HASN'T BEEN RECORDED in this system yet. Don't assume nothing has been done - just that we don't have data to report on.
- Treat proposed items neutrally: say they are "in progress" or "pending documentation" rather than implying failure or neglect.
- Only cite specific confidence levels from hypotheses that have been evaluated (those showing actual percentages).
- Keep a balanced, factual tone. Avoid dramatic language like "nothing has been done" or "critical gaps" - we simply don't have visibility into unevaluated items.
- Don't make doomsday predictions. If items are unevaluated, that's just an information gap, not evidence of problems.
- Evidence can be "supporting" (confirms the hypothesis) or "challenging" (raises doubts or counter-arguments). Both types are valuable - challenges help identify risks and refine thinking.

Generate THREE separate paragraphs (respond in JSON format):

1. "validationPlan": One short paragraph (2-3 sentences) describing HOW this hypothesis will be validated. What are the key sub-hypotheses that need to be proven? If there are no sub-hypotheses, describe what would need to be true to validate this.

2. "progressSummary": One short paragraph (2-3 sentences) describing the CURRENT STATE of validation based on recorded data. For evaluated items, report their confidence. For proposed items, simply note they are "in progress" or "awaiting documentation" - don't assume the worst.

3. "biggerPicture": ${parentChain.length > 0 
  ? `One short paragraph (2-3 sentences) explaining how proving/disproving this hypothesis affects the parent hypotheses. Focus on the logical relationship, not dramatic stakes.`
  : `null (this is a root-level hypothesis with no parents)`}

Respond ONLY with valid JSON in this exact format:
{
  "validationPlan": "...",
  "progressSummary": "...",
  "biggerPicture": ${parentChain.length > 0 ? '"..."' : 'null'}
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
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
      validationPlan: string;
      progressSummary: string;
      biggerPicture: string | null;
    };

    return {
      validationPlan: result.validationPlan || "",
      progressSummary: result.progressSummary || "",
      biggerPicture: parentChain.length > 0 ? (result.biggerPicture || null) : null,
      success: true,
    };
  } catch (error) {
    console.error("AI executive summary generation error:", error);
    return {
      validationPlan: "",
      progressSummary: "",
      biggerPicture: null,
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate summary",
    };
  }
}
