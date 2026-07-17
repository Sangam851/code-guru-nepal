import { Copy, Check, Eye, Code2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export function CodeBlock({ language, value }: { language?: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const lang = (language || "").toLowerCase();
  const canPreview = lang === "html" || lang === "htm" || /<html[\s>]|<!doctype html/i.test(value);
  const srcDoc = useMemo(() => {
    if (!canPreview) return "";
    // If it looks like a complete document, use as-is; otherwise wrap it.
    if (/<html[\s>]/i.test(value) || /<!doctype/i.test(value)) return value;
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;padding:12px;color:#111;background:#fff;}</style></head><body>${value}</body></html>`;
  }, [canPreview, value]);

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
    </div>
  );
}