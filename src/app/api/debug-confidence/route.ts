import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateConfidence } from "@/lib/confidence";

export async function GET() {
  const hypotheses = await prisma.hypothesis.findMany({
    where: { evidence: { some: {} } },
    include: { evidence: true },
  });

  const results = hypotheses.map((h) => {
    const evidenceDetails = h.evidence.map((e) => ({
      id: e.id,
      summary: e.summary.substring(0, 50),
      direction: e.direction,
      strength: e.strength,
    }));

    const calculatedConfidence = calculateConfidence(h.evidence);

    return {
      hypothesisId: h.id,
      statement: h.statement.substring(0, 60) + "...",
      currentConfidence: h.confidence,
      calculatedConfidence,
      needsUpdate: h.confidence !== calculatedConfidence,
      evidence: evidenceDetails,
    };
  });

  return NextResponse.json(results, { status: 200 });
}
