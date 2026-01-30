"use server";

import { prisma } from "@/lib/prisma";
import {
  EvidenceDirection,
  EvidenceKind,
  RefutationType,
  ActivityType,
  Prisma,
} from "@prisma/client";
import { calculateConfidence, calculateCascadingConfidence } from "@/lib/confidence";
import { logActivity } from "@/lib/activity";

// ============================================================================
// Types
// ============================================================================

export type ActionResult<T = unknown> = {
  ok: boolean;
  error?: string;
  data?: T;
};

// ============================================================================
// Helpers
// ============================================================================

function parseTags(tagsInput: string): string[] {
  const seen = new Set<string>();
  return tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((t) => {
      const lower = t.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ============================================================================
// Create Hypothesis
// ============================================================================

export async function createHypothesis(formData: {
  statement: string;
  description?: string;
  confidence: number;
  tags: string;
  ownerId?: string;
}): Promise<ActionResult> {
  try {
    const { statement, description, confidence, tags, ownerId } = formData;

    if (!statement || statement.trim().length === 0) {
      return { ok: false, error: "Statement is required" };
    }

    // Find the max order among root hypotheses (those with no parents)
    const rootHypotheses = await prisma.hypothesis.findMany({
      where: {
        isArchived: false,
        parents: { none: {} },
      },
      select: { order: true },
    });
    const maxOrder = rootHypotheses.length > 0 
      ? Math.max(...rootHypotheses.map(h => h.order)) 
      : -1;

    // Get owner name if ownerId is provided
    let ownerName: string | null = null;
    if (ownerId) {
      const owner = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { name: true },
      });
      ownerName = owner?.name || null;
    }

    const hypothesis = await prisma.hypothesis.create({
      data: {
        statement: statement.trim(),
        description: description?.trim() || null,
        confidence: clamp(confidence, 0, 100),
        tags: parseTags(tags),
        order: maxOrder + 1,
        ownerId: ownerId || null,
        ownerName,
      },
    });

    // Log activity
    await logActivity({
      hypothesisId: hypothesis.id,
      actorId: ownerId,
      actorName: ownerName,
      type: ActivityType.HYPOTHESIS_CREATED,
      summary: `Created hypothesis: ${hypothesis.statement}`,
    });

    return { ok: true, data: hypothesis };
  } catch (error) {
    console.error("createHypothesis error:", error);
    return { ok: false, error: "Failed to create hypothesis" };
  }
}

// ============================================================================
// Update Hypothesis
// ============================================================================

export async function updateHypothesis(
  id: string,
  formData: {
    statement: string;
    description?: string;
    confidence: number;
    tags: string;
    actorId?: string;
    actorName?: string;
  }
): Promise<ActionResult> {
  try {
    const { statement, description, confidence, tags, actorId, actorName } = formData;

    if (!statement || statement.trim().length === 0) {
      return { ok: false, error: "Statement is required" };
    }

    // Check existing values to detect what changed
    const existing = await prisma.hypothesis.findUnique({
      where: { id },
      select: { confidence: true, statement: true, description: true, tags: true },
    });
    
    const newConfidence = clamp(confidence, 0, 100);
    const confidenceChanged = existing && existing.confidence !== newConfidence;
    const statementChanged = existing && existing.statement !== statement.trim();
    const descriptionChanged = existing && existing.description !== (description?.trim() || null);
    const tagsChanged = existing && JSON.stringify(existing.tags) !== JSON.stringify(parseTags(tags));

    const hypothesis = await prisma.hypothesis.update({
      where: { id },
      data: {
        statement: statement.trim(),
        description: description?.trim() || null,
        confidence: newConfidence,
        tags: parseTags(tags),
        // Mark as manual if user changed confidence
        ...(confidenceChanged && { confidenceIsManual: true }),
      },
    });

    // Log appropriate activities
    if (statementChanged || descriptionChanged) {
      await logActivity({
        hypothesisId: id,
        actorId,
        actorName,
        type: ActivityType.HYPOTHESIS_UPDATED,
        summary: `Updated hypothesis: ${hypothesis.statement}`,
      });
    }

    if (confidenceChanged && existing) {
      await logActivity({
        hypothesisId: id,
        actorId,
        actorName,
        type: ActivityType.CONFIDENCE_CHANGED,
        summary: `Changed confidence from ${existing.confidence}% to ${newConfidence}%`,
        metadata: { oldConfidence: existing.confidence, newConfidence },
      });
    }

    if (tagsChanged) {
      await logActivity({
        hypothesisId: id,
        actorId,
        actorName,
        type: ActivityType.TAGS_CHANGED,
        summary: `Updated tags on: ${hypothesis.statement}`,
        metadata: { oldTags: existing?.tags, newTags: parseTags(tags) },
      });
    }

    // Mark content as updated (propagates to ancestors for executive summary staleness)
    await markContentUpdated(id);

    return { ok: true, data: hypothesis };
  } catch (error) {
    console.error("updateHypothesis error:", error);
    return { ok: false, error: "Failed to update hypothesis" };
  }
}

// ============================================================================
// Create Child Hypothesis and Edge
// ============================================================================

export async function createChildHypothesisAndEdge(
  parentId: string,
  formData: {
    statement: string;
    description?: string;
    confidence: number;
    tags: string;
    ownerId?: string;
  }
): Promise<ActionResult> {
  try {
    const { statement, description, confidence, tags, ownerId } = formData;

    if (!statement || statement.trim().length === 0) {
      return { ok: false, error: "Statement is required" };
    }

    // Get owner name if ownerId is provided
    let ownerName: string | null = null;
    if (ownerId) {
      const owner = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { name: true },
      });
      ownerName = owner?.name || null;
    }

    // Create child hypothesis and edge in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find the max order among existing children of this parent
      const existingEdges = await tx.hypothesisEdge.findMany({
        where: { parentId },
        select: { order: true },
      });
      const maxEdgeOrder = existingEdges.length > 0
        ? Math.max(...existingEdges.map(e => e.order))
        : -1;

      const child = await tx.hypothesis.create({
        data: {
          statement: statement.trim(),
          description: description?.trim() || null,
          confidence: clamp(confidence, 0, 100),
          tags: parseTags(tags),
          ownerId: ownerId || null,
          ownerName,
        },
      });

      await tx.hypothesisEdge.create({
        data: {
          parentId,
          childId: child.id,
          label: "depends on",
          order: maxEdgeOrder + 1,
        },
      });

      return child;
    });

    // Mark parent content as updated (propagates to ancestors for executive summary staleness)
    await markContentUpdated(parentId);

    // Log activities
    await logActivity({
      hypothesisId: result.id,
      actorId: ownerId,
      actorName: ownerName,
      type: ActivityType.HYPOTHESIS_CREATED,
      summary: `Created hypothesis: ${result.statement}`,
    });

    // Also log that a child was added to the parent
    await logActivity({
      hypothesisId: parentId,
      actorId: ownerId,
      actorName: ownerName,
      type: ActivityType.CHILD_ADDED,
      summary: `Linked "${result.statement}" as sub-hypothesis`,
      metadata: { childId: result.id, childStatement: result.statement },
    });

    return { ok: true, data: result };
  } catch (error) {
    console.error("createChildHypothesisAndEdge error:", error);
    return { ok: false, error: "Failed to create child hypothesis" };
  }
}

