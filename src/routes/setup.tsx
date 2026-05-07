import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { createOwner, ownerExists } from "@/lib/admin.functions";
import { toast } from "sonner";
import { Building2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/setup")({
  component: Setup,
});

function Setup() {
  const navigate = useNavigate();
  const checkOwner = useServerFn(ownerExists);
  const create = useServerFn(createOwner);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkOwner()
      .then((r) => {
        if (r.exists) navigate({ to: "/login" });
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [checkOwner, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Enter your name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Enter a valid email");
    if (password.length < 6) return toast.error("Password must be 6+ characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setSubmitting(true);
    const r = await create({ data: { email: email.trim(), password, name: name.trim() } });
    setSubmitting(false);
    if (!r.ok) return toast.error(r.error || "Setup failed");
    toast.success("Owner account created. Please sign in.");
    navigate({ to: "/login" });
  };

  if (checking) {
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
          <h1 className="text-2xl font-bold tracking-tight">First-time Setup</h1>
          <p className="text-sm text-muted-foreground mt-1">Create your owner account</p>
        </div>

        <Card className="p-6" style={{ boxShadow: "var(--shadow-elevated)" }}>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="name">Your Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="confirm">Confirm Password</Label>
              <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5" />
            </div>
            <Button type="submit" className="w-full h-11" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Owner Account"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            This screen only appears on first launch.
          </p>
        </Card>
      </div>
    </div>
  );
}
