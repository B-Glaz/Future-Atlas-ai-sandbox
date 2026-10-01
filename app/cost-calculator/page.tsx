import FutureAtlasHeader from "@/components/shell/FutureAtlasHeader";
import GuidanceCTA from "@/components/guidance/GuidanceCTA";
import CostCalculator from "@/components/study-tools/CostCalculator";
import { ProtectedTool } from "@/components/auth/AuthGate";

export default function CostCalculatorPage() {
  return (
    <main className="min-h-screen bg-[#F8F9FC]">
      <FutureAtlasHeader />
      <div className="p-6 sm:p-10">
        <ProtectedTool>
          <CostCalculator />
          <GuidanceCTA />
        </ProtectedTool>
      </div>
    </main>
  );
}
