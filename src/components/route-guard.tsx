import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

export function RouteGuard({
  children,
  require,
}: {
  children: React.ReactNode;
  require: "owner" | "tenant" | "any";
}) {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (require !== "any" && role !== require) {
      if (role === "owner") navigate({ to: "/owner" });
      else if (role === "tenant") navigate({ to: "/tenant" });
      else navigate({ to: "/login" });
    } else setReady(true);
  }, [user, role, loading, require, navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}
