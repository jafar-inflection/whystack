import { NextResponse } from "next/server";
import { recalculateAllConfidences } from "@/app/actions/hypotheses";

/**
 * POST /api/recalculate-confidence
 * 
 * One-time endpoint to recalculate confidence for all hypotheses
 * based on their evidence.
 * 
 * Usage: curl -X POST http://localhost:3000/api/recalculate-confidence
 */
export async function POST() {
  try {
    const result = await recalculateAllConfidences();
    
    if (result.ok) {
      return NextResponse.json(result.data);
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (error) {
    console.error("Recalculate confidence error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
