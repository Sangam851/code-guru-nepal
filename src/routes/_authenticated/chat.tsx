import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { runChat, testProvider, regenerateLast, editUserMessage, transcribeAudio } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Menu, Plus, Send, Settings as SettingsIcon, Globe, Trash2, MessageSquare, Zap, Copy, Check, RefreshCw, Pencil, X, Mic, Camera, Paperclip, Square, FileText, Image as ImageIcon } from "lucide-react";
import { NepalLogo } from "@/components/NepalLogo";
import { LANGUAGES } from "@/lib/languages";
import ReactMarkdown from "react-markdown";
import { CodeBlock } from "@/components/CodeBlock";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

type Conversation = { id: string; title: string; language: string; updated_at: string };
type Message = { id: string; role: "user" | "assistant" | "system"; content: string; created_at: string };

function ChatPage() {
  const runChatFn = useServerFn(runChat);
  const runTestFn = useServerFn(testProvider);
  const regenFn = useServerFn(regenerateLast);
  const editFn = useServerFn(editUserMessage);
  const transcribeFn = useServerFn(transcribeAudio);
  const [testing, setTesting] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("python");
  const [webSearch, setWebSearch] = useState(false);
  const [sending, setSending] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<null | {
    kind: "image" | "file" | "text";
    filename: string;
    mime: string;
    dataUrl?: string;
    text?: string;
    previewUrl?: string;
  }>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<{ stream: MediaStream; ctx: AudioContext; chunks: Float32Array[]; node: ScriptProcessorNode; source: MediaStreamAudioSourceNode } | null>(null);

  const activeConv = useMemo(() => conversations.find((c) => c.id === activeId), [conversations, activeId]);

  const testNow = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const provider = "lovable" as const;
      const model = "google/gemini-3.5-flash";
      const res = await runTestFn({ data: { provider, model } });
      if (res.ok) {
        toast.success(`Lovable AI • ${model} OK (${res.ms}ms)`, { description: res.reply });
      } else {
        toast.error("AI test failed", { description: res.error });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const loadConversations = async () => {
    const { data } = await supabase
      .from("conversations")
      .select("id, title, language, updated_at")
      .order("updated_at", { ascending: false });
    return (data ?? []) as Conversation[];
  };

  const loadMessages = async (id: string) => {
    const { data } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    return (data ?? []) as Message[];
  };

  const startNew = async (langOverride?: string) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return;
    const lang = langOverride ?? language;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: uid, language: lang, title: "New chat" })
      .select("id, title, language, updated_at")
      .single();
    if (error) return toast.error(error.message);
    const conv = data as Conversation;
    setConversations((cs) => [conv, ...cs]);
    setActiveId(conv.id);
    setMessages([]);
    setLanguage(conv.language);
    setSheetOpen(false);
  };

  const selectConv = async (id: string) => {
    setActiveId(id);
    const msgs = await loadMessages(id);
    setMessages(msgs);
    const c = conversations.find((x) => x.id === id);
    if (c) setLanguage(c.language);
    setSheetOpen(false);
  };

  const deleteConv = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    setConversations((cs) => cs.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  };

  useEffect(() => {
    (async () => {
      const cs = await loadConversations();
      setConversations(cs);
      if (cs.length > 0) {
        setActiveId(cs[0].id);
        setLanguage(cs[0].language);
        setMessages(await loadMessages(cs[0].id));
      }
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if ((!text && !attachment) || sending) return;
    let convId = activeId;
    if (!convId) {
      await startNew();
      // Grab freshly created id
      const cs = await loadConversations();
      convId = cs[0]?.id ?? null;
      setConversations(cs);
      setActiveId(convId);
    }
    if (!convId) return;

    // Update conversation language if user switched
    await supabase.from("conversations").update({ language }).eq("id", convId);

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text + (attachment ? `\n\n[Attachment: ${attachment.filename}]` : ""),
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    const sentAttachment = attachment;
    setInput("");
    setAttachment(null);
    setSending(true);
    try {
      await runChatFn({
        data: {
          conversationId: convId,
          language,
          webSearch,
          userMessage: text || "Please analyze the attached file.",
          attachment: sentAttachment
            ? {
                kind: sentAttachment.kind,
                filename: sentAttachment.filename,
                mime: sentAttachment.mime,
                dataUrl: sentAttachment.dataUrl,
                text: sentAttachment.text,
              }
            : undefined,
        },
      });
      const [msgs, convs] = await Promise.all([loadMessages(convId), loadConversations()]);
      setMessages(msgs);
      setConversations(convs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  const regenerate = async () => {
    if (!activeId || sending) return;
    setSending(true);
    try {
      await regenFn({ data: { conversationId: activeId, language, webSearch } });
      setMessages(await loadMessages(activeId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setSending(false);
    }
  };

  const editAndResend = async (messageId: string, newContent: string) => {
    if (!activeId || sending) return;
    setSending(true);
    try {
      await editFn({ data: { conversationId: activeId, messageId, newContent, language, webSearch } });
      setMessages(await loadMessages(activeId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Edit failed");
    } finally {
      setSending(false);
    }
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  const readFileAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });

  const TEXT_EXT = /\.(txt|md|json|csv|tsv|yaml|yml|toml|xml|html|css|scss|js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|zsh|sql|log|ini|env)$/i;

  const handleFilePicked = async (file: File | null | undefined) => {
    if (!file) return;
    const MAX = 15 * 1024 * 1024;
    if (file.size > MAX) return toast.error("File is larger than 15 MB.");
    try {
      if (file.type.startsWith("image/")) {
        const dataUrl = await readFileAsDataUrl(file);
        setAttachment({ kind: "image", filename: file.name, mime: file.type, dataUrl, previewUrl: dataUrl });
      } else if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const dataUrl = await readFileAsDataUrl(file);
        setAttachment({ kind: "file", filename: file.name, mime: "application/pdf", dataUrl });
      } else if (TEXT_EXT.test(file.name) || file.type.startsWith("text/")) {
        const text = await readFileAsText(file);
        setAttachment({ kind: "text", filename: file.name, mime: file.type || "text/plain", text });
      } else {
        // Fall back to sending as a file blob (works for DOCX etc via Gemini)
        const dataUrl = await readFileAsDataUrl(file);
        setAttachment({ kind: "file", filename: file.name, mime: file.type || "application/octet-stream", dataUrl });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read file");
    }
  };

  const startRecording = async () => {
    if (recording || transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(node);
      node.connect(ctx.destination);
      recorderRef.current = { stream, ctx, chunks, node, source };
      setRecording(true);
    } catch {
      toast.error("Microphone access denied.");
    }
  };

  const stopRecording = async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    setRecording(false);
    rec.stream.getTracks().forEach((t) => t.stop());
    rec.node.disconnect();
    rec.source.disconnect();
    const sampleRate = rec.ctx.sampleRate;
    await rec.ctx.close();
    recorderRef.current = null;
    const wav = encodeWav(rec.chunks, sampleRate);
    if (wav.byteLength < 2048) return toast.error("Recording was empty — try again.");
    setTranscribing(true);
    try {
      const b64 = await blobToBase64(new Blob([wav], { type: "audio/wav" }));
      const res = await transcribeFn({ data: { audioBase64: b64, mime: "audio/wav" } });
      if (res.text) setInput((v) => (v ? v + " " : "") + res.text);
      else toast.error("Couldn't hear anything — try again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col" style={{ background: "var(--gradient-hero)" }}>
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button size="icon" variant="ghost"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[85vw] max-w-sm bg-sidebar border-sidebar-border">
            <SheetHeader className="p-4 border-b border-sidebar-border">
              <SheetTitle className="flex items-center gap-2">
                <NepalLogo size={28} />
                <span>Nepali Cooding AI</span>
              </SheetTitle>
            </SheetHeader>
            <div className="p-3">
              <Button
                onClick={() => startNew()}
                className="w-full gap-2 bg-[image:var(--gradient-primary)] text-primary-foreground"
              >
                <Plus className="h-4 w-4" /> New chat
              </Button>
            </div>
            <div className="px-2 pb-4 overflow-y-auto max-h-[calc(100dvh-180px)]">
              {conversations.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-6 text-center">No conversations yet.</p>
              )}
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm hover:bg-sidebar-accent",
                    activeId === c.id && "bg-sidebar-accent"
                  )}
                  onClick={() => selectConv(c.id)}
                >
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{c.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-sidebar-border bg-sidebar">
              <Link to="/settings">
                <Button variant="ghost" className="w-full justify-start gap-2">
                  <SettingsIcon className="h-4 w-4" /> Settings & API keys
                </Button>
              </Link>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <NepalLogo size={26} />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {activeConv?.title ?? "Nepali Cooding AI"}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Premium coding companion
            </div>
          </div>
        </div>

        <Link to="/settings">
          <Button size="icon" variant="ghost"><SettingsIcon className="h-5 w-5" /></Button>
        </Link>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && !sending && <EmptyState onPickLanguage={(l) => { setLanguage(l); setInput(`Give me a beginner-friendly starter program in ${l}.`); }} />}
          {messages.map((m, i) => {
            const isLastAssistant =
              m.role === "assistant" && i === messages.length - 1;
            const isLastUser =
              m.role === "user" &&
              !messages.slice(i + 1).some((n) => n.role === "user");
            return (
              <MessageBubble
                key={m.id}
                message={m}
                onRegenerate={isLastAssistant ? regenerate : undefined}
                onEdit={isLastUser ? (v) => editAndResend(m.id, v) : undefined}
                sending={sending}
              />
            );
          })}
          {sending && (
            <div className="flex gap-2 items-center text-muted-foreground text-sm px-1">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Thinking…
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/50 bg-background/80 backdrop-blur-xl px-3 pt-2 pb-3 space-y-2">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="h-9 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  <span className="mr-1.5">{l.emoji}</span>{l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none ml-auto">
            <Globe className={cn("h-3.5 w-3.5", webSearch && "text-primary")} />
            <span className="hidden sm:inline">Web</span>
            <Switch checked={webSearch} onCheckedChange={setWebSearch} />
          </label>
          <Button
            onClick={testNow}
            disabled={testing}
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Test
          </Button>
        </div>
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={`Ask anything about ${LANGUAGES.find((l) => l.id === language)?.label ?? "code"}…`}
            rows={1}
            className="min-h-[48px] max-h-40 resize-none bg-input/60 border-border/70"
          />
          <Button
            onClick={send}
            disabled={sending || !input.trim()}
            size="icon"
            className="h-12 w-12 shrink-0 bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-glow)]"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPickLanguage }: { onPickLanguage: (id: string) => void }) {
  return (
    <div className="text-center pt-8 pb-6 space-y-5">
      <div className="flex justify-center"><NepalLogo size={72} /></div>
      <div>
        <h2 className="text-2xl font-bold">Namaste 🙏</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a language to spark a chat, or just ask anything below.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
        {LANGUAGES.slice(0, 9).map((l) => (
          <button
            key={l.id}
            onClick={() => onPickLanguage(l.id)}
            className="rounded-xl border border-border/60 bg-card/50 hover:bg-card px-2 py-3 text-xs flex flex-col items-center gap-1 transition"
          >
            <span className="text-xl">{l.emoji}</span>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onRegenerate,
  onEdit,
  sending,
}: {
  message: Message;
  onRegenerate?: () => void | Promise<void>;
  onEdit?: (newContent: string) => void | Promise<void>;
  sending?: boolean;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const copyAll = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex flex-col items-end gap-1 max-w-[85%]">
          {editing ? (
            <div className="w-full rounded-2xl bg-[var(--user-bubble)] p-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="min-h-[80px] bg-transparent border-none focus-visible:ring-0 text-sm resize-none"
              />
              <div className="flex justify-end gap-1 mt-1">
                <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => { setEditing(false); setDraft(message.content); }}>
                  <X className="h-3 w-3" /> Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 gap-1"
                  disabled={sending || !draft.trim() || draft === message.content}
                  onClick={async () => { setEditing(false); await onEdit?.(draft.trim()); }}
                >
                  <RefreshCw className="h-3 w-3" /> Resend
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-[var(--user-bubble)] text-foreground rounded-br-md whitespace-pre-wrap">
              {message.content}
            </div>
          )}
          {onEdit && !editing && (
            <button
              onClick={() => { setDraft(message.content); setEditing(true); }}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>
      </div>
    );
  }

  // Split assistant content into alternating text / fenced-code segments so
  // explanations render in their own box and each code block sits separately.
  const segments = splitSegments(message.content);

  return (
    <div className="flex gap-2 justify-start">
      <div className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center bg-[image:var(--gradient-primary)] shadow-[var(--shadow-glow)]">
        <NepalLogo size={20} />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        {segments.map((seg, i) =>
          seg.type === "code" ? (
            <CodeBlock key={i} language={seg.lang} value={seg.value} />
          ) : (
            <div
              key={i}
              className="rounded-2xl rounded-bl-md border border-border/60 bg-card px-4 py-3 text-sm leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:mt-2 prose-headings:mb-2"
            >
              <ReactMarkdown
                components={{
                  code({ className, children }) {
                    return (
                      <code className={cn("rounded bg-muted px-1.5 py-0.5 text-xs font-mono", className)}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {seg.value}
              </ReactMarkdown>
            </div>
          ),
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={copyAll}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy answer"}
          </button>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={sending}
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" /> Regenerate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type Segment = { type: "text"; value: string } | { type: "code"; lang?: string; value: string };

function splitSegments(content: string): Segment[] {
  const out: Segment[] = [];
  const re = /```(\w+)?\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const text = content.slice(last, m.index).trim();
    if (text) out.push({ type: "text", value: text });
    out.push({ type: "code", lang: m[1], value: m[2].replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  const tail = content.slice(last).trim();
  if (tail) out.push({ type: "text", value: tail });
  if (out.length === 0) out.push({ type: "text", value: content });
  return out;
}