// ============================================================================
// Add Evidence
// ============================================================================

export async function addEvidence(
  hypothesisId: string,
  formData: {
    direction: EvidenceDirection;
    kind: EvidenceKind;
    strength: number;
    quality: number;
    summary: string;
    sourceUrl?: string;
  }
): Promise<ActionResult> {
  try {
    const { direction, kind, strength, quality, summary, sourceUrl } = formData;

    if (!summary || summary.trim().length === 0) {
      return { ok: false, error: "Summary is required" };
    }

    const evidence = await prisma.evidence.create({
      data: {
        hypothesisId,
        direction,
        kind,
        strength: clamp(strength, 1, 5),
        quality: clamp(quality, 1, 5),
        summary: summary.trim(),
        sourceUrl: sourceUrl?.trim() || null,
      },
    });

    return { ok: true, data: evidence };
  } catch (error) {
    console.error("addEvidence error:", error);
    return { ok: false, error: "Failed to add evidence" };
  }
}

// Simplified version - just takes summary text
// Uses AI to classify and auto-recalculates confidence with cascading
export async function addEvidenceSimple(
  hypothesisId: string,
  summary: string,
  actorId?: string,
  actorName?: string
): Promise<ActionResult> {
  try {
    if (!summary || summary.trim().length === 0) {
      return { ok: false, error: "Evidence text is required" };
    }

    // Get the hypothesis for context and to check if confidence is manual
    const hypothesis = await prisma.hypothesis.findUnique({
      where: { id: hypothesisId },
      select: { statement: true, confidenceIsManual: true },
    });

    if (!hypothesis) {
      return { ok: false, error: "Hypothesis not found" };
    }

    // If confidence is manually set, skip AI classification to save costs
    let classification: { direction: EvidenceDirection; strength: number } = { direction: "SUPPORTS", strength: 3 };
    if (!hypothesis.confidenceIsManual) {
      const { classifyEvidence } = await import("@/lib/ai/classify-evidence");
      classification = await classifyEvidence(hypothesis.statement, summary.trim());
    }

    // Create evidence with classification (AI or defaults)
    const evidence = await prisma.evidence.create({
      data: {
        hypothesisId,
        direction: classification.direction,
        kind: "RESEARCH", // Default
        strength: classification.strength,
        quality: 3, // Default
        summary: summary.trim(),
        sourceUrl: null,
      },
    });

    // Mark content as updated (propagates to ancestors for executive summary staleness)
    await markContentUpdated(hypothesisId);

    // Log activity
    await logActivity({
      hypothesisId,
      actorId,
      actorName,
      type: ActivityType.EVIDENCE_ADDED,
      summary: `Added evidence: ${summary.trim().slice(0, 100)}...`,
    });

    // Only recalculate confidence if not manually set
    let cascadeResult = null;
    if (!hypothesis.confidenceIsManual) {
      cascadeResult = await recalculateConfidenceWithCascade(hypothesisId);
    }

    return { 
      ok: true, 
      data: { 
        evidence,
        classification,
        cascadeResult,
        skippedAutoCalc: hypothesis.confidenceIsManual,
      } 
    };
  } catch (error) {
    console.error("addEvidenceSimple error:", error);
    return { ok: false, error: "Failed to add evidence" };
  }
}

// Add challenge (refuting evidence) to a hypothesis
export async function addChallengeSimple(
  hypothesisId: string,
  summary: string,
  actorId?: string,
  actorName?: string
): Promise<ActionResult> {
  try {
    if (!summary || summary.trim().length === 0) {
      return { ok: false, error: "Challenge text is required" };
    }

    // Get the hypothesis for context and to check if confidence is manual
    const hypothesis = await prisma.hypothesis.findUnique({
      where: { id: hypothesisId },
      select: { statement: true, confidenceIsManual: true },
    });

    if (!hypothesis) {
      return { ok: false, error: "Hypothesis not found" };
    }

    // If confidence is manually set, skip AI classification to save costs
    // Default to REFUTES for challenges
    let classification: { direction: EvidenceDirection; strength: number } = { direction: "REFUTES", strength: 3 };
    if (!hypothesis.confidenceIsManual) {
      const { classifyEvidence } = await import("@/lib/ai/classify-evidence");
      // Classify to get appropriate strength, but we'll override direction to be refuting
      const aiResult = await classifyEvidence(hypothesis.statement, summary.trim());
      // For challenges, force direction to be refuting (REFUTES or WEAKLY_REFUTES)
      // Use AI's strength assessment
      classification = {
        direction: aiResult.direction === "WEAKLY_REFUTES" || aiResult.direction === "REFUTES" 
          ? aiResult.direction 
          : "REFUTES",
        strength: aiResult.strength,
      };
    }

    // Create evidence with classification
    const evidence = await prisma.evidence.create({
      data: {
        hypothesisId,
        direction: classification.direction,
        kind: "RESEARCH", // Default
        strength: classification.strength,
        quality: 3, // Default
        summary: summary.trim(),
        sourceUrl: null,
      },
    });

    // Mark content as updated (propagates to ancestors for executive summary staleness)
    await markContentUpdated(hypothesisId);

    // Log activity
    await logActivity({
      hypothesisId,
      actorId,
      actorName,
      type: ActivityType.EVIDENCE_ADDED,
      summary: `Added challenge: ${summary.trim().slice(0, 100)}...`,
    });

    // Only recalculate confidence if not manually set
    let cascadeResult = null;
    if (!hypothesis.confidenceIsManual) {
      cascadeResult = await recalculateConfidenceWithCascade(hypothesisId);
    }

    return { 
      ok: true, 
      data: { 
        evidence,
        classification,
        cascadeResult,
        skippedAutoCalc: hypothesis.confidenceIsManual,
      } 
    };
  } catch (error) {
    console.error("addChallengeSimple error:", error);
    return { ok: false, error: "Failed to add challenge" };
  }
}

