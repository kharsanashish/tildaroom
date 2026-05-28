import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() =>
    typeof localStorage !== "undefined"
      ? localStorage.getItem("pwa-install-dismissed") === "1"
      : false
  );
  const [isIOS, setIsIOS] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    // Detect iOS Safari (no beforeinstallprompt support)
    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;
    const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
    setIsIOS(ios);
    if (ios && !standalone && !dismissed) setShowIOS(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [dismissed]);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setPrompt(null);
  };

  const dismiss = () => {
    setPrompt(null);
    setShowIOS(false);
    setDismissed(true);
    localStorage.setItem("pwa-install-dismissed", "1");
  };

  // Already installed or dismissed — show nothing
  if (dismissed) return null;
  if (!prompt && !showIOS) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto">
        <div
          className="rounded-2xl border shadow-2xl p-4 flex items-center gap-3"
          style={{ background: "var(--gradient-primary)", color: "#fff" }}
        >
          {/* App icon */}
          <img
            src="/icon-192.png"
            alt="TildaRoom"
            className="h-12 w-12 rounded-xl flex-shrink-0"
          />

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Install TildaRoom</div>
            <div className="text-xs opacity-80 mt-0.5">
              {isIOS
                ? 'Tap Share → "Add to Home Screen"'
                : "Add to home screen for the best experience"}
            </div>
          </div>

          <div className="flex gap-1 flex-shrink-0">
            {!isIOS && (
              <Button
                size="sm"
                onClick={install}
                className="h-8 px-3 text-xs font-semibold bg-white text-primary hover:bg-white/90"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Install
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={dismiss}
              className="h-8 w-8 text-white hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
