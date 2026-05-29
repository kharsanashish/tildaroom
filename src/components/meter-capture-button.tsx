import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Camera, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface MeterCaptureButtonProps {
  onReading: (value: number) => void;
  disabled?: boolean;
}

export function MeterCaptureButton({ onReading, disabled }: MeterCaptureButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [detected, setDetected] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (inputRef.current) inputRef.current.value = "";
    setLoading(true);

    try {
      const base64 = await fileToBase64(file, 1200);
      setPreview(`data:image/jpeg;base64,${base64}`);

      const reading = await readMeterOcr(base64);
      setDetected(reading !== null ? String(reading) : null);
      setEditValue(reading !== null ? String(reading) : "");
      setDialogOpen(true);
    } catch (err) {
      console.error(err);
      // Still open dialog so user can type manually
      setDetected(null);
      setEditValue("");
      setDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const confirm = () => {
    const val = parseInt(editValue, 10);
    if (isNaN(val) || val < 0) {
      toast.error("Please enter a valid reading.");
      return;
    }
    onReading(val);
    setDialogOpen(false);
    setPreview(null);
    toast.success(`Reading saved: ${val}`);
  };

  const retake = () => {
    setDialogOpen(false);
    setPreview(null);
    setTimeout(() => inputRef.current?.click(), 150);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCapture}
      />

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 flex-shrink-0"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || loading}
        title="Capture meter photo"
      >
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Camera className="h-4 w-4" />}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Meter Reading</DialogTitle>
          </DialogHeader>

          {/* Photo preview */}
          {preview && (
            <div className="rounded-lg overflow-hidden border bg-muted flex items-center justify-center max-h-52">
              <img src={preview} alt="Meter" className="max-h-52 w-full object-contain" />
            </div>
          )}

          <div className="space-y-2">
            {detected ? (
              <p className="text-xs text-center font-medium" style={{ color: "var(--success)" }}>
                ✓ Reading detected — correct below if needed
              </p>
            ) : (
              <p className="text-xs text-muted-foreground text-center">
                Read the 5 black digits on your meter (ignore the last red digit)
              </p>
            )}
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ""))}
              type="number"
              inputMode="numeric"
              placeholder="e.g. 1017"
              className="text-2xl font-bold text-center tracking-widest h-14"
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={retake} className="flex-1">
              <RefreshCw className="h-4 w-4 mr-1" /> Retake
            </Button>
            <Button onClick={confirm} disabled={!editValue} className="flex-1">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Use This
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── OCR.space API ─────────────────────────────────────────────────────────────
// Free demo key "helloworld" works up to 500 req/day — enough for any property app.
// Register free at ocr.space to get your own key for 25,000 req/month.

async function readMeterOcr(base64: string): Promise<number | null> {
  // Use env key if set, otherwise fall back to free demo key
  const apiKey = (import.meta.env.VITE_OCR_KEY as string) || "helloworld";

  const formData = new FormData();
  formData.append("base64Image", `data:image/jpeg;base64,${base64}`);
  formData.append("apikey", apiKey);
  formData.append("language", "eng");
  formData.append("isOverlayRequired", "false");
  formData.append("detectOrientation", "true");
  formData.append("scale", "true");           // auto-scale small text
  formData.append("OCREngine", "2");          // Engine 2 = better for printed text

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    console.error("OCR.space HTTP error:", res.status);
    return null;
  }

  const data = await res.json();

  if (data?.IsErroredOnProcessing) {
    console.error("OCR.space error:", data?.ErrorMessage);
    return null;
  }

  // Combine all parsed text from all pages
  const fullText: string = (data?.ParsedResults ?? [])
    .map((r: { ParsedText?: string }) => r.ParsedText ?? "")
    .join(" ");

  return parseMeterText(fullText);
}

// ── Parse meter reading from OCR text ────────────────────────────────────────
// Strategy:
// 1. Find all sequences of 5-7 consecutive digits
// 2. Prefer exactly 6 digits (full meter display)
// 3. Drop last digit (red drum), remove leading zeros

function parseMeterText(text: string): number | null {
  if (!text) return null;

  // Remove spaces between digits that OCR may have inserted
  const cleaned = text.replace(/(\d)\s+(\d)/g, "$1$2");

  // Find all digit sequences 5-7 chars long
  const matches = cleaned.match(/\d{5,7}/g);
  if (!matches || matches.length === 0) return null;

  // Prefer 6-digit sequence (exact meter display), else longest
  const best =
    matches.find((m) => m.length === 6) ??
    matches.sort((a, b) => b.length - a.length)[0];

  if (!best) return null;

  // Drop last digit (the red one), parse integer (removes leading zeros)
  const withoutRed = best.slice(0, -1);
  const value = parseInt(withoutRed, 10);
  return isNaN(value) ? null : value;
}

// ── File → base64 ─────────────────────────────────────────────────────────────

function fileToBase64(file: File, maxPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.onerror = reject;
      img.src = ev.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