// Update evidence text and reclassify with AI
export async function updateEvidence(
  evidenceId: string,
  summary: string,
  actorId?: string,
  actorName?: string
): Promise<ActionResult> {
  try {
    if (!summary || summary.trim().length === 0) {
      return { ok: false, error: "Evidence text is required" };
    }

    // Get the evidence with its hypothesis (including confidenceIsManual)
    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: { hypothesis: { select: { id: true, statement: true, confidenceIsManual: true } } },
    });

    if (!evidence) {
      return { ok: false, error: "Evidence not found" };
    }

    // If confidence is manually set, skip AI reclassification to save costs
    let classification = { direction: evidence.direction, strength: evidence.strength };
    if (!evidence.hypothesis.confidenceIsManual) {
      const { classifyEvidence } = await import("@/lib/ai/classify-evidence");
      classification = await classifyEvidence(evidence.hypothesis.statement, summary.trim());
    }

    // Update evidence
    const updated = await prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        summary: summary.trim(),
        direction: classification.direction,
        strength: classification.strength,
      },
    });

    // Mark content as updated (propagates to ancestors for executive summary staleness)
    await markContentUpdated(evidence.hypothesis.id);

    // Log activity
    await logActivity({
      hypothesisId: evidence.hypothesis.id,
      actorId,
      actorName,
      type: ActivityType.EVIDENCE_UPDATED,
      summary: `Updated evidence: ${summary.trim().slice(0, 100)}...`,
    });

    // Only recalculate confidence if not manually set
    if (!evidence.hypothesis.confidenceIsManual) {
      await recalculateConfidenceWithCascade(evidence.hypothesis.id);
    }

    return {
      ok: true,
      data: {
        evidence: updated,
        classification,
        skippedAutoCalc: evidence.hypothesis.confidenceIsManual,
      },
    };
  } catch (error) {
    console.error("updateEvidence error:", error);
    return { ok: false, error: "Failed to update evidence" };
  }
}

// Delete evidence
export async function deleteEvidence(
  evidenceId: string,
  actorId?: string,
  actorName?: string
): Promise<ActionResult> {
  try {
    // Get the evidence with its hypothesis
    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: { hypothesis: { select: { id: true, statement: true, confidenceIsManual: true } } },
    });

    if (!evidence) {
      return { ok: false, error: "Evidence not found" };
    }

    // Delete the evidence
    await prisma.evidence.delete({
      where: { id: evidenceId },
    });

    // Mark content as updated
    await markContentUpdated(evidence.hypothesis.id);

    // Log activity
    await logActivity({
      hypothesisId: evidence.hypothesis.id,
      actorId,
      actorName,
      type: ActivityType.EVIDENCE_UPDATED, // Using UPDATED since we don't have DELETED
      summary: `Deleted evidence from: ${evidence.hypothesis.statement}`,
    });

    // Recalculate confidence if not manually set
    if (!evidence.hypothesis.confidenceIsManual) {
      await recalculateConfidenceWithCascade(evidence.hypothesis.id);
    }

    return { ok: true };
  } catch (error) {
    console.error("deleteEvidence error:", error);
    return { ok: false, error: "Failed to delete evidence" };
  }
}

/**
 * Recalculate confidence for a hypothesis and cascade up to all ancestors
 */
async function recalculateConfidenceWithCascade(hypothesisId: string): Promise<{
  updated: Array<{ id: string; old: number; new: number }>;
}> {
  const updated: Array<{ id: string; old: number; new: number }> = [];
  
  // Helper to get hypothesis with evidence and children
  async function getHypothesisData(id: string) {
    return prisma.hypothesis.findUnique({
      where: { id },
      include: {
        evidence: { select: { direction: true, strength: true } },
        children: { select: { childId: true } },
        parents: { select: { parentId: true } },
      },
    });
  }
  
  // Helper to calculate final confidence for a hypothesis
  async function calculateFinalConfidence(id: string): Promise<number> {
    const h = await getHypothesisData(id);
    if (!h) return 50;
    
    const ownConfidence = calculateConfidence(h.evidence);
    
    if (h.children.length === 0) {
      return ownConfidence;
    }
    
    // Get children's current confidences
    const childHypotheses = await prisma.hypothesis.findMany({
      where: { id: { in: h.children.map(c => c.childId) } },
      select: { confidence: true },
    });
    
    const childrenConfidences = childHypotheses.map(c => c.confidence);
    return calculateCascadingConfidence(ownConfidence, childrenConfidences);
  }
  
  // Start with the modified hypothesis and work up
  const toProcess = [hypothesisId];
  const processed = new Set<string>();
  
  while (toProcess.length > 0) {
    const currentId = toProcess.shift()!;
    if (processed.has(currentId)) continue;
    processed.add(currentId);
    
    const h = await getHypothesisData(currentId);
    if (!h) continue;
    
    const newConfidence = await calculateFinalConfidence(currentId);
    
    if (newConfidence !== h.confidence) {
      await prisma.hypothesis.update({
        where: { id: currentId },
        data: { confidence: newConfidence },
      });
      updated.push({ id: currentId, old: h.confidence, new: newConfidence });
    }
    
    // Add parents to process queue (cascade up)
    for (const parent of h.parents) {
      if (!processed.has(parent.parentId)) {
        toProcess.push(parent.parentId);
      }
    }
  }
  
  return { updated };
}

