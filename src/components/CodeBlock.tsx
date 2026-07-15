import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
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
    <div className="relative group my-3 rounded-lg overflow-hidden border border-border/60">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 text-xs">
        <span className="text-muted-foreground uppercase tracking-wide">{language || "code"}</span>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        customStyle={{ margin: 0, padding: "12px", background: "transparent", fontSize: 13 }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}