"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type ResultLoadingProps = {
  messages: readonly string[];
};

export default function ResultLoading({ messages }: ResultLoadingProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, 1800);

    return () => window.clearInterval(intervalId);
  }, [messages.length]);

  return (
    <div className="inline-flex items-center gap-2 text-xs text-slate-500" role="status" aria-live="polite">
      <Loader2 size={14} className="animate-spin text-violet-600" />
      <span className="transition-opacity">{messages[index]}</span>
    </div>
  );
}