// ============================================================================
// Add Refutation
// ============================================================================

export async function addRefutation(
  hypothesisId: string,
  formData: {
    type: RefutationType;
    summary: string;
    proposedTest?: string;
    impact?: string;
  }
): Promise<ActionResult> {
  try {
    const { type, summary, proposedTest, impact } = formData;

    if (!summary || summary.trim().length === 0) {
      return { ok: false, error: "Summary is required" };
    }

    const refutation = await prisma.refutation.create({
      data: {
        hypothesisId,
        type,
        summary: summary.trim(),
        proposedTest: proposedTest?.trim() || null,
        impact: impact?.trim() || null,
      },
    });

    return { ok: true, data: refutation };
  } catch (error) {
    console.error("addRefutation error:", error);
    return { ok: false, error: "Failed to add refutation" };
  }
}

// ============================================================================
// Move Hypothesis to New Parent (Reparent)
// ============================================================================

/**
 * Move a hypothesis to become a child of a new parent.
 * Removes from old parent (if any) and adds edge to new parent.
 * Validates no cycles are created.
 */
export async function moveHypothesisToParent(
  hypothesisId: string,
  newParentId: string
): Promise<ActionResult> {
  try {
    // Prevent self-reference
    if (hypothesisId === newParentId) {
      return { ok: false, error: "Cannot make hypothesis a child of itself" };
    }

    // Check if this would create a cycle (newParent is a descendant of hypothesis)
    const wouldCreateCycle = await isDescendant(newParentId, hypothesisId);
    if (wouldCreateCycle) {
      return { ok: false, error: "Cannot move: would create a cycle (target is a descendant)" };
    }

    // Check if edge already exists
    const existingEdge = await prisma.hypothesisEdge.findFirst({
      where: { parentId: newParentId, childId: hypothesisId },
    });
    if (existingEdge) {
      return { ok: false, error: "This relationship already exists" };
    }

    await prisma.$transaction(async (tx) => {
      // Remove existing parent edges for this hypothesis
      await tx.hypothesisEdge.deleteMany({
        where: { childId: hypothesisId },
      });

      // Get max order for new parent's children
      const maxOrder = await tx.hypothesisEdge.aggregate({
        where: { parentId: newParentId },
        _max: { order: true },
      });

      // Create new edge
      await tx.hypothesisEdge.create({
        data: {
          parentId: newParentId,
          childId: hypothesisId,
          label: "depends on",
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });
    });

    return { ok: true };
  } catch (error) {
    console.error("moveHypothesisToParent error:", error);
    return { ok: false, error: "Failed to move hypothesis" };
  }
}

/**
 * Link an existing hypothesis as a child of a parent.
 * Unlike moveHypothesisToParent, this adds a NEW edge without removing existing parents.
 * (Supports multiple parents)
 */
export async function linkExistingHypothesis(
  parentId: string | null,
  childId: string,
  actorId?: string,
  actorName?: string
): Promise<ActionResult> {
  try {
    // If parentId is null, we're "linking" to root (removing all parents)
    if (parentId === null) {
      await prisma.hypothesisEdge.deleteMany({
        where: { childId },
      });
      return { ok: true };
    }

    // Prevent self-reference
    if (childId === parentId) {
      return { ok: false, error: "Cannot make hypothesis a child of itself" };
    }

    // Check if this would create a cycle
    const wouldCreateCycle = await isDescendant(parentId, childId);
    if (wouldCreateCycle) {
      return { ok: false, error: "Cannot link: would create a cycle (target is a descendant)" };
    }

    // Check if edge already exists
    const existingEdge = await prisma.hypothesisEdge.findFirst({
      where: { parentId, childId },
    });
    if (existingEdge) {
      return { ok: false, error: "This relationship already exists" };
    }

    // Get child hypothesis for logging
    const child = await prisma.hypothesis.findUnique({
      where: { id: childId },
      select: { statement: true },
    });

    // Get max order for parent's children
    const maxOrder = await prisma.hypothesisEdge.aggregate({
      where: { parentId },
      _max: { order: true },
    });

    // Create edge
    await prisma.hypothesisEdge.create({
      data: {
        parentId,
        childId,
        label: "depends on",
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    // Mark parent content as updated (propagates to ancestors for executive summary staleness)
    await markContentUpdated(parentId);

    // Log activity
    await logActivity({
      hypothesisId: parentId,
      actorId,
      actorName,
      type: ActivityType.CHILD_ADDED,
      summary: `Linked "${child?.statement || "hypothesis"}" as sub-hypothesis`,
      metadata: { childId, childStatement: child?.statement },
    });

    return { ok: true };
  } catch (error) {
    console.error("linkExistingHypothesis error:", error);
    return { ok: false, error: "Failed to link hypothesis" };
  }
}

/**
 * Mark a hypothesis and all its ancestors as having content updated
 * Used for executive summary staleness detection
 */
async function markContentUpdated(hypothesisId: string): Promise<void> {
  const now = new Date();
  const visited = new Set<string>();
  const queue = [hypothesisId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Update this hypothesis
    await prisma.hypothesis.update({
      where: { id: current },
      data: { contentUpdatedAt: now },
    });

    // Get parents and add to queue
    const edges = await prisma.hypothesisEdge.findMany({
      where: { childId: current },
      select: { parentId: true },
    });

    for (const edge of edges) {
      if (!visited.has(edge.parentId)) {
        queue.push(edge.parentId);
      }
    }
  }
}

/**
 * Check if potentialDescendant is a descendant of ancestorId
 * (i.e., ancestorId is in the parent chain of potentialDescendant)
 */
async function isDescendant(potentialDescendant: string, ancestorId: string): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [potentialDescendant];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    if (current === ancestorId) return true;

    // Get parents of current
    const edges = await prisma.hypothesisEdge.findMany({
      where: { childId: current },
      select: { parentId: true },
    });

    for (const edge of edges) {
      if (!visited.has(edge.parentId)) {
        queue.push(edge.parentId);
      }
    }
  }

  return false;
}

/**
 * Get all ancestor IDs of a hypothesis (for filtering autocomplete)
 */
export async function getAncestorIds(hypothesisId: string): Promise<string[]> {
  const ancestors: string[] = [];
  const visited = new Set<string>();
  const queue = [hypothesisId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const edges = await prisma.hypothesisEdge.findMany({
      where: { childId: current },
      select: { parentId: true },
    });

    for (const edge of edges) {
      ancestors.push(edge.parentId);
      if (!visited.has(edge.parentId)) {
        queue.push(edge.parentId);
      }
    }
  }

  return ancestors;
}

// ============================================================================
// Reorder Hypotheses
// ============================================================================

export async function reorderHypotheses(
  orderedIds: string[],
  parentId: string | null
): Promise<ActionResult> {
  try {
    if (parentId) {
      // Reorder children within a parent - update edge order
      await prisma.$transaction(
        orderedIds.map((childId, index) =>
          prisma.hypothesisEdge.updateMany({
            where: { parentId, childId },
            data: { order: index },
          })
        )
      );
    } else {
      // Reorder root hypotheses - update hypothesis order
      await prisma.$transaction(
        orderedIds.map((id, index) =>
          prisma.hypothesis.update({
            where: { id },
            data: { order: index },
          })
        )
      );
    }
    return { ok: true };
  } catch (error) {
    console.error("reorderHypotheses error:", error);
    return { ok: false, error: "Failed to reorder" };
  }
}

// ============================================================================
// Archive / Unarchive Hypothesis
// ============================================================================

export async function archiveHypothesis(
  id: string,
  isArchived: boolean,
  actorId?: string,
  actorName?: string
): Promise<ActionResult> {
  try {
    const hypothesis = await prisma.hypothesis.update({
      where: { id },
      data: { isArchived },
    });

    if (isArchived) {
      await logActivity({
        hypothesisId: id,
        actorId,
        actorName,
        type: ActivityType.HYPOTHESIS_ARCHIVED,
        summary: `Archived hypothesis: ${hypothesis.statement}`,
      });
    }

    return { ok: true, data: hypothesis };
  } catch (error) {
    console.error("archiveHypothesis error:", error);
    return { ok: false, error: "Failed to archive hypothesis" };
  }
}

// ============================================================================
// Delete Hypothesis
// ============================================================================

export async function deleteHypothesis(
  id: string,
  actorId?: string,
  actorName?: string
): Promise<ActionResult> {
  try {
    // Get parent IDs before deletion to log activity on parents
    const parentEdges = await prisma.hypothesisEdge.findMany({
      where: { childId: id },
      select: { parentId: true },
    });
    const hypothesis = await prisma.hypothesis.findUnique({
      where: { id },
      select: { statement: true },
    });

    // Delete in a transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
      // Delete all activity logs for this hypothesis first
      await tx.activityLog.deleteMany({
        where: { hypothesisId: id },
      });

      // Delete all edges where this hypothesis is a parent or child
      await tx.hypothesisEdge.deleteMany({
        where: {
          OR: [{ parentId: id }, { childId: id }],
        },
      });

      // Delete all evidence for this hypothesis
      await tx.evidence.deleteMany({
        where: { hypothesisId: id },
      });

      // Delete all refutations for this hypothesis
      await tx.refutation.deleteMany({
        where: { hypothesisId: id },
      });

      // Delete watchers
      await tx.hypothesisWatcher.deleteMany({
        where: { hypothesisId: id },
      });

      // Finally, delete the hypothesis itself
      await tx.hypothesis.delete({
        where: { id },
      });
    });

    // Log deletion activity on parent hypotheses (since the hypothesis itself is deleted)
    if (hypothesis && parentEdges.length > 0) {
      for (const edge of parentEdges) {
        await logActivity({
          hypothesisId: edge.parentId,
          actorId,
          actorName,
          type: ActivityType.HYPOTHESIS_DELETED,
          summary: `Deleted sub-hypothesis: ${hypothesis.statement}`,
          metadata: { deletedId: id, deletedStatement: hypothesis.statement },
        });
      }
    }

    return { ok: true };
  } catch (error) {
    console.error("deleteHypothesis error:", error);
    return { ok: false, error: "Failed to delete hypothesis" };
  }
}

