import FutureAtlasHeader from "@/components/shell/FutureAtlasHeader";
import GuidanceCTA from "@/components/guidance/GuidanceCTA";
import ScholarshipExplorer from "@/components/study-tools/ScholarshipExplorer";
import { ProtectedTool } from "@/components/auth/AuthGate";

export default function ScholarshipsPage() {
  return (
    <main className="min-h-screen bg-[#F8F9FC]">
      <FutureAtlasHeader />
      <div className="p-6 sm:p-10">
        <ProtectedTool>
          <ScholarshipExplorer />
          <GuidanceCTA />
        </ProtectedTool>
      </div>
    </main>
  );
}
