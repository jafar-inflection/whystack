"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSettings, SettingsData } from "@/app/actions/settings";

interface SettingsFormProps {
  initialSettings: SettingsData;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const router = useRouter();
  const [companyContext, setCompanyContext] = useState(initialSettings.companyContext || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    
    const result = await updateSettings({ companyContext: companyContext || null });
    
    if (result.ok) {
      setSaved(true);
      router.refresh();
      // Clear saved indicator after 2 seconds
      setTimeout(() => setSaved(false), 2000);
    }
    
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-slate-800 mb-1">AI Context</h2>
        <p className="text-sm text-slate-500 mb-4">
          Provide background information about your company, projects, or domain. 
          This context will be included in all AI-generated content (executive summaries, 
          validation suggestions, etc.) to make responses more relevant.
        </p>
        
        <textarea
          value={companyContext}
          onChange={(e) => setCompanyContext(e.target.value)}
          placeholder="Example: We are a B2B SaaS company building AI-powered productivity tools. Our main product is a smart calendar assistant that helps teams schedule meetings efficiently. We're focused on enterprise customers in the tech and finance sectors."
          rows={8}
          className="w-full px-4 py-3 text-sm text-slate-700 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none placeholder:text-slate-400"
        />
        
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-slate-400">
            {companyContext.length} characters
          </p>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-green-600">Saved!</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