// ============================================================================
// Fetch Hypotheses with Relations (for initial load)
// ============================================================================

export async function getHypothesesWithRelations() {
  return prisma.hypothesis.findMany({
    where: { isArchived: false },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      evidence: {
        orderBy: { createdAt: "desc" },
      },
      refutations: {
        orderBy: { createdAt: "desc" },
      },
      children: {
        orderBy: { order: "asc" },
        include: {
          child: {
            select: {
              id: true,
              statement: true,
              confidence: true,
              tags: true,
              isArchived: true,
            },
          },
        },
      },
      parents: {
        select: {
          parentId: true,
        },
      },
      owner: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      watchers: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      },
    },
  });
}

export type HypothesisWithRelations = Awaited<
  ReturnType<typeof getHypothesesWithRelations>
>[number];

// ============================================================================
// Confidence Calculation
// ============================================================================

/**
 * Recalculate and update confidence for a single hypothesis
 */
export async function recalculateConfidence(hypothesisId: string): Promise<ActionResult> {
  try {
    // Get all evidence for this hypothesis
    const evidence = await prisma.evidence.findMany({
      where: { hypothesisId },
      select: { direction: true, strength: true },
    });

    // Calculate new confidence
    const newConfidence = calculateConfidence(evidence);

    // Update the hypothesis
    const updated = await prisma.hypothesis.update({
      where: { id: hypothesisId },
      data: { confidence: newConfidence },
    });

    return { ok: true, data: { confidence: updated.confidence } };
  } catch (error) {
    console.error("recalculateConfidence error:", error);
    return { ok: false, error: "Failed to recalculate confidence" };
  }
}

