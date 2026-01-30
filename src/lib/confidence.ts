/**
 * Confidence Calculation
 * 
 * Calculates hypothesis confidence based on evidence.
 * 
 * Formula:
 * - Start at base confidence (50)
 * - Each evidence contributes: direction_weight × strength × scale_factor
 * - Direction weights: SUPPORTS=+1, WEAKLY_SUPPORTS=+0.5, NEUTRAL=0, WEAKLY_REFUTES=-0.5, REFUTES=-1
 * - Scale factor adjusts how much each evidence affects the score (default: 3)
 * - Result is clamped to 0-100
 * 
 * Example:
 * - 2 supporting (strength 4) evidence: 50 + (2 × 1 × 4 × 3) = 74
 * - 1 refuting (strength 5) evidence: 74 + (1 × -1 × 5 × 3) = 59
 */

import type { EvidenceDirection } from "@prisma/client";

export interface EvidenceForCalculation {
  direction: EvidenceDirection;
  strength: number;
}

// Direction weights: positive supports hypothesis, negative refutes it
const DIRECTION_WEIGHTS: Record<EvidenceDirection, number> = {
  SUPPORTS: 1,
  WEAKLY_SUPPORTS: 0.5,
  NEUTRAL: 0,
  WEAKLY_REFUTES: -0.5,
  REFUTES: -1,
};

// How much each evidence point affects the confidence score
const SCALE_FACTOR = 3;

// Base confidence when no evidence exists
const BASE_CONFIDENCE = 50;

/**
 * Calculate confidence score from evidence
 * @param evidence Array of evidence with direction and strength
 * @returns Confidence score 0-100
 */
export function calculateConfidence(evidence: EvidenceForCalculation[]): number {
  if (evidence.length === 0) {
    return BASE_CONFIDENCE;
  }

  let totalScore = 0;

  for (const ev of evidence) {
    const directionWeight = DIRECTION_WEIGHTS[ev.direction];
    const strength = Math.max(1, Math.min(5, ev.strength)); // Clamp strength to 1-5
    totalScore += directionWeight * strength * SCALE_FACTOR;
  }

  // Calculate final confidence
  const confidence = BASE_CONFIDENCE + totalScore;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(confidence)));
}

/**
 * Determine what the new confidence would be after adding evidence
 */
export function calculateNewConfidence(
  currentEvidence: EvidenceForCalculation[],
  newEvidence: EvidenceForCalculation
): number {
  return calculateConfidence([...currentEvidence, newEvidence]);
}

/**
 * Calculate cascading confidence for a hypothesis with children
 * 
 * Formula:
 * - Each component (own evidence + each child) has equal weight = 1/(n+1)
 * - Where n = number of children
 * 
 * Examples:
 * - 1 child: own=50%, child=50% → (own + child) / 2
 * - 2 children: own=33%, child1=33%, child2=33% → (own + child1 + child2) / 3
 * - 3 children: each has 25% weight → average of all 4
 * 
 * @param ownConfidence Confidence from this hypothesis's own evidence
 * @param childrenConfidences Array of children's final confidences
 * @returns Combined confidence score 0-100
 */
export function calculateCascadingConfidence(
  ownConfidence: number,
  childrenConfidences: number[]
): number {
  if (childrenConfidences.length === 0) {
    return ownConfidence;
  }

  const totalComponents = 1 + childrenConfidences.length; // own + children
  const sumConfidences = ownConfidence + childrenConfidences.reduce((a, b) => a + b, 0);
  const cascadedConfidence = sumConfidences / totalComponents;

  return Math.max(0, Math.min(100, Math.round(cascadedConfidence)));
}
