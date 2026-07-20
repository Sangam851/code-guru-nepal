import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Check, Crown, CreditCard, Wallet, Smartphone, Loader2 } from "lucide-react";
import { NepalLogo } from "@/components/NepalLogo";
import { getSubscription, setSubscription } from "@/lib/chat.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/subscription")({
  component: SubscriptionPage,
});

function SubscriptionPage() {
  const getSub = useServerFn(getSubscription);
  const setSub = useServerFn(setSubscription);
  const navigate = useNavigate();
  const [tier, setTier] = useState<"free" | "pro">("free");
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<"card" | "paypal" | "esewa" | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getSub();
        setTier(res.tier);
      } finally {
        setLoading(false);
      }
    })();
  }, [getSub]);

  const downgrade = async () => {
    await setSub({ data: { tier: "free" } });
    setTier("free");
    toast.success("Switched to Free plan.");
  };

  const proceedPayment = () => {
    if (!method) return toast.error("Choose a payment method.");
    toast.info("Payments coming soon", {
      description: "Real payment processing needs provider API keys — add them to enable checkout.",
    });
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-hero)" }}>
      <header className="sticky top-0 z-10 flex items-center gap-3 p-4 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <Link to="/chat">
          <Button size="icon" variant="ghost"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div className="flex items-center gap-2">
          <NepalLogo size={28} />
          <h1 className="text-lg font-semibold">Subscription</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <PlanCard
                title="Free"
                price="Rs 0"
                current={tier === "free"}
                features={["Access to Free models", "Web search", "Chat history", "Code execution"]}
                action={
                  tier === "pro" ? (
                    <Button variant="outline" className="w-full" onClick={downgrade}>Switch to Free</Button>
                  ) : (
                    <Button variant="outline" className="w-full" disabled>Current plan</Button>
                  )
                }
              />
              <PlanCard
                title="Pro"
                price="Rs 499 / month"
                highlight
                current={tier === "pro"}
                features={[
                  "Unlocks all Pro models",
                  "Higher-quality answers",
                  "Priority routing",
                  "Everything in Free",
                ]}
                action={
                  tier === "pro" ? (
                    <Button variant="outline" className="w-full" disabled>You're Pro ✨</Button>
                  ) : (
                    <Button
                      className="w-full bg-[image:var(--gradient-primary)] text-primary-foreground"
                      onClick={() => document.getElementById("pay")?.scrollIntoView({ behavior: "smooth" })}
                    >
                      <Crown className="h-4 w-4 mr-1.5" /> Upgrade to Pro
                    </Button>
                  )
                }
              />
            </div>

            {tier !== "pro" && (
              <Card id="pay" className="p-5 space-y-4 bg-card/70 border-border/60 backdrop-blur">
                <div>
                  <h2 className="font-semibold">Choose a payment method</h2>
                  <p className="text-xs text-muted-foreground mt-1">Payments are coming soon. Pick one to be notified.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <PayOption icon={<CreditCard className="h-4 w-4" />} label="International Card" active={method === "card"} onClick={() => setMethod("card")} />
                  <PayOption icon={<Wallet className="h-4 w-4" />} label="PayPal" active={method === "paypal"} onClick={() => setMethod("paypal")} />
                  <PayOption icon={<Smartphone className="h-4 w-4" />} label="eSewa" active={method === "esewa"} onClick={() => setMethod("esewa")} />
                </div>
                <Button className="w-full" onClick={proceedPayment}>Continue</Button>
                <p className="text-[11px] text-muted-foreground text-center">
                  Prefer to test?{" "}
                  <button
                    className="underline hover:text-foreground"
                    onClick={async () => {
                      await setSub({ data: { tier: "pro" } });
                      setTier("pro");
                      toast.success("Pro enabled (test mode).");
                      navigate({ to: "/chat" });
                    }}
                  >
                    Enable Pro in test mode
                  </button>
                </p>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function PlanCard({
  title, price, features, action, highlight, current,
}: {
  title: string; price: string; features: string[]; action: React.ReactNode; highlight?: boolean; current?: boolean;
}) {
  return (
    <Card className={`p-5 space-y-4 bg-card/70 border-border/60 backdrop-blur ${highlight ? "ring-1 ring-primary/40" : ""}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          {title}
          {highlight && <Crown className="h-4 w-4 text-primary" />}
        </h3>
        {current && <span className="text-[10px] uppercase tracking-wider text-primary">Current</span>}
      </div>
      <div className="text-2xl font-bold">{price}</div>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /> {f}
          </li>
        ))}
      </ul>
      {action}
    </Card>
  );
}

function PayOption({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-3 py-3 text-sm transition ${active ? "border-primary bg-primary/10" : "border-border/60 hover:bg-card"}`}
    >
      {icon} {label}
    </button>
  );
}