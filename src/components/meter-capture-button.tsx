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
      // Full image preview
      const fullBase64 = await fileToBase64(file, 1400);
      setPreview(`data:image/jpeg;base64,${fullBase64}`);

      // Crop to top 40% where digit display always lives, then upscale
      const canvas = await base64ToCanvas(fullBase64);
      const cropped = cropAndUpscale(canvas);
      const croppedBase64 = canvasToBase64(cropped);

      const reading = await readMeterOcr(croppedBase64);
      setDetected(reading !== null ? String(reading) : null);
      setEditValue(reading !== null ? String(reading) : "");
      setDialogOpen(true);
    } catch (err) {
      console.error(err);
      setDetected(null);
      setEditValue("");
      setDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const confirm = () => {
    const val = parseInt(editValue, 10);
    if (isNaN(val) || val < 0) { toast.error("Enter a valid reading."); return; }
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
      <input ref={inputRef} type="file" accept="image/*"
        capture="environment" className="hidden" onChange={handleCapture} />

      <Button type="button" variant="outline" size="icon"
        className="h-9 w-9 flex-shrink-0"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || loading}
        title="Capture meter reading">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Meter Reading</DialogTitle>
          </DialogHeader>

          {preview && (
            <div className="rounded-lg overflow-hidden border bg-muted flex items-center justify-center max-h-52">
              <img src={preview} alt="Meter" className="max-h-52 w-full object-contain" />
            </div>
          )}

          <div className="space-y-2">
            {detected ? (
              <p className="text-xs text-center font-medium" style={{ color: "var(--success)" }}>
                ✓ Detected: {detected} — correct below if wrong
              </p>
            ) : (
              <p className="text-xs text-muted-foreground text-center">
                Could not auto-detect. Look at the 5 black digits on your meter
                (ignore the last red digit) and type below.
              </p>
            )}
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ""))}
              type="number"
              inputMode="numeric"
              placeholder="e.g. 1553"
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

// ── Image: crop top 40% and upscale 2× ────────────────────────────────────────
// All meter displays in these photos sit in the top 30–40% of the image.
// Cropping removes serial numbers, brand text, etc. that confuse OCR.

function cropAndUpscale(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const srcH = Math.round(canvas.height * 0.40); // top 40%
  const out = document.createElement("canvas");
  out.width  = canvas.width  * 2;   // 2× upscale for cleaner OCR
  out.height = srcH * 2;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, canvas.width, srcH, 0, 0, out.width, out.height);
  return out;
}

// ── OCR.space ─────────────────────────────────────────────────────────────────

async function readMeterOcr(base64: string): Promise<number | null> {
  const apiKey = (import.meta.env.VITE_OCR_KEY as string) || "helloworld";

  const form = new FormData();
  form.append("base64Image", `data:image/jpeg;base64,${base64}`);
  form.append("apikey", apiKey);
  form.append("language", "eng");
  form.append("isOverlayRequired", "false");
  form.append("detectOrientation", "true");
  form.append("scale", "true");
  form.append("OCREngine", "2");

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: form,
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (data?.IsErroredOnProcessing) return null;

  const fullText: string = (data?.ParsedResults ?? [])
    .map((r: { ParsedText?: string }) => r.ParsedText ?? "")
    .join("\n");

  return parseMeterText(fullText);
}

// ── Parse OCR text → meter reading ───────────────────────────────────────────
// Handles 3 OCR output patterns:
//   A) "015537"          → 6 digits together
//   B) "0 1 5 5 3 7"     → space-separated single digits
//   C) "01553 7"         → mostly together, one gap

function parseMeterText(raw: string): number | null {
  if (!raw) return null;

  // ── Pattern A: 6 consecutive digits ──────────────────────────────────────
  let m = raw.match(/\b(\d{6})\b/g);
  if (m) {
    // Prefer one that starts with 0 (meter readings start with leading zeros)
    const best = m.find(s => s.startsWith("0")) ?? m[0];
    return toReading(best);
  }

  // ── Pattern B: single digits separated by spaces "0 1 5 5 3 7" ───────────
  // Also handles "01 55 37" (pairs) or "0155 37"
  m = raw.match(/\b\d[\s\d]{8,12}\d\b/g);
  if (m) {
    const candidates = m
      .map(s => s.replace(/\s+/g, ""))       // collapse all spaces
      .filter(s => s.length >= 5 && s.length <= 7);
    const best = candidates.find(s => s.startsWith("0") && s.length === 6)
      ?? candidates.find(s => s.length >= 5);
    if (best) return toReading(best.length === 5 ? `${best}0` : best);
  }

  // ── Pattern C: 5-digit sequence (already without red digit) ──────────────
  m = raw.match(/\b(\d{5})\b/g);
  if (m) {
    const best = m.find(s => s.startsWith("0")) ?? m[0];
    // 5 digits = OCR dropped the red digit already → parse directly
    return parseInt(best, 10);
  }

  // ── Fallback: collapse all digits in the text ─────────────────────────────
  const allDigits = raw.replace(/\D/g, "");
  if (allDigits.length >= 5) {
    // Take first 6 digits
    const chunk = allDigits.slice(0, 6);
    return toReading(chunk.length === 6 ? chunk : chunk.padEnd(6, "0"));
  }

  return null;
}

// Drop last digit (red drum), remove leading zeros
function toReading(sixDigits: string): number {
  const without = sixDigits.slice(0, -1);   // drop last (red digit)
  return parseInt(without, 10);             // parseInt removes leading zeros
}

// ── Canvas / base64 helpers ───────────────────────────────────────────────────

function fileToBase64(file: File, maxPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width  = Math.round(img.width  * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.88).split(",")[1]);
      };
      img.onerror = reject;
      img.src = ev.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ToCanvas(b64: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      c.getContext("2d")!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = reject;
    img.src = `data:image/jpeg;base64,${b64}`;
  });
}

function canvasToBase64(c: HTMLCanvasElement): string {
  return c.toDataURL("image/jpeg", 0.92).split(",")[1];
}
