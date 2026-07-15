import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, KeyRound, Zap } from "lucide-react";
import { toast } from "sonner";
import { NepalLogo } from "@/components/NepalLogo";
import { useServerFn } from "@tanstack/react-start";
import { testProvider } from "@/lib/chat.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [provider, setProvider] = useState("lovable");
  const [model, setModel] = useState("google/gemini-3.5-flash");
  const [aiKey, setAiKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const runTest = useServerFn(testProvider);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      if (data) {
        setProvider(data.provider ?? "lovable");
        setModel(data.model ?? "google/gemini-3.5-flash");
        setAiKey(data.ai_api_key ?? "");
        setTavilyKey(data.tavily_api_key ?? "");
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return;
    const { error } = await supabase.from("user_settings").upsert({
      user_id: uid,
      provider,
      model,
      ai_api_key: aiKey || null,
      tavily_api_key: tavilyKey || null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const testNow = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await runTest({ data: { provider, model, apiKey: aiKey || undefined } });
      if (res.ok) {
        setTestResult({ ok: true, text: `OK (${res.ms}ms) — "${res.reply}"` });
        toast.success("Provider works");
      } else {
        setTestResult({ ok: false, text: res.error ?? "Unknown error" });
        toast.error("Test failed");
      }
    } catch (e) {
      setTestResult({ ok: false, text: (e as Error).message });
      toast.error("Test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-hero)" }}>
      <header className="sticky top-0 z-10 flex items-center gap-3 p-4 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <Link to="/chat">
          <Button size="icon" variant="ghost"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex items-center gap-2">
          <NepalLogo size={28} />
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            <Card className="p-5 space-y-4 bg-card/70 border-border/60 backdrop-blur">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">AI provider</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Provider</Label>
                  <Select value={provider} onValueChange={(v) => {
                    setProvider(v);
                    const defaults: Record<string, string> = {
                      lovable: "google/gemini-3.5-flash",
                      openai: "gpt-4o-mini",
                      anthropic: "claude-3-5-sonnet-latest",
                      openrouter: "anthropic/claude-sonnet-4.5",
                    };
                    setModel(defaults[v] ?? "google/gemini-3.5-flash");
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lovable">Lovable AI (built-in, no key)</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Model</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} />
                </div>
              </div>
              {provider !== "lovable" && (
                <div className="space-y-1.5">
                  <Label>
                    {provider === "anthropic" ? "Anthropic" : provider === "openrouter" ? "OpenRouter" : "OpenAI"} API key
                  </Label>
                  <Input
                    type="password"
                    value={aiKey}
                    onChange={(e) => setAiKey(e.target.value)}
                    placeholder={provider === "anthropic" ? "sk-ant-..." : provider === "openrouter" ? "sk-or-..." : "sk-..."}
                  />
                  <p className="text-xs text-muted-foreground">Stored securely, only readable by you.</p>
                </div>
              )}
              {provider === "lovable" && (
                <p className="text-xs text-muted-foreground">
                  Uses the built-in Lovable AI Gateway — no API key needed. Try models like <code>google/gemini-3.5-flash</code>, <code>openai/gpt-5.4-mini</code>, or <code>openai/gpt-5.5</code>.
                </p>
              )}
            </Card>

            <Card className="p-5 space-y-3 bg-card/70 border-border/60 backdrop-blur">
              <h2 className="font-semibold">Web search (Tavily)</h2>
              <div className="space-y-1.5">
                <Label>Tavily API key</Label>
                <Input
                  type="password"
                  value={tavilyKey}
                  onChange={(e) => setTavilyKey(e.target.value)}
                  placeholder="tvly-..."
                />
                <p className="text-xs text-muted-foreground">Get one free at tavily.com. Enables the live web search toggle in chat.</p>
              </div>
            </Card>

            <Button
              onClick={save}
              disabled={saving}
              className="w-full h-11 bg-[image:var(--gradient-primary)] hover:opacity-90 text-primary-foreground font-medium"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save settings"}
            </Button>

            <Button
              onClick={testNow}
              disabled={testing}
              variant="secondary"
              className="w-full h-11"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Zap className="h-4 w-4 mr-2" />Test provider & model</>}
            </Button>
            {testResult && (
              <div className={`text-sm rounded-md border p-3 ${testResult.ok ? "border-green-500/40 text-green-400 bg-green-500/5" : "border-destructive/40 text-destructive bg-destructive/5"}`}>
                {testResult.text}
              </div>
            )}

            <Button onClick={signOut} variant="outline" className="w-full h-11">Sign out</Button>
          </>
        )}
      </main>
    </div>
  );
}