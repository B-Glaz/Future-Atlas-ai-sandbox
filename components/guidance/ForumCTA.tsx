import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";

type ForumCTAProps = {
  context: "country" | "university" | "scholarship" | "cost" | "eligibility";
};

const copy = {
  country: {
    title: "Still deciding if this country is right for you?",
    description: "Ask students who are exploring or studying in similar destinations.",
    action: "Join the discussion",
  },
  university: {
    title: "Want the real student perspective?",
    description: "Compare experiences and discuss your university shortlist.",
    action: "Ask the community",
  },
  scholarship: {
    title: "Confused about scholarships or eligibility?",
    description: "Discuss your options and learn from other applicants.",
    action: "Ask the community",
  },
  cost: {
    title: "Want help planning this budget?",
    description: "Compare real student experiences and practical saving ideas.",
    action: "Discuss your budget",
  },
  eligibility: {
    title: "Want feedback on your next step?",
    description: "Discuss your profile with students following similar study plans.",
    action: "Ask the community",
  },
} as const;

export default function ForumCTA({ context }: ForumCTAProps) {
  const content = copy[context];
  const forumUrl = process.env.NEXT_PUBLIC_FORUM_URL?.trim() || "/guidance";

  return (
    <section className="border-t border-violet-100 bg-violet-50/60 px-6 py-6 sm:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm">
            <MessageCircle size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{content.title}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">{content.description}</p>
          </div>
        </div>
        <Link
          href={forumUrl}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-700"
        >
          {content.action}
          <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}
