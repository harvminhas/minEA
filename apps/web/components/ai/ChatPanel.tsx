"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiV1Url } from "@/lib/api-base";
import { MessageSquare, X, Send, Sparkles, Bot, User } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatPanel() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const { chatOpen, setChatOpen, activeWorkspace } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isStreaming || !orgSlug || !workspaceSlug) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const token = await getToken();
      const response = await fetch(
        apiV1Url(`/orgs/${orgSlug}/workspaces/${workspaceSlug}/ai/chat`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
          }),
        }
      );

      if (!response.ok) {
        let detail = "AI chat request failed.";
        try {
          const errBody = await response.json();
          if (typeof errBody.detail === "string") detail = errBody.detail;
        } catch {
          detail = (await response.text()) || detail;
        }
        throw new Error(detail);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "text") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + parsed.text } : m
                )
              );
            } else if (parsed.type === "error" && typeof parsed.message === "string") {
              streamError = parsed.message;
            }
          } catch {}
        }
      }

      if (streamError) throw new Error(streamError);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Sorry, something went wrong. Please try again.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: message } : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 h-12 w-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-colors"
      >
        {chatOpen ? <X size={20} /> : <MessageSquare size={20} />}
      </button>

      {/* Chat panel */}
      {chatOpen && (
        <div className="fixed bottom-20 right-6 w-[400px] h-[560px] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col z-30">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <Sparkles size={16} className="text-indigo-500" />
            <span className="font-semibold text-sm text-gray-900">AI Assistant</span>
            {activeWorkspace && (
              <span className="text-xs text-gray-400 ml-auto truncate max-w-[160px]">
                {activeWorkspace.name}
              </span>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot size={32} className="text-indigo-200 mb-3" />
                <p className="text-sm text-gray-400">
                  Ask me anything about your architecture.
                </p>
                <div className="mt-4 space-y-2 w-full">
                  {[
                    "What capabilities does Salesforce support?",
                    "Which applications are retiring?",
                    "Show me all PII data stores",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="w-full text-left text-xs px-3 py-2 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-md transition-colors text-gray-600"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
                >
                  <div className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0",
                    msg.role === "user" ? "bg-indigo-600" : "bg-gray-100"
                  )}>
                    {msg.role === "user" ? (
                      <User size={13} className="text-white" />
                    ) : (
                      <Bot size={13} className="text-gray-500" />
                    )}
                  </div>
                  <div className={cn(
                    "max-w-[280px] rounded-lg px-3 py-2 text-sm",
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-50 text-gray-800"
                  )}>
                    {msg.content || (
                      <span className="animate-pulse text-gray-400">●●●</span>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100">
            {!activeWorkspace && (
              <p className="text-xs text-center text-gray-400 mb-2">Select a workspace to chat</p>
            )}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder={orgSlug ? "Ask about your architecture..." : "No workspace selected"}
                disabled={!orgSlug || isStreaming}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isStreaming || !orgSlug}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg p-2 transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
