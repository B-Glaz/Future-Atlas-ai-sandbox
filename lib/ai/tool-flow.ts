"use client";

import { useCallback, useEffect, useState } from "react";
import { requestAI } from "./request";
import { clearAIClientCache } from "./client-cache";
import { getProgressiveOptions } from "@/lib/client/progressive-options";
import { isCustomStudyInputValid } from "@/components/study-tools/CustomOptionInput";
import { getStructuredResult } from "./structured-output";
import { trackEvent } from "@/lib/client/analytics";
import { saveToolContext } from "@/lib/client/local-history";
import { useAuth } from "@/components/auth/AuthGate";

type StepConfig<T extends string> = {
  id: T;
  title: string;
  subtitle: string;
  options: string[];
};

export type ToolFlowConfig<T extends string> = {
  steps: readonly StepConfig<T>[];
  aiMode: string;
  aiMessage: string;
  getInputs: (answers: Record<T, string>) => Record<string, string>;
  resultKey: string;
};

export function useToolFlow<T extends string>(config: ToolFlowConfig<T>) {
  const { email } = useAuth();
  const userId = email || undefined;
  const { steps, aiMode, aiMessage, getInputs, resultKey } = config;

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<Record<T, string>>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAllOptions, setShowAllOptions] = useState(false);
  const [hasRestored, setHasRestored] = useState(false);
  const storageKey = `future-atlas:${aiMode}:draft:${userId || "guest"}`;

  const currentStep = steps[currentStepIndex];
  const currentAnswerKey = currentStep.id;
  const currentSelection = answers[currentAnswerKey] || "";
  const currentCustomValue = customAnswers[currentAnswerKey] || "";
  const isOtherSelected = currentSelection === "Other";
  const canContinue = Boolean(currentSelection) && (!isOtherSelected || isCustomStudyInputValid(currentCustomValue));
  const visibleOptions = getProgressiveOptions(currentStep.options, showAllOptions);

  useEffect(() => {
    let cancelled = false;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null") as {
        step?: number;
        answers?: Partial<Record<T, string>>;
        customAnswers?: Record<string, string>;
      } | null;
      queueMicrotask(() => {
        if (cancelled) return;
        if (saved?.answers) setAnswers(saved.answers);
        if (saved?.customAnswers) setCustomAnswers(saved.customAnswers);
        if (Number.isInteger(saved?.step) && saved!.step! >= 0 && saved!.step! < steps.length) setCurrentStepIndex(saved!.step!);
        setHasRestored(true);
      });
    } catch {
      sessionStorage.removeItem(storageKey);
      queueMicrotask(() => !cancelled && setHasRestored(true));
    }
    return () => { cancelled = true; };
  }, [steps.length, storageKey]);

  useEffect(() => {
    if (!hasRestored) return;
    sessionStorage.setItem(storageKey, JSON.stringify({ step: currentStepIndex, answers, customAnswers }));
  }, [answers, currentStepIndex, customAnswers, hasRestored, storageKey]);

  const getResolvedSelection = useCallback(() =>
    isOtherSelected ? currentCustomValue.trim() : currentSelection,
    [isOtherSelected, currentCustomValue, currentSelection]
  );

  const generateResults = useCallback(async (finalAnswers: Record<T, string>) => {
    setIsLoading(true);
    setError("");

    try {
      const requestBody = {
        mode: aiMode,
        responseFormat: "structured",
        inputs: getInputs(finalAnswers),
        message: aiMessage,
      };
      const payload = await requestAI<Record<string, unknown>>(requestBody);


      const result = getStructuredResult(payload, resultKey);
      if (!result || (Array.isArray(result) && !result.length)) {
        throw new Error(`The AI returned no ${resultKey} matches. Please try again.`);
      }
      setResults(result);
      trackEvent("tool_result", { mode: aiMode, inputs: getInputs(finalAnswers) });
      saveToolContext(aiMode, getInputs(finalAnswers), result, userId);
    } catch (err) {
      console.error(`${aiMode} AI error:`, err);
      setError(err instanceof Error ? err.message : "We couldn't refresh your AI matches right now. Please try again shortly.");
    } finally {
      setIsLoading(false);
    }
  }, [aiMode, aiMessage, getInputs, resultKey, userId]);

  const selectOption = useCallback((value: string) => {
    setAnswers(prev => ({ ...prev, [currentAnswerKey]: value }));
  }, [currentAnswerKey]);

  const previousStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setShowAllOptions(false);
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);

  const nextStep = useCallback(() => {
    if (!canContinue) return;

    const resolvedValue = getResolvedSelection();
    const updatedAnswers = { ...answers, [currentAnswerKey]: resolvedValue };
    setAnswers(updatedAnswers);

    if (currentStepIndex < steps.length - 1) {
      setShowAllOptions(false);
      setCurrentStepIndex(prev => prev + 1);
    } else {
      setShowResults(true);
      generateResults(updatedAnswers as Record<T, string>);
    }
  }, [canContinue, currentAnswerKey, currentStepIndex, steps.length, answers, getResolvedSelection, generateResults]);

  const clearSelection = useCallback(() => {
    setCurrentStepIndex(0);
    setAnswers({});
    setCustomAnswers({});
    setShowResults(false);
    setResults(null);
    setError("");
    setIsLoading(false);
    clearAIClientCache();
    sessionStorage.removeItem(storageKey);
  }, [storageKey]);

  const handleCustomChange = useCallback((value: string) => {
    setCustomAnswers(prev => ({ ...prev, [currentAnswerKey]: value }));
  }, [currentAnswerKey]);

  return {
    step: currentStepIndex + 1,
    totalSteps: steps.length,
    currentStep,
    currentSelection,
    currentCustomValue,
    isOtherSelected,
    canContinue,
    visibleOptions,
    showAllOptions,
    setShowAllOptions,
    showResults,
    setShowResults,
    results,
    isLoading,
    error,
    answers: answers as Record<T, string>,
    selectOption,
    previousStep,
    nextStep,
    clearSelection,
    handleCustomChange,
    progress: Math.round(((currentStepIndex + 1) / steps.length) * 100),
  };
}
