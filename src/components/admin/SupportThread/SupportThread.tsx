"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SUPPORT_MESSAGE_MAX_LENGTH } from "@/lib/validations/support";
import { closeConversationAction, sendAdminReplyAction } from "@/app/(admin)/admin/support/actions";

type Message = { id: string; authorRole: "user" | "admin"; body: string; createdAt: string };

const POLL_MS = 4000;
const timeFormat = new Intl.DateTimeFormat("ro-RO", { dateStyle: "short", timeStyle: "short" });

export function SupportThread({
  conversationId,
  initialStatus,
  initialMessages,
}: {
  conversationId: string;
  initialStatus: "open" | "closed";
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const last = useRef<string | null>(initialMessages.at(-1)?.createdAt ?? null);
  const listRef = useRef<HTMLDivElement>(null);

  const merge = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    last.current = incoming[incoming.length - 1].createdAt;
  }, []);

  useEffect(() => {
    if (status === "closed") return;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const qs = last.current ? `?after=${encodeURIComponent(last.current)}` : "";
        const res = await fetch(`/api/admin/support/${conversationId}${qs}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { status: "open" | "closed"; messages: Message[] };
        setStatus(data.status);
        merge(data.messages);
      } catch {
        /* retry on next tick */
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [conversationId, status, merge]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const result = await sendAdminReplyAction(conversationId, body);
    setSending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft("");
    merge([{ ...result.message, createdAt: new Date(result.message.createdAt).toISOString() }]);
  }

  async function close() {
    const result = await closeConversationAction(conversationId);
    if (result.ok) setStatus("closed");
  }

  return (
    <Card className="flex h-[32rem] max-h-[75vh] flex-col overflow-hidden p-0">
      <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={m.authorRole === "admin" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.authorRole === "admin"
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

      {status === "closed" ? (
        <p className="border-t p-4 text-center text-sm text-muted-foreground">This conversation is closed.</p>
      ) : (
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
          <label htmlFor="admin-reply" className="sr-only">
            Reply
          </label>
          <textarea
            id="admin-reply"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
            rows={3}
            placeholder="Write a reply…"
            disabled={sending}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={close}>
              Close conversation
            </Button>
            <Button type="submit" disabled={sending || !draft.trim()}>
              {sending ? "Sending…" : "Send reply"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
