"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AIMode } from "@/lib/ai/types";
import { requestAI } from "@/lib/ai/request";
import { readToolContext } from "@/lib/client/local-history";
import { useAuth } from "@/components/auth/AuthGate";
import { readDeviceHistory, writeDeviceHistory } from "@/lib/client/device-history";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Loader2,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id: number;
  role: "assistant" | "user";
  content: string;
};

type FutureAtlasAIProps = {
  mode: AIMode;
  onClose?: () => void;
  embedded?: boolean;
};

const toolOptions = [
  {
    label: "Country Explorer",
    path: "/countries",
  },
  {
    label: "University Explorer",
    path: "/universities",
  },
  {
    label: "Scholarship Explorer",
    path: "/scholarships",
  },
  {
    label: "Cost Calculator",
    path: "/cost-calculator",
  },
  {
    label: "Eligibility Checker",
    path: "/eligibility",
  },
];

const personality = {
  mentor: {
    label: "Study Abroad Mentor",
    intro:
      "Ask me anything about studying abroad, universities, courses, applications, scholarships, visas, costs, or eligibility.",
    suggestions: [
      "Where should I start?",
      "How do I choose a country?",
      "What documents do I need?",
    ],
  },

  country: {
    label: "Country Explorer",
    intro:
      "I can help you discover the right country to study in. Tell me what matters most to you — budget, career opportunities, visa options, lifestyle, or something else.",
    suggestions: [
      "Which country is best for Computer Science?",
      "I want an affordable country",
      "Where can I work after graduation?",
    ],
  },

  university: {
    label: "University Explorer",
    intro:
      "Let's find universities that fit your goals. Tell me your course, preferred country, budget, academic profile, or any combination of these.",
    suggestions: [
      "Find universities for Computer Science",
      "Show affordable universities in Germany",
      "I have 75%. What universities can I target?",
    ],
  },

  scholarship: {
    label: "Scholarship Explorer",
    intro:
      "I can help you explore scholarships and funding opportunities. Tell me your study level, destination, course, and academic profile.",
    suggestions: [
      "Find scholarships for Master's students",
      "What scholarships are available in Europe?",
      "I need fully funded scholarships",
    ],
  },

  cost: {
    label: "Cost Calculator",
    intro:
      "Let's estimate your study abroad budget. I'll help you think through tuition, accommodation, living costs, travel, insurance, visa fees, and other expenses.",
    suggestions: [
      "Calculate the cost of studying in Germany",
      "How much will a Master's in the UK cost?",
      "Compare Germany and France",
    ],
  },

  eligibility: {
    label: "Eligibility Checker",
    intro:
      "I'll help you understand your initial eligibility for studying abroad. Tell me your academic background, course, destination, and English proficiency.",
    suggestions: [
      "Can I study Computer Science in Germany?",
      "I have 65%. Where can I apply?",
      "Check my Master's eligibility",
    ],
  },
};

function getInitialMessages(
  intro: string
): Message[] {
  return [
    {
      id: 1,
      role: "assistant",
      content: intro,
    },
  ];
}