/**
 * Recalculate confidence for ALL hypotheses with cascading (one-time migration)
 * 
 * Process:
 * 1. Calculate base confidence (from own evidence) for each hypothesis
 * 2. Process from leaves up to roots (topological order)
 * 3. For each hypothesis with children, combine own confidence with children's
 * 
 * Cascading formula:
 * - Each component (own + each child) has weight 1/(n+1) where n = number of children
 * - Example with 2 children: final = (own + child1 + child2) / 3
 */
export async function recalculateAllConfidences(): Promise<ActionResult> {
  try {
    // Get all hypotheses with evidence and relationships
    const hypotheses = await prisma.hypothesis.findMany({
      include: {
        evidence: {
          select: { direction: true, strength: true },
        },
        children: {
          select: { childId: true },
        },
        parents: {
          select: { parentId: true },
        },
      },
    });

    // Build lookup maps
    const hypothesisMap = new Map(hypotheses.map(h => [h.id, h]));
    
    // Calculate base confidence (from own evidence only) for each
    const baseConfidences = new Map<string, number>();
    for (const h of hypotheses) {
      baseConfidences.set(h.id, calculateConfidence(h.evidence));
    }

    // Topological sort: process leaves first, then parents
    // A hypothesis is ready to process when all its children have been processed
    const finalConfidences = new Map<string, number>();
    const processed = new Set<string>();
    
    function canProcess(h: typeof hypotheses[0]): boolean {
      // Can process if all children have been processed
      return h.children.every(c => processed.has(c.childId));
    }
    
    function processHypothesis(h: typeof hypotheses[0]): number {
      const ownConfidence = baseConfidences.get(h.id) ?? 50;
      
      if (h.children.length === 0) {
        // Leaf node: just use own confidence
        return ownConfidence;
      }
      
      // Get children's final confidences
      const childrenConfidences = h.children.map(c => 
        finalConfidences.get(c.childId) ?? 50
      );
      
      // Calculate cascading confidence
      return calculateCascadingConfidence(ownConfidence, childrenConfidences);
    }

    // Process in waves until all are done
    let remaining = [...hypotheses];
    while (remaining.length > 0) {
      const nextRemaining: typeof hypotheses = [];
      
      for (const h of remaining) {
        if (canProcess(h)) {
          const finalConf = processHypothesis(h);
          finalConfidences.set(h.id, finalConf);
          processed.add(h.id);
        } else {
          nextRemaining.push(h);
        }
      }
      
      // Safety check: if nothing processed, we have a cycle
      if (nextRemaining.length === remaining.length) {
        console.error("Cycle detected in hypothesis graph");
        break;
      }
      
      remaining = nextRemaining;
    }

    // Update all hypotheses with new confidences
    let updated = 0;
    const updates: Array<{ id: string; old: number; new: number; base: number }> = [];
    
    for (const h of hypotheses) {
      const newConfidence = finalConfidences.get(h.id) ?? h.confidence;
      
      if (newConfidence !== h.confidence) {
        await prisma.hypothesis.update({
          where: { id: h.id },
          data: { confidence: newConfidence },
        });
        updates.push({
          id: h.id,
          old: h.confidence,
          new: newConfidence,
          base: baseConfidences.get(h.id) ?? 50,
        });
        updated++;
      }
    }

    return { 
      ok: true, 
      data: { 
        total: hypotheses.length, 
        updated,
        updates,
        message: `Recalculated ${updated} of ${hypotheses.length} hypotheses with cascading` 
      } 
    };
  } catch (error) {
    console.error("recalculateAllConfidences error:", error);
    return { ok: false, error: "Failed to recalculate confidences" };
  }
}

// ============================================================================
// Generate Executive Summary
// ============================================================================

import { generateExecutiveSummary, HypothesisContext, ParentContext } from "@/lib/ai/generate-summary";

export interface ExecutiveSummaryData {
  validationPlan: string;
  progressSummary: string;
  biggerPicture: string | null;
}

/**
 * Determine if a hypothesis is "NEW" (not yet evaluated)
 * A hypothesis is NEW if it has:
 * - No evidence
 * - No tags
 * - Default confidence (50)
 */
function isHypothesisNew(confidence: number, evidenceCount: number, tagsCount: number): boolean {
  return evidenceCount === 0 && tagsCount === 0 && confidence === 50;
}

/**
 * Count supporting vs challenging evidence
 */
function countEvidenceByType(evidence: Array<{ direction: string }>) {
  let supportCount = 0;
  let challengeCount = 0;
  for (const ev of evidence) {
    if (ev.direction === "SUPPORTS" || ev.direction === "WEAKLY_SUPPORTS" || ev.direction === "NEUTRAL") {
      supportCount++;
    } else if (ev.direction === "REFUTES" || ev.direction === "WEAKLY_REFUTES") {
      challengeCount++;
    }
  }
  return { supportCount, challengeCount };
}

/**
 * Recursively fetch all children and sub-children for a hypothesis
 */
async function fetchChildrenTree(hypothesisId: string, visited: Set<string> = new Set()): Promise<HypothesisContext[]> {
  // Prevent infinite loops in case of circular references
  if (visited.has(hypothesisId)) return [];
  visited.add(hypothesisId);

  const edges = await prisma.hypothesisEdge.findMany({
    where: { parentId: hypothesisId },
    include: {
      child: {
        select: {
          id: true,
          statement: true,
          confidence: true,
          tags: true,
          evidence: {
            select: { direction: true },
          },
        },
      },
    },
    orderBy: { order: "asc" },
  });

  const children: HypothesisContext[] = [];
  for (const edge of edges) {
    const subChildren = await fetchChildrenTree(edge.child.id, visited);
    const { supportCount, challengeCount } = countEvidenceByType(edge.child.evidence);
    const totalEvidenceCount = supportCount + challengeCount;
    const isNew = isHypothesisNew(
      edge.child.confidence,
      totalEvidenceCount,
      edge.child.tags.length
    );
    children.push({
      statement: edge.child.statement,
      confidence: edge.child.confidence,
      isNew,
      supportCount,
      challengeCount,
      children: subChildren,
    });
  }

  return children;
}

