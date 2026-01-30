"use server";

import { prisma } from "@/lib/prisma";

const SETTINGS_ID = "singleton";

export interface SettingsData {
  companyContext: string | null;
}

/**
 * Get organization settings
 */
export async function getSettings(): Promise<SettingsData> {
  const settings = await prisma.settings.findUnique({
    where: { id: SETTINGS_ID },
  });

  return {
    companyContext: settings?.companyContext || null,
  };
}

/**
 * Update organization settings
 */
export async function updateSettings(data: Partial<SettingsData>): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        companyContext: data.companyContext,
      },
      update: {
        companyContext: data.companyContext,
      },
    });

    return { ok: true };
  } catch (error) {
    console.error("updateSettings error:", error);
    return { ok: false, error: "Failed to update settings" };
  }
}

/**
 * Get company context for AI prompts
 * Returns empty string if not set
 */
export async function getCompanyContext(): Promise<string> {
  const settings = await getSettings();
  return settings.companyContext || "";
}
