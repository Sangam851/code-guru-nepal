import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Sparkles, Globe, ShieldCheck } from "lucide-react";
import { NepalLogo } from "@/components/NepalLogo";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
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
        <Card className="p-5 space-y-3 bg-card/70 border-border/60 backdrop-blur">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">AI provider</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Nepali Cooding AI runs on the built-in Lovable AI Gateway. No API key or setup required — it's ready to use out of the box.
          </p>
        </Card>

        <Card className="p-5 space-y-3 bg-card/70 border-border/60 backdrop-blur">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Web search</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Live web search is powered by Tavily and enabled by default. Toggle the <span className="text-foreground">Web</span> switch in chat whenever you want fresh results from the internet.
          </p>
        </Card>

        <Card className="p-5 space-y-3 bg-card/70 border-border/60 backdrop-blur">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Account</h2>
          </div>
          <Button onClick={signOut} variant="outline" className="w-full h-11">Sign out</Button>
        </Card>
      </main>
    </div>
  );
}