/**
 * Fetch the parent chain from immediate parent to root
 */
async function fetchParentChain(hypothesisId: string, visited: Set<string> = new Set()): Promise<ParentContext[]> {
  if (visited.has(hypothesisId)) return [];
  visited.add(hypothesisId);

  const parentEdge = await prisma.hypothesisEdge.findFirst({
    where: { childId: hypothesisId },
    include: {
      parent: {
        select: {
          id: true,
          statement: true,
          confidence: true,
          tags: true,
          _count: {
            select: { evidence: true },
          },
        },
      },
    },
  });

  if (!parentEdge) return [];

  const isNew = isHypothesisNew(
    parentEdge.parent.confidence,
    parentEdge.parent._count.evidence,
    parentEdge.parent.tags.length
  );

  const thisParent: ParentContext = {
    statement: parentEdge.parent.statement,
    confidence: parentEdge.parent.confidence,
    isNew,
  };

  // Recursively get grandparents
  const grandparents = await fetchParentChain(parentEdge.parent.id, visited);

  return [thisParent, ...grandparents];
}

export async function generateAIExecutiveSummary(hypothesisId: string): Promise<ActionResult<ExecutiveSummaryData & { generatedAt: Date }>> {
  try {
    const hypothesis = await prisma.hypothesis.findUnique({
      where: { id: hypothesisId },
      select: {
        id: true,
        statement: true,
        confidence: true,
        tags: true,
        _count: {
          select: { evidence: true },
        },
      },
    });

    if (!hypothesis) {
      return { ok: false, error: "Hypothesis not found" };
    }

    const isNew = isHypothesisNew(
      hypothesis.confidence,
      hypothesis._count.evidence,
      hypothesis.tags.length
    );

    // Fetch all children recursively
    const children = await fetchChildrenTree(hypothesisId);

    // Fetch parent chain
    const parentChain = await fetchParentChain(hypothesisId);

    // Generate executive summary using AI
    const result = await generateExecutiveSummary(
      hypothesis.statement,
      hypothesis.confidence,
      isNew,
      children,
      parentChain
    );

    if (!result.success) {
      return { ok: false, error: result.error || "Failed to generate summary" };
    }

    // Save the generated summary to the database
    const now = new Date();
    await prisma.hypothesis.update({
      where: { id: hypothesisId },
      data: {
        execSummaryValidation: result.validationPlan,
        execSummaryProgress: result.progressSummary,
        execSummaryBigPicture: result.biggerPicture,
        execSummaryGeneratedAt: now,
      },
    });

    return { 
      ok: true, 
      data: { 
        validationPlan: result.validationPlan,
        progressSummary: result.progressSummary,
        biggerPicture: result.biggerPicture,
        generatedAt: now,
      } 
    };
  } catch (error) {
    console.error("generateAIExecutiveSummary error:", error);
    return { ok: false, error: "Failed to generate executive summary" };
  }
}

/**
 * Delete the cached executive summary for a hypothesis
 */
export async function deleteExecutiveSummary(hypothesisId: string): Promise<ActionResult> {
  try {
    await prisma.hypothesis.update({
      where: { id: hypothesisId },
      data: {
        execSummaryValidation: null,
        execSummaryProgress: null,
        execSummaryBigPicture: null,
        execSummaryGeneratedAt: null,
      },
    });

    return { ok: true };
  } catch (error) {
    console.error("deleteExecutiveSummary error:", error);
    return { ok: false, error: "Failed to delete executive summary" };
  }
}

// ============================================================================
// AI Validation Suggestions
// ============================================================================

import { suggestValidations, ValidationSuggestion } from "@/lib/ai/suggest-validations";

export interface ValidationSuggestionsData {
  suggestions: ValidationSuggestion[];
  generatedAt?: Date;
}

/**
 * Generate AI suggestions for sub-hypotheses that would help validate the parent
 * Stores the suggestions in the database for persistence
 */
export async function generateValidationSuggestions(
  hypothesisId: string
): Promise<ActionResult<ValidationSuggestionsData>> {
  try {
    // Get the hypothesis with existing children and evidence
    const hypothesis = await prisma.hypothesis.findUnique({
      where: { id: hypothesisId },
      include: {
        children: {
          include: {
            child: {
              select: { statement: true },
            },
          },
        },
        evidence: {
          select: { summary: true, direction: true },
        },
      },
    });

    if (!hypothesis) {
      return { ok: false, error: "Hypothesis not found" };
    }

    // Get existing child statements to avoid duplicates
    const existingChildren = hypothesis.children.map((edge) => edge.child.statement);

    // Separate supporting evidence from challenges
    const supportingEvidence = hypothesis.evidence
      .filter((e) => e.direction === "SUPPORTS" || e.direction === "WEAKLY_SUPPORTS" || e.direction === "NEUTRAL")
      .map((e) => e.summary);
    const challenges = hypothesis.evidence
      .filter((e) => e.direction === "REFUTES" || e.direction === "WEAKLY_REFUTES")
      .map((e) => e.summary);

    // Generate suggestions
    const result = await suggestValidations(
      hypothesis.statement,
      hypothesis.description,
      existingChildren,
      supportingEvidence,
      challenges
    );

    if (!result.success) {
      return { ok: false, error: result.error || "Failed to generate suggestions" };
    }

    // Store suggestions in database
    const now = new Date();
    await prisma.hypothesis.update({
      where: { id: hypothesisId },
      data: {
        validationSuggestions: result.suggestions as unknown as Prisma.InputJsonValue,
        validationSuggestionsAt: now,
      },
    });

    return {
      ok: true,
      data: {
        suggestions: result.suggestions,
        generatedAt: now,
      },
    };
  } catch (error) {
    console.error("generateValidationSuggestions error:", error);
    return { ok: false, error: "Failed to generate validation suggestions" };
  }
}

/**
 * Remove a specific suggestion from the stored list (after adding it as a child)
 */
