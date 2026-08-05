import { Copy, Check, Eye, Code2, Play, Loader2, X, HelpCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { executeCode } from "@/lib/chat.functions";

const SANDBOX_LANGS = new Set(["html", "htm", "css"]);
// Infer the language when the AI omits the fence tag, so Preview/Run still work.
function inferLang(code: string): string {
  const c = code.trim();
  if (/^<!doctype html|<html[\s>]|<\/(div|body|head|h1|p)>/i.test(c)) return "html";
  if (/^[.#@a-z][\w\-\s.#:>,\[\]="']*\{[^}]*:[^}]*\}/i.test(c) && !/;\s*$/.test(c.split("\n")[0] ?? "")) return "css";
  if (/^\s*(#include\s*<|int\s+main\s*\()/m.test(c)) return /std::|iostream|cout/.test(c) ? "cpp" : "c";
  if (/^\s*(def |import |from .+ import |print\()/m.test(c)) return "python";
  if (/\bpublic\s+class\s+\w+|System\.out\.println/.test(c)) return "java";
  if (/\busing\s+System\b|Console\.WriteLine/.test(c)) return "csharp";
  if (/^\s*(package main|func main\()/m.test(c)) return "go";
  if (/^\s*(SELECT|INSERT|UPDATE|CREATE TABLE)\b/im.test(c)) return "sql";
  if (/\b(console\.log|function |const |let |=>)\b/.test(c)) return "javascript";
  return "";
}

// Languages the execution backend can actually run today.
const PISTON_LANGS = new Set([
  "python", "py", "javascript", "js", "typescript", "ts", "java", "c", "cpp",
  "c++", "csharp", "c#", "go",
]);

export function CodeBlock({
  language,
  value,
  onExplainError,
}: {
  language?: string;
  value: string;
  onExplainError?: (payload: { language: string; code: string; errorText: string }) => void | Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<null | {
    stdout?: string;
    stderr?: string;
    error?: string;
    exitCode?: number;
    sandboxDoc?: string;
  }>(null);
  const runFn = useServerFn(executeCode);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const declared = (language || "").toLowerCase();
  const lang = declared && declared !== "text" && declared !== "plaintext" ? declared : inferLang(value);
  const isHtml = lang === "html" || lang === "htm" || /<html[\s>]|<!doctype html/i.test(value);
  const canPreview = isHtml || SANDBOX_LANGS.has(lang) || lang === "javascript" || lang === "js";
  const canSandbox = SANDBOX_LANGS.has(lang) || isHtml;
  const canPiston = PISTON_LANGS.has(lang);
  const canRun = canSandbox || canPiston;
  const errorText = [runOutput?.error, runOutput?.stderr].filter(Boolean).join("\n").trim();
  const hasRealError = Boolean(errorText) && !runOutput?.sandboxDoc;

  const srcDoc = useMemo(() => {
    if (!canPreview) return "";
    if (/<html[\s>]/i.test(value) || /<!doctype/i.test(value)) return value;
    if (lang === "css") {
      return `<!doctype html><html><head><meta charset="utf-8"><style>${value}</style></head><body><h1>Heading</h1><p>Paragraph text for CSS preview.</p><button>Button</button></body></html>`;
    }
    if (lang === "javascript" || lang === "js") {
      return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;padding:10px;color:#111;background:#fff}#log{white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px}</style></head><body><div id="log"></div><script>
        const el=document.getElementById('log');
        const w=(...a)=>{el.textContent+=a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' ')+'\\n';};
        console.log=w;console.error=w;console.warn=w;console.info=w;
        window.onerror=(m)=>w('Error: '+m);
        try{${value}}catch(e){w('Error: '+e.message);}
      <\/script></body></html>`;
    }
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:12px;color:#111;background:#fff;}</style></head><body>${value}</body></html>`;
  }, [canPreview, lang, value]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setRunOutput(null);
    try {
      if (canSandbox) {
        setRunOutput({ sandboxDoc: srcDoc || value });
      } else {
        const res = await runFn({ data: { language: lang, code: value } });
        if (!res.ok) setRunOutput({ error: res.error });
        else setRunOutput({ stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode });
      }
    } catch (e) {
      setRunOutput({ error: e instanceof Error ? e.message : "Run failed" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="relative group rounded-xl overflow-hidden border border-border/60 bg-[#0d0d0d]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a1a] text-xs border-b border-border/60">
        <span className="text-muted-foreground uppercase tracking-wide">{language || "code"}</span>
        <div className="flex items-center gap-1">
          {canPreview && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPreview((s) => !s)}
            >
              {showPreview ? <Code2 className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{showPreview ? "Code" : "Preview"}</span>
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 gap-1.5 text-muted-foreground hover:text-foreground" onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      </div>
      {showPreview && canPreview ? (
        <iframe
          title="Live preview"
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className="w-full bg-white"
          style={{ height: 320, border: 0 }}
        />
      ) : (
        <pre className="m-0 p-3 overflow-x-auto text-[13px] leading-relaxed text-foreground/90 font-mono">
          <code>{value}</code>
        </pre>
      )}
      {canRun && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border/60 bg-[#141414]">
          <Button size="sm" variant="ghost" className="h-7 px-2 gap-1.5 text-xs" onClick={run} disabled={running}>
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 text-primary" />}
            {running ? "Running…" : canSandbox ? "Run" : "Run Code"}
          </Button>
          {!canSandbox && (
            <span className="text-[11px] text-muted-foreground">real execution (live runner API)</span>
          )}
          {runOutput && (
            <button
              onClick={() => setRunOutput(null)}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear output
            </button>
          )}
        </div>
      )}
      {hasRealError && onExplainError && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border/60 bg-[#141414]">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 gap-1.5 text-xs"
            onClick={() => void onExplainError({ language: lang || "code", code: value, errorText })}
          >
            <HelpCircle className="h-3.5 w-3.5 text-primary" /> Explain this error
          </Button>
        </div>
      )}
      {runOutput?.sandboxDoc && (
        <iframe
          title="Sandbox run"
          sandbox="allow-scripts"
          srcDoc={runOutput.sandboxDoc}
          className="w-full bg-white border-t border-border/60"
          style={{ height: 280, border: 0 }}
        />
      )}
      {runOutput && !runOutput.sandboxDoc && (
        <div className="border-t border-border/60 bg-[#0a0a0a] px-3 py-2 text-[12px] font-mono whitespace-pre-wrap max-h-64 overflow-auto">
          {runOutput.error && <div className="text-destructive">{runOutput.error}</div>}
          {runOutput.stdout && <div className="text-foreground/90">{runOutput.stdout}</div>}
          {runOutput.stderr && <div className="text-destructive">{runOutput.stderr}</div>}
          {!runOutput.error && !runOutput.stdout && !runOutput.stderr && (
            <div className="text-muted-foreground">(no output)</div>
          )}
        </div>
      )}
    </div>
  );
}