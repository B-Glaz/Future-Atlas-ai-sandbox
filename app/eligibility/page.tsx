import FutureAtlasHeader from "@/components/shell/FutureAtlasHeader";
import GuidanceCTA from "@/components/guidance/GuidanceCTA";
import FutureAtlasAI from "@/components/ai/FutureAtlasAI";
import { ProtectedTool } from "@/components/auth/AuthGate";

export default function EligibilityPage() {
  return (
    <main className="min-h-screen bg-[#F8F9FC]">
      <FutureAtlasHeader />
      <ProtectedTool>
        <div className="flex min-h-[calc(100vh-80px)] items-center justify-center p-6 sm:p-10">
          <FutureAtlasAI mode="eligibility" />
        </div>
        <div className="px-6 pb-10 sm:px-10"><GuidanceCTA /></div>
      </ProtectedTool>
    </main>
  );
}
