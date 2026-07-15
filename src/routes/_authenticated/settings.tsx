import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { NepalLogo } from "@/components/NepalLogo";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [aiKey, setAiKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("user_settings").select("*").maybeSingle();
      if (data) {
        setProvider(data.provider ?? "openai");
        setModel(data.model ?? "gpt-4o-mini");
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
                    setModel(v === "anthropic" ? "claude-3-5-sonnet-latest" : "gpt-4o-mini");
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Model</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{provider === "anthropic" ? "Anthropic" : "OpenAI"} API key</Label>
                <Input
                  type="password"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
                />
                <p className="text-xs text-muted-foreground">Stored securely, only readable by you.</p>
              </div>
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

            <Button onClick={signOut} variant="outline" className="w-full h-11">Sign out</Button>
          </>
        )}
      </main>
    </div>
  );
}