import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSettings } from "@/app/actions/settings";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { UserMenu } from "@/components/auth/UserMenu";
import Link from "next/link";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect("/api/auth/signin");
  }

  const settings = await getSettings();

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link 
            href="/hypotheses" 
            className="text-slate-500 hover:text-slate-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>
        </div>
        <UserMenu />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <SettingsForm initialSettings={settings} />
      </div>
    </main>
  );
}
