import FutureAtlasHeader from "@/components/shell/FutureAtlasHeader";
import GuidanceCTA from "@/components/guidance/GuidanceCTA";
import UniversityExplorer from "@/components/study-tools/UniversityExplorer";
import { ProtectedTool } from "@/components/auth/AuthGate";

export default function UniversitiesPage() {
  return (
    <main className="min-h-screen bg-[#F8F9FC]">
      <FutureAtlasHeader />
      <div className="p-6 sm:p-10">
        <ProtectedTool>
          <UniversityExplorer />
          <GuidanceCTA />
        </ProtectedTool>
      </div>
    </main>
  );
}