export default function FutureAtlasAI({
  mode,
  onClose,
  embedded = false,
}: FutureAtlasAIProps) {
  const router = useRouter();
  const { email } = useAuth();
  const config = personality[mode];
  const storageKey = `future-atlas-ai-${mode}:${email || "guest"}`;
  const [messages, setMessages] = useState<Message[]>(() =>
    getInitialMessages(config.intro)
  );
  const [restored, setRestored] = useState(false);
  const nextMessageIdRef = useRef(2);

  useEffect(() => {
    let cancelled = false;
    let savedMessages: Message[] | null = null;
    void readDeviceHistory<Message[]>(storageKey).then((saved) => {
      if (Array.isArray(saved) && saved.length) {
        savedMessages = saved.slice(-50);
        nextMessageIdRef.current = Math.max(...saved.map((item: Message) => Number(item.id) || 0), 1) + 1;
      }
      if (cancelled) return;
      if (savedMessages) setMessages(savedMessages);
      setRestored(true);
    });
    return () => { cancelled = true; };
  }, [storageKey]);
  useEffect(() => { if (restored) void writeDeviceHistory(storageKey, messages.slice(-50)); }, [messages, restored, storageKey]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [showAllToolModes, setShowAllToolModes] = useState(false);

  // Auto-scroll reference
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Automatically scroll to newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isThinking]);

  const loadingMessages = [
    `Understanding your ${config.label.toLowerCase()} request...`,
    "Exploring the most relevant information...",
    "Comparing options for your goals...",
    "Almost there...",
  ];

  useEffect(() => {
    if (!isThinking) return;

    const intervalId = window.setInterval(() => {
      setLoadingMessageIndex((current) =>
        (current + 1) % loadingMessages.length
      );
    }, 1800);

    return () => window.clearInterval(intervalId);
  }, [isThinking, loadingMessages.length]);

  const sendMessage = async (text?: string) => {
    const message = (text ?? input).trim();

    if (!message || isThinking) return;

    const userMessageId = nextMessageIdRef.current;
    nextMessageIdRef.current += 1;

    const userMessage: Message = {
      id: userMessageId,
      role: "user",
      content: message,
    };

    const previousMessages = messages;

    setMessages((previous) => [
      ...previous,
      userMessage,
    ]);

    setInput("");
    setLoadingMessageIndex(0);
    setIsThinking(true);

    let streamed = "";
    let assistantMessageId: number | null = null;

    try {
      const history = previousMessages.map((item) => ({
        role:
          item.role === "assistant"
            ? "model"
            : "user",
        content: item.content,
      }));
      const requestBody = {
        mode,
        message,
        history,
        context: readToolContext(email),
      };

      const data = await requestAI<{ response?: string }>(requestBody, {
        onDelta: (text) => {
          streamed += text;
          setIsThinking(false);
          if (assistantMessageId == null) {
            assistantMessageId = nextMessageIdRef.current;
            nextMessageIdRef.current += 1;
          }
          const id = assistantMessageId;
          setMessages((previous) => {
            const exists = previous.some((item) => item.id === id);
            if (!exists) {
              return [...previous, { id, role: "assistant", content: streamed }];
            }
            return previous.map((item) => item.id === id ? { ...item, content: streamed } : item);
          });
        },
        onReset: () => {
          streamed = "";
          setIsThinking(true);
          if (assistantMessageId == null) return;
          const id = assistantMessageId;
          setMessages((previous) => previous.map((item) => item.id === id ? { ...item, content: "" } : item));
        },
      });

      const responseText = data.response?.trim() || streamed.trim();
      if (!responseText) {
        throw new Error("The AI returned an empty response. Please try again.");
      }

      if (assistantMessageId == null) {
        assistantMessageId = nextMessageIdRef.current;
        nextMessageIdRef.current += 1;
        setMessages((previous) => [
          ...previous,
          { id: assistantMessageId as number, role: "assistant", content: responseText },
        ]);
      } else {
        const id = assistantMessageId;
        setMessages((previous) => previous.map((item) => item.id === id ? { ...item, content: responseText } : item));
      }
    } catch (error) {
      console.error("Chat error:", error);

      let errorText =
        "I couldn't connect to the AI right now. Please try again.";

      if (
        error instanceof Error &&
        error.message
      ) {
        errorText = error.message;
      }

      if (assistantMessageId != null) {
        const id = assistantMessageId;
        setMessages((previous) => previous.map((item) => item.id === id ? { ...item, content: errorText } : item));
      } else {
        const errorMessageId = nextMessageIdRef.current;
        nextMessageIdRef.current += 1;
        setMessages((previous) => [
          ...previous,
          { id: errorMessageId, role: "assistant", content: errorText },
        ]);
      }
    } finally {
      setIsThinking(false);
    }
  };

  const openTool = (path: string) => {
    setIsModeMenuOpen(false);
    onClose?.();
    router.push(
      embedded
        ? `/embed?tool=${path.replace("/", "")}`
        : path
    );
  };

  return (
    <div className="flex h-[min(720px,calc(100dvh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.12)]">

      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
        <div className="flex items-center gap-3">

          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Sparkles size={20} />
          </div>

          <div>
            <div className="flex items-center gap-2">

              <h2 className="text-sm font-semibold text-slate-900">
                Future Atlas AI
              </h2>

              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-violet-600">
                {config.label}
              </span>

            </div>

            <p className="mt-1 text-xs text-slate-400">
              Your global study companion
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* MODE SELECTOR */}
      <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3">

        <div className="flex items-center gap-2 text-xs text-slate-400">

          <span className="font-medium">
            Current mode:
          </span>

          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setIsModeMenuOpen((isOpen) => !isOpen)
              }
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
              aria-expanded={isModeMenuOpen}
              aria-haspopup="menu"
            >

              {config.label}

              <ChevronDown size={12} />

            </button>

            {isModeMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-2 shadow-xl shadow-slate-900/10"
              >
                {(showAllToolModes ? toolOptions : toolOptions.slice(0, 4)).map((tool) => (
                  <button
                    key={tool.path}
                    type="button"
                    role="menuitem"
                    onClick={() => openTool(tool.path)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    {tool.label}
                    <ArrowRight size={13} className="text-slate-300" />
                  </button>
                ))}
                              {!showAllToolModes && toolOptions.length > 4 && (
                  <button type="button" role="menuitem" onClick={() => setShowAllToolModes(true)} className="flex w-full items-center justify-between border-t border-slate-100 px-4 py-2.5 text-left text-xs font-semibold text-violet-700 transition hover:bg-violet-50">
                    More <ArrowRight size={13} />
                  </button>
                )}</div>
            )}
          </div>
        </div>
      </div>

      {/* CHAT */}
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">

        <div className="mx-auto max-w-3xl space-y-6">

          {messages.map((message) => (

            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user"
                  ? "justify-end"
                  : "justify-start"
              }`}
            >

              {/* AI ICON */}
              {message.role === "assistant" && (

                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">

                  <Bot size={15} />

                </div>
              )}

              {/* MESSAGE */}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "rounded-br-md bg-slate-900 text-white"
                    : "rounded-bl-md bg-slate-100 text-slate-700"
                }`}
              >

                {message.role === "assistant" ? (

                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({
                        children,
                      }) => (
                        <p className="mb-3 last:mb-0 leading-7">
                          {children}
                        </p>
                      ),

                      strong: ({
                        children,
                      }) => (
                        <strong className="font-semibold text-slate-900">
                          {children}
                        </strong>
                      ),

                      ul: ({
                        children,
                      }) => (
                        <ul className="mb-3 list-disc space-y-1 pl-5">
                          {children}
                        </ul>
                      ),

                      ol: ({
                        children,
                      }) => (
                        <ol className="mb-3 list-decimal space-y-1 pl-5">
                          {children}
                        </ol>
                      ),

                      li: ({
                        children,
                      }) => (
                        <li className="leading-6">
                          {children}
                        </li>
                      ),

                      h1: ({
                        children,
                      }) => (
                        <h1 className="mb-3 text-lg font-bold text-slate-900">
                          {children}
                        </h1>
                      ),

                      h2: ({
                        children,
                      }) => (
                        <h2 className="mb-2 text-base font-bold text-slate-900">
                          {children}
                        </h2>
                      ),

                      h3: ({
                        children,
                      }) => (
                        <h3 className="mb-2 text-sm font-semibold text-slate-900">
                          {children}
                        </h3>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>

                ) : (

                  <p className="whitespace-pre-wrap">
                    {message.content}
                  </p>

                )}

              </div>

              {/* USER ICON */}
              {message.role === "user" && (

                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">

                  <User size={15} />

                </div>

              )}

            </div>
          ))}

          {/* THINKING */}
          {isThinking && (

            <div className="flex gap-3">

              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white">

                <Bot size={15} />

              </div>

              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm text-slate-400">

                <Loader2
                  size={15}
                  className="animate-spin"
                />

                <span>{loadingMessages[loadingMessageIndex]}</span>

              </div>
            </div>
          )}

          {/* SUGGESTIONS */}
          {messages.length === 1 && (

            <div className="pt-3">

              <p className="mb-3 text-xs font-medium text-slate-400">
                Try asking:
              </p>

              <div className="flex flex-wrap gap-2">

                {config.suggestions.map(
                  (suggestion) => (

                    <button
                      key={suggestion}
                      onClick={() =>
                        sendMessage(
                          suggestion
                        )
                      }
                      className="group flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    >

                      {suggestion}

                      <ArrowRight
                        size={13}
                        className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600"
                      />

                    </button>

                  )
                )}

              </div>
            </div>
          )}

          {/* AUTO SCROLL TARGET */}
          <div ref={messagesEndRef} />

        </div>
      </div>

      {/* INPUT */}
      <div className="border-t border-slate-100 bg-white p-4 sm:p-5">

        <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 transition focus-within:border-slate-300 focus-within:bg-white focus-within:shadow-sm">

          <textarea
            value={input}
            onChange={(event) =>
              setInput(event.target.value)
            }
            onKeyDown={(event) => {

              if (
                event.key === "Enter" &&
                !event.shiftKey
              ) {

                event.preventDefault();

                sendMessage();

              }
            }}
            placeholder={`Ask ${config.label}...`}
            rows={1}
            className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />

          <button
            onClick={() => sendMessage()}
            disabled={
              !input.trim() ||
              isThinking
            }
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
              input.trim() &&
              !isThinking
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "bg-slate-200 text-slate-400"
            }`}
          >

            <Send size={17} />

          </button>

        </div>

     <div className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-slate-400">
  <p>
    Future Atlas AI can make mistakes. Always verify important
    information with official university and government sources.
  </p>

  <p className="mt-1 font-medium text-slate-500">
    Powered by One Window
  </p>
</div>

      </div>
    </div>
    
  );
}