export async function removeValidationSuggestion(
  hypothesisId: string,
  suggestionIndex: number
): Promise<ActionResult> {
  try {
    const hypothesis = await prisma.hypothesis.findUnique({
      where: { id: hypothesisId },
      select: { validationSuggestions: true },
    });

    if (!hypothesis || !hypothesis.validationSuggestions) {
      return { ok: false, error: "No suggestions found" };
    }

    const suggestions = hypothesis.validationSuggestions as unknown as ValidationSuggestion[];
    const updatedSuggestions = suggestions.filter((_, i) => i !== suggestionIndex);

    await prisma.hypothesis.update({
      where: { id: hypothesisId },
      data: {
        validationSuggestions: updatedSuggestions as unknown as Prisma.InputJsonValue,
      },
    });

    return { ok: true };
  } catch (error) {
    console.error("removeValidationSuggestion error:", error);
    return { ok: false, error: "Failed to remove suggestion" };
  }
}

/**
 * Delete all validation suggestions for a hypothesis
 */
export async function deleteValidationSuggestions(
  hypothesisId: string
): Promise<ActionResult> {
  try {
    await prisma.hypothesis.update({
      where: { id: hypothesisId },
      data: {
        validationSuggestions: Prisma.JsonNull,
        validationSuggestionsAt: null,
      },
    });

    return { ok: true };
  } catch (error) {
    console.error("deleteValidationSuggestions error:", error);
    return { ok: false, error: "Failed to delete suggestions" };
  }
}

// ============================================================================
// Ownership & Watchers
// ============================================================================

/**
 * Get all users (for owner picker)
 */
export async function getAllUsers(): Promise<ActionResult<Array<{ id: string; name: string | null; email: string; image: string | null }>>> {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
      orderBy: { name: "asc" },
    });
    return { ok: true, data: users };
  } catch (error) {
    console.error("getAllUsers error:", error);
    return { ok: false, error: "Failed to get users" };
  }
}

/**
 * Set the owner of a hypothesis
 */
export async function setHypothesisOwner(
  hypothesisId: string,
  ownerId: string | null,
  actorId?: string,
  actorName?: string
): Promise<ActionResult> {
  try {
    let ownerName: string | null = null;
    if (ownerId) {
      const owner = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { name: true },
      });
      ownerName = owner?.name || null;
    }

    const hypothesis = await prisma.hypothesis.update({
      where: { id: hypothesisId },
      data: {
        ownerId,
        ownerName,
      },
    });

    // Log activity
    await logActivity({
      hypothesisId,
      actorId,
      actorName,
      type: ActivityType.OWNER_CHANGED,
      summary: `Assigned to ${ownerName || "no one"}`,
      metadata: { newOwnerId: ownerId, newOwnerName: ownerName },
    });

    return { ok: true };
  } catch (error) {
    console.error("setHypothesisOwner error:", error);
    return { ok: false, error: "Failed to set owner" };
  }
}

/**
 * Watch a hypothesis
 */
export async function watchHypothesis(
  hypothesisId: string,
  userId: string
): Promise<ActionResult> {
  try {
    // Check if already watching
    const existing = await prisma.hypothesisWatcher.findUnique({
      where: {
        hypothesisId_userId: { hypothesisId, userId },
      },
    });

    if (existing) {
      return { ok: true }; // Already watching
    }

    await prisma.hypothesisWatcher.create({
      data: {
        hypothesisId,
        userId,
      },
    });

    return { ok: true };
  } catch (error) {
    console.error("watchHypothesis error:", error);
    return { ok: false, error: "Failed to watch hypothesis" };
  }
}

/**
 * Unwatch a hypothesis
 */
export async function unwatchHypothesis(
  hypothesisId: string,
  userId: string
): Promise<ActionResult> {
  try {
    await prisma.hypothesisWatcher.deleteMany({
      where: {
        hypothesisId,
        userId,
      },
    });

    return { ok: true };
  } catch (error) {
    console.error("unwatchHypothesis error:", error);
    return { ok: false, error: "Failed to unwatch hypothesis" };
  }
}

/**
 * Check if a user is watching a hypothesis
 */
export async function isWatchingHypothesis(
  hypothesisId: string,
  userId: string
): Promise<ActionResult<boolean>> {
  try {
    const watcher = await prisma.hypothesisWatcher.findUnique({
      where: {
        hypothesisId_userId: { hypothesisId, userId },
      },
    });

    return { ok: true, data: !!watcher };
  } catch (error) {
    console.error("isWatchingHypothesis error:", error);
    return { ok: false, error: "Failed to check watch status" };
  }
}

/**
 * Get watchers for a hypothesis
 */
export async function getHypothesisWatchers(
  hypothesisId: string
): Promise<ActionResult<Array<{ id: string; name: string | null; email: string; image: string | null }>>> {
  try {
    const watchers = await prisma.hypothesisWatcher.findMany({
      where: { hypothesisId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    return { ok: true, data: watchers.map((w) => w.user) };
  } catch (error) {
    console.error("getHypothesisWatchers error:", error);
    return { ok: false, error: "Failed to get watchers" };
  }
}

// ============================================================================
// Graph View Positions
// ============================================================================

/**
 * Save the position of a hypothesis node in the graph view
 */
export async function saveNodePosition(
  hypothesisId: string,
  x: number,
  y: number
): Promise<ActionResult> {
  try {
    await prisma.hypothesis.update({
      where: { id: hypothesisId },
      data: {
        graphX: x,
        graphY: y,
      },
    });

    return { ok: true };
  } catch (error) {
    console.error("saveNodePosition error:", error);
    return { ok: false, error: "Failed to save position" };
  }
}

/**
 * Save positions for multiple nodes at once (batch update)
 */
export async function saveNodePositions(
  positions: Array<{ id: string; x: number; y: number }>
): Promise<ActionResult> {
  try {
    await prisma.$transaction(
      positions.map((pos) =>
        prisma.hypothesis.update({
          where: { id: pos.id },
          data: {
            graphX: pos.x,
            graphY: pos.y,
          },
        })
      )
    );

    return { ok: true };
  } catch (error) {
    console.error("saveNodePositions error:", error);
    return { ok: false, error: "Failed to save positions" };
  }
}
