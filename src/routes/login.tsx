import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { identifierToEmail } from "@/lib/identity";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { ownerExists } from "@/lib/admin.functions";
import { Building2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingOwner, setCheckingOwner] = useState(true);
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const checkOwner = useServerFn(ownerExists);

  // If no owner is configured yet, send user to /setup.
  useEffect(() => {
    let cancelled = false;
    checkOwner()
      .then((r) => {
        if (cancelled) return;
        if (!r.exists) navigate({ to: "/setup" });
        else setCheckingOwner(false);
      })
      .catch(() => setCheckingOwner(false));
    return () => { cancelled = true; };
  }, [checkOwner, navigate]);

  useEffect(() => {
    if (loading) return;
    if (user && role === "owner") navigate({ to: "/owner" });
    else if (user && role === "tenant") navigate({ to: "/tenant" });
  }, [user, role, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return toast.error("Enter your username or email");
    if (password.length < 4) return toast.error("Password too short");
    setSubmitting(true);
    const email = identifierToEmail(identifier);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) toast.error("Invalid credentials");
    // role-based redirect happens in the useEffect above once auth state updates
  };

  if (checkingOwner) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

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
          <p className="text-sm text-muted-foreground mt-1">Flat Rent Management</p>
        </div>

        <Card className="p-6 shadow-lg" style={{ boxShadow: "var(--shadow-elevated)" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="identifier">Username or Email</Label>
              <Input
                id="identifier"
                type="text"
                placeholder="Enter your username or email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                className="mt-1.5 text-base"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
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
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Owners log in with their email. Tenants log in with the username given by the owner.
          </p>
        </Card>
      </div>
    </div>
  );
}
