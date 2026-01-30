import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyEvidence } from "@/lib/ai/classify-evidence";
import { calculateConfidence } from "@/lib/confidence";

export async function POST() {
  // Get all evidence with their hypothesis statements
  const allEvidence = await prisma.evidence.findMany({
    include: {
      hypothesis: {
        select: { id: true, statement: true },
      },
    },
  });

  const results = [];
  const hypothesesToUpdate = new Set<string>();

  for (const evidence of allEvidence) {
    const oldDirection = evidence.direction;
    const oldStrength = evidence.strength;

    // Classify with AI
    const classification = await classifyEvidence(
      evidence.hypothesis.statement,
      evidence.summary
    );

    // Update if changed
    if (
      classification.direction !== oldDirection ||
      classification.strength !== oldStrength
    ) {
      await prisma.evidence.update({
        where: { id: evidence.id },
        data: {
          direction: classification.direction,
          strength: classification.strength,
        },
      });

      hypothesesToUpdate.add(evidence.hypothesis.id);

      results.push({
        evidenceId: evidence.id,
        summary: evidence.summary.substring(0, 50),
        oldDirection,
        newDirection: classification.direction,
        oldStrength,
        newStrength: classification.strength,
        reasoning: classification.reasoning,
      });
    }
  }

  // Recalculate confidence for affected hypotheses
  const confidenceUpdates = [];
  for (const hypothesisId of hypothesesToUpdate) {
    const hypothesis = await prisma.hypothesis.findUnique({
      where: { id: hypothesisId },
      include: { evidence: true },
    });

    if (hypothesis) {
      const newConfidence = calculateConfidence(hypothesis.evidence);
      if (newConfidence !== hypothesis.confidence) {
        await prisma.hypothesis.update({
          where: { id: hypothesisId },
          data: { confidence: newConfidence },
        });
        confidenceUpdates.push({
          hypothesisId,
          oldConfidence: hypothesis.confidence,
          newConfidence,
        });
      }
    }
  }

  return NextResponse.json({
    evidenceReclassified: results.length,
    confidenceUpdated: confidenceUpdates.length,
    details: {
      evidence: results,
      confidence: confidenceUpdates,
    },
  });
}
