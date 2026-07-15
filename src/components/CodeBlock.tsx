import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CodeBlock({ language, value }: { language?: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group rounded-xl overflow-hidden border border-border/60 bg-[#0d0d0d]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#1a1a1a] text-xs border-b border-border/60">
        <span className="text-muted-foreground uppercase tracking-wide">{language || "code"}</span>
        <Button size="sm" variant="ghost" className="h-7 px-2 gap-1.5 text-muted-foreground hover:text-foreground" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <pre className="m-0 p-3 overflow-x-auto text-[13px] leading-relaxed text-foreground/90 font-mono">
        <code>{value}</code>
      </pre>
    </div>
  );
}