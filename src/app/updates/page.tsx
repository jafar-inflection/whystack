import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getActivitiesForUser, ActivityGroup } from "@/app/actions/activities";
import { UserMenu } from "@/components/auth/UserMenu";
import { UpdatesList } from "@/components/updates/UpdatesList";
import { WeeklySummary } from "@/components/updates/WeeklySummary";
import Link from "next/link";

export default async function UpdatesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  // Get activities from the last 7 days
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const result = await getActivitiesForUser(session.user.id, { since, limit: 100 });
  const activityGroups: ActivityGroup[] = result.ok && result.data ? result.data : [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/hypotheses"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-semibold text-slate-900">Updates</h1>
          </div>
          <UserMenu />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* AI-generated weekly summary */}
        <WeeklySummary userId={session.user.id} />
        
        {/* Activity list */}
        <UpdatesList activityGroups={activityGroups} userId={session.user.id} />
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 py-6 text-center text-xs text-slate-400">
        Feedback or questions? Slack prateeksha@inflection.ai
      </footer>
    </div>
  );
}
