import { prisma } from "./prisma";
import { ActivityType } from "@prisma/client";

interface LogActivityParams {
  hypothesisId: string;
  actorId?: string | null;
  actorName?: string | null;
  type: ActivityType;
  summary: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an activity for a hypothesis
 */
export async function logActivity({
  hypothesisId,
  actorId,
  actorName,
  type,
  summary,
  metadata,
}: LogActivityParams): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        hypothesisId,
        actorId: actorId || null,
        actorName: actorName || null,
        type,
        summary,
        metadata: metadata || null,
      },
    });
  } catch (error) {
    // Log but don't throw - activity logging shouldn't break main operations
    console.error("Failed to log activity:", error);
  }
}

/**
 * Get activities for hypotheses a user owns or watches
 * Grouped by day for digest display
 */
export async function getActivitiesForUser(
  userId: string,
  options?: {
    since?: Date;
    limit?: number;
  }
) {
  const { since, limit = 100 } = options || {};

  // Get hypothesis IDs the user owns or watches
  const [ownedHypotheses, watchedHypotheses] = await Promise.all([
    prisma.hypothesis.findMany({
      where: { ownerId: userId, isArchived: false },
      select: { id: true },
    }),
    prisma.hypothesisWatcher.findMany({
      where: { userId },
      select: { hypothesisId: true },
    }),
  ]);

  const hypothesisIds = new Set([
    ...ownedHypotheses.map((h) => h.id),
    ...watchedHypotheses.map((w) => w.hypothesisId),
  ]);

  if (hypothesisIds.size === 0) {
    return [];
  }

  // Get activities for these hypotheses, excluding own actions
  const activities = await prisma.activityLog.findMany({
    where: {
      hypothesisId: { in: Array.from(hypothesisIds) },
      actorId: { not: userId }, // Don't show user's own activities
      ...(since && { createdAt: { gte: since } }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      hypothesis: {
        select: {
          id: true,
          statement: true,
          ownerId: true,
        },
      },
    },
  });

  return activities;
}

/**
 * Get activities grouped by day
 */
export function groupActivitiesByDay(
  activities: Array<{
    id: string;
    hypothesisId: string;
    actorName: string | null;
    type: ActivityType;
    summary: string;
    createdAt: Date;
    hypothesis: {
      id: string;
      statement: string;
      ownerId: string | null;
    };
  }>
) {
  const groups: Map<
    string,
    Array<(typeof activities)[number]>
  > = new Map();

  for (const activity of activities) {
    const dateKey = activity.createdAt.toISOString().split("T")[0];
    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(activity);
  }

  // Convert to array sorted by date (most recent first)
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({
      date,
      activities: items,
    }));
}

/**
 * Format activity for display
 */
export function formatActivitySummary(
  type: ActivityType,
  actorName: string | null,
  hypothesisStatement: string,
  metadata?: Record<string, unknown> | null
): string {
  const actor = actorName || "Someone";
  const hypothesis = hypothesisStatement.length > 50
    ? hypothesisStatement.slice(0, 50) + "..."
    : hypothesisStatement;

  switch (type) {
    case "HYPOTHESIS_CREATED":
      return `${actor} created "${hypothesis}"`;
    case "HYPOTHESIS_UPDATED":
      return `${actor} updated "${hypothesis}"`;
    case "CONFIDENCE_CHANGED":
      const oldConf = (metadata?.oldConfidence as number) || 0;
      const newConf = (metadata?.newConfidence as number) || 0;
      return `${actor} changed confidence from ${oldConf}% to ${newConf}% on "${hypothesis}"`;
    case "EVIDENCE_ADDED":
      return `${actor} added evidence to "${hypothesis}"`;
    case "EVIDENCE_UPDATED":
      return `${actor} updated evidence on "${hypothesis}"`;
    case "TAGS_CHANGED":
      return `${actor} updated tags on "${hypothesis}"`;
    case "OWNER_CHANGED":
      const newOwner = (metadata?.newOwnerName as string) || "someone";
      return `${actor} assigned "${hypothesis}" to ${newOwner}`;
    case "CHILD_ADDED":
      const childName = (metadata?.childStatement as string) || "a hypothesis";
      return `${actor} linked "${childName}" as a sub-hypothesis of "${hypothesis}"`;
    case "HYPOTHESIS_ARCHIVED":
      return `${actor} archived "${hypothesis}"`;
    case "HYPOTHESIS_DELETED":
      return `${actor} deleted "${hypothesis}"`;
    default:
      return `${actor} made changes to "${hypothesis}"`;
  }
}
