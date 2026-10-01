import FutureAtlasHeader from "@/components/shell/FutureAtlasHeader";
import GuidanceCTA from "@/components/guidance/GuidanceCTA";
import CountryExplorer from "@/components/study-tools/CountryExplorer";
import { ProtectedTool } from "@/components/auth/AuthGate";

export default function CountriesPage() {
  return (
    <main className="min-h-screen bg-[#F8F9FC]">
      <FutureAtlasHeader />
      <div className="p-6 sm:p-10">
        <ProtectedTool>
          <CountryExplorer />
          <GuidanceCTA />
        </ProtectedTool>
      </div>
    </main>
  );
}
