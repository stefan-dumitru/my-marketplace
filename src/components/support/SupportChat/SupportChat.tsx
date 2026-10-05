"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SUPPORT_MESSAGE_MAX_LENGTH } from "@/lib/validations/support";
import { sendSupportMessageAction } from "./actions";

type Message = { id: string; authorRole: "user" | "admin"; body: string; createdAt: string };
type ChatResponse = { conversationId: string | null; messages: Message[] };

const OPEN_POLL_MS = 4000;
const CLOSED_POLL_MS = 60000;

const timeFormat = new Intl.DateTimeFormat("ro-RO", { hour: "2-digit", minute: "2-digit" });

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(false);
  const conversationId = useRef<string | null>(null);
  const lastTimestamp = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const merge = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    lastTimestamp.current = incoming[incoming.length - 1].createdAt;
  }, []);

  const poll = useCallback(async () => {
    try {
      const qs = lastTimestamp.current ? `?after=${encodeURIComponent(lastTimestamp.current)}` : "";
      const res = await fetch(`/api/support/chat${qs}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ChatResponse;
      if (conversationId.current && !data.conversationId) {
        setMessages([]);
        lastTimestamp.current = null;
        setNotice("This conversation was closed by support. Send a message to start a new one.");
      }
      conversationId.current = data.conversationId;
      merge(data.messages);
    } catch {
      /* transient network error: the next tick retries */
    }
  }, [merge]);

  // Open: poll quickly while the tab is visible.
  useEffect(() => {
    if (!open) return;
    const first = setTimeout(poll, 0);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, OPEN_POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [open, poll]);

  // Closed: slow, read-only check so the button can show a dot for new replies.
  useEffect(() => {
    if (open) return;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/support/chat?peek=1", { cache: "no-store" });
        if (res.ok) setUnread(((await res.json()) as { unread: boolean }).unread);
      } catch {
        /* ignore */
      }
    };
    const first = setTimeout(check, 0);
    const id = setInterval(check, CLOSED_POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const result = await sendSupportMessageAction(body);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft("");
    setNotice(null);
    merge([{ ...result.message, createdAt: new Date(result.message.createdAt).toISOString() }]);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setUnread(false);
          setOpen(true);
        }}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg"
        aria-label={unread ? "Open support chat (new reply)" : "Open support chat"}
      >
        Support
        {unread && <span className="size-2.5 rounded-full bg-red-500" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Support chat"
      className="fixed inset-x-2 bottom-2 z-40 flex h-[28rem] max-h-[80vh] flex-col overflow-hidden rounded-xl border bg-background shadow-xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Support</p>
          <p className="text-xs text-muted-foreground">We usually reply within a few hours.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close chat">
          Close
        </Button>
      </header>

      <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="m-auto text-center text-sm text-muted-foreground">{notice ?? "Ask us anything about your orders."}</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.authorRole === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.authorRole === "user"
                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm"
              }
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className="mt-1 text-[10px] opacity-70">{timeFormat.format(new Date(m.createdAt))}</p>
            </div>
          </div>
        ))}
      </div>

      <form
        className="flex flex-col gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="support-message" className="sr-only">
            Message
          </label>
          <textarea
            id="support-message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
            rows={2}
            placeholder="Type your message…"
            disabled={sending}
            className="min-h-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={sending || !draft.trim()}>
            Send
          </Button>
        </div>
      </form>
    </section>
  );
}
