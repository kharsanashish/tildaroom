import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { mobileToEmail, normalizeMobile } from "@/lib/mobile";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { seedOwner } from "@/lib/admin.functions";
import { Building2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const seed = useServerFn(seedOwner);

  // Try to seed owner once on first visit (idempotent on the server).
  useEffect(() => {
    seed().catch(() => {});
  }, [seed]);

  useEffect(() => {
    if (loading) return;
    if (user && role === "owner") navigate({ to: "/owner" });
    else if (user && role === "tenant") navigate({ to: "/tenant" });
  }, [user, role, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = normalizeMobile(mobile);
    if (m.length < 10) return toast.error("Enter a valid mobile number");
    if (password.length < 4) return toast.error("Password too short");
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: mobileToEmail(m),
      password,
    });
    setSubmitting(false);
    if (error) toast.error("Invalid mobile or password");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10"
      style={{ backgroundImage: "radial-gradient(ellipse at top, oklch(0.94 0.05 280 / 0.4), transparent 60%)" }}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elevated)" }}>
            <Building2 className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Rent Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">किराया प्रबंधन / Flat Rent Management</p>
        </div>

        <Card className="p-6 shadow-lg" style={{ boxShadow: "var(--shadow-elevated)" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="mobile">मोबाइल नंबर / Mobile Number</Label>
              <Input
                id="mobile"
                type="tel"
                inputMode="numeric"
                placeholder="9876543210"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                autoComplete="username"
                className="mt-1.5 text-base"
              />
            </div>
            <div>
              <Label htmlFor="password">पासवर्ड / Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-1.5 text-base"
              />
            </div>
            <Button type="submit" className="w-full h-11 text-base" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "लॉगिन / Sign in"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Owner accounts are pre-configured. Tenants get credentials from the owner.
          </p>
        </Card>
      </div>
    </div>
  );
}
