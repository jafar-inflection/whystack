"use server";

import { prisma } from "@/lib/prisma";
import { ActivityType } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import { getCompanyContext } from "@/app/actions/settings";

export type ActivityWithHypothesis = {
  id: string;
  hypothesisId: string;
  actorId: string | null;
  actorName: string | null;
  type: ActivityType;
  summary: string;
  metadata: unknown;
  createdAt: Date;
  hypothesis: {
    id: string;
    statement: string;
    ownerId: string | null;
  };
};

export type ActivityGroup = {
  date: string;
  activities: ActivityWithHypothesis[];
};

/**
 * Get activities for hypotheses a user owns or watches
 */
export async function getActivitiesForUser(
  userId: string,
  options?: {
    since?: Date;
    limit?: number;
  }
): Promise<{ ok: boolean; data?: ActivityGroup[]; error?: string }> {
  try {
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
      return { ok: true, data: [] };
    }

    // Get activities for these hypotheses
    // TODO: Uncomment the actorId filter after testing
    const activities = await prisma.activityLog.findMany({
      where: {
        hypothesisId: { in: Array.from(hypothesisIds) },
        // actorId: { not: userId }, // Don't show user's own activities - TEMPORARILY DISABLED FOR TESTING
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

    // Group by day
    const groups: Map<string, ActivityWithHypothesis[]> = new Map();

    for (const activity of activities) {
      const dateKey = activity.createdAt.toISOString().split("T")[0];
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(activity as ActivityWithHypothesis);
    }

    // Convert to array sorted by date (most recent first)
    const result = Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        activities: items,
      }));

    return { ok: true, data: result };
  } catch (error) {
    console.error("getActivitiesForUser error:", error);
    return { ok: false, error: "Failed to get activities" };
  }
}

/**
 * Clear all activities for hypotheses a user owns or watches
 */
export async function clearActivitiesForUser(
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
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
      return { ok: true };
    }

    // Delete activities for these hypotheses
    await prisma.activityLog.deleteMany({
      where: {
        hypothesisId: { in: Array.from(hypothesisIds) },
      },
    });

    return { ok: true };
  } catch (error) {
    console.error("clearActivitiesForUser error:", error);
    return { ok: false, error: "Failed to clear activities" };
  }
}

/**
 * Get count of unread activities (activities since last visit)
 */
export async function getUnreadActivityCount(
  userId: string,
  since: Date
): Promise<{ ok: boolean; data?: number; error?: string }> {
  try {
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
      return { ok: true, data: 0 };
    }

    // TODO: Uncomment the actorId filter after testing
    const count = await prisma.activityLog.count({
      where: {
        hypothesisId: { in: Array.from(hypothesisIds) },
        // actorId: { not: userId }, // TEMPORARILY DISABLED FOR TESTING
        createdAt: { gte: since },
      },
    });

    return { ok: true, data: count };
  } catch (error) {
    console.error("getUnreadActivityCount error:", error);
    return { ok: false, error: "Failed to get unread count" };
  }
}

/**
 * Generate an AI summary of all activities in the past week for hypotheses user owns/watches
 */
export async function generateWeeklySummary(
  userId: string
): Promise<{ ok: boolean; data?: string; error?: string }> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "AI not configured" };
    }

    // Get activities from the past 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);

    // Get hypothesis IDs the user owns or watches
    const [ownedHypotheses, watchedHypotheses] = await Promise.all([
      prisma.hypothesis.findMany({
        where: { ownerId: userId, isArchived: false },
        select: { id: true, statement: true },
      }),
      prisma.hypothesisWatcher.findMany({
        where: { userId },
        include: {
          hypothesis: {
            select: { id: true, statement: true },
          },
        },
      }),
    ]);

    const hypothesesMap = new Map<string, string>();
    ownedHypotheses.forEach((h) => hypothesesMap.set(h.id, h.statement));
    watchedHypotheses.forEach((w) => hypothesesMap.set(w.hypothesis.id, w.hypothesis.statement));

    const hypothesisIds = Array.from(hypothesesMap.keys());

    if (hypothesisIds.length === 0) {
      return { ok: true, data: "You're not watching or owning any hypotheses yet." };
    }

    // Get activities
    const activities = await prisma.activityLog.findMany({
      where: {
        hypothesisId: { in: hypothesisIds },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        hypothesis: {
          select: { id: true, statement: true, confidence: true },
        },
      },
    });

    if (activities.length === 0) {
      return { ok: true, data: "No activity on your hypotheses in the past week." };
    }

    // Filter to only the important activity types
    const importantTypes = [
      "HYPOTHESIS_CREATED",
      "CONFIDENCE_CHANGED", 
      "EVIDENCE_ADDED",
      "EVIDENCE_UPDATED",
    ];
    
    const filteredActivities = activities.filter((a) => importantTypes.includes(a.type));
    
    if (filteredActivities.length === 0) {
      return { ok: true, data: "No significant changes to your hypotheses in the past week." };
    }

    // Format activities for the AI - impersonal, no names
    const activityText = filteredActivities.map((a) => {
      const typeLabels: Record<string, string> = {
        HYPOTHESIS_CREATED: "New hypothesis created",
        CONFIDENCE_CHANGED: "Confidence changed",
        EVIDENCE_ADDED: a.summary?.toLowerCase().includes("challenge") ? "Challenge added" : "Supporting evidence added",
        EVIDENCE_UPDATED: "Evidence updated",
      };
      const action = typeLabels[a.type] || a.type;
      const date = a.createdAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      
      // Determine status based on confidence
      let status = "";
      if (a.hypothesis.confidence >= 80) status = " [VALIDATED]";
      else if (a.hypothesis.confidence <= 20) status = " [REFUTED]";
      
      return `- ${date}: ${action} - "${a.hypothesis.statement}" (confidence: ${a.hypothesis.confidence}%)${status}`;
    }).join("\n");

    const client = new Anthropic({ apiKey });

    // Get company context if available
    const companyContext = await getCompanyContext();
    const contextSection = companyContext 
      ? `\nCOMPANY/PROJECT CONTEXT:\n${companyContext}\n` 
      : "";

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are summarizing progress on a set of hypotheses for a weekly digest. Be concise and impersonal - do not mention any names or credit individuals. Focus only on what happened, not who did it. The work is done by teams, not individuals.
${contextSection}
Here are the significant activities from the past week:
${activityText}

Please provide a brief summary (2-3 short paragraphs) that:
1. Highlights any new hypotheses being explored
2. Notes hypotheses where confidence increased or decreased significantly, especially any that reached VALIDATED (>=80%) or REFUTED (<=20%) status
3. Mentions evidence that was added or updated - note that evidence can be "supporting" (confirms the hypothesis) or "challenges" (raises doubts or counter-arguments). Both are valuable and should be mentioned if present.

Write in an impersonal, factual tone. Keep it digestible and easy to scan. Don't use bullet points. Don't attribute work to specific people.`,
        },
      ],
    });

    const summary = response.content[0].type === "text" ? response.content[0].text : "";

    return { ok: true, data: summary };
  } catch (error) {
    console.error("generateWeeklySummary error:", error);
    return { ok: false, error: "Failed to generate summary" };
  }
}
