import { getHypothesesWithRelations } from "@/app/actions/hypotheses";
import { HypothesesView } from "@/components/why-stack";
import { UserMenu } from "@/components/auth/UserMenu";
import { UpdatesIconWithBadge } from "@/components/updates/UpdatesIconWithBadge";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HypothesesPage() {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }
  
  const hypotheses = await getHypothesesWithRelations();

  return (
    <main className="container mx-auto px-4 py-6 max-w-7xl">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Why Stack</h1>
          <p className="text-gray-600 text-sm mt-1">
            A shared map of hypotheses behind our decisions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            href="/settings" 
            className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
          <UpdatesIconWithBadge userId={session.user.id} />
          <UserMenu />
        </div>
      </header>

      <HypothesesView hypotheses={hypotheses} />
      
      <footer className="mt-8 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-400 text-center">
          Feedback or questions? Slack{" "}
          <a 
            href="https://inflection.slack.com/team/prateeksha" 
            className="text-blue-500 hover:text-blue-600 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            prateeksha@inflection.ai
          </a>
        </p>
      </footer>
    </main>
  );
}
