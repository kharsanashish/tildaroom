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
      const canvas = await fileToCanvas(file, 1400);
      setPreview(canvas.toDataURL("image/jpeg", 0.6));
      const processed = isolateDigitWindow(canvas);
      const base64 = processed.toDataURL("image/jpeg", 0.95).split(",")[1];
      const reading = await ocrSpace(base64);
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
        disabled={disabled || loading} title="Capture meter reading">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Meter Reading</DialogTitle></DialogHeader>
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
                Could not auto-detect. Type the 5 black digits (ignore last red digit).
              </p>
            )}
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ""))}
              type="number" inputMode="numeric" placeholder="e.g. 613"
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

// ─────────────────────────────────────────────────────────────────────────────
// DIGIT WINDOW DETECTION
//
// The digit strip is a horizontal band with:
//   1. DARK pixels (black drum background)        → dark_fraction > 0
//   2. BRIGHT pixels (white digits)               → bright_fraction > 0
//   3. Bright pixels SPREAD across full row width → bright_span > 0.3
//      (rules out single LED spots, reflections)
//
// Score = dark_fraction × bright_fraction × bright_span
//
// LED spot:      dark=0.10 × bright=0.06 × span=0.03  = 0.00018  ← tiny
// Digit window:  dark=0.50 × bright=0.22 × span=0.60  = 0.066    ← large ✓
// ─────────────────────────────────────────────────────────────────────────────

function isolateDigitWindow(src: HTMLCanvasElement): HTMLCanvasElement {
  const W = src.width, H = src.height;
  const ctx = src.getContext("2d")!;
  const d = ctx.getImageData(0, 0, W, H).data;

  const lum = (x: number, y: number): number => {
    const i = (y * W + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };

  // ── Score every row (top 65% only — display always in upper half) ──────────
  const scores: number[] = new Array(H).fill(0);

  for (let y = 0; y < Math.floor(H * 0.65); y++) {
    let dark = 0, bright = 0;
    let firstBright = W, lastBright = -1;

    for (let x = 0; x < W; x++) {
      const l = lum(x, y);
      if (l < 65)  { dark++; }
      if (l > 160) {                        // lowered from 175 → catches dimmer digits
        bright++;
        if (x < firstBright) firstBright = x;
        if (x > lastBright)  lastBright  = x;
      }
    }

    const darkF    = dark   / W;
    const brightF  = bright / W;
    const brightSpan = lastBright > firstBright ? (lastBright - firstBright) / W : 0;

    // Digit window conditions:
    //   darkF   > 0.20  → must have dark background (not white face plate)
    //   brightF > 0.05  → must have some bright digits
    //   brightF < 0.60  → NOT mostly white (eliminates "AN ISO 9001:2000" text rows)
    //   brightSpan > 0.18 → bright pixels spread across row (not just one LED spot)
    if (darkF > 0.20 && brightF > 0.05 && brightF < 0.60 && brightSpan >= 0.18) {
      scores[y] = darkF * brightF * brightSpan;
    }
  }

  // ── Find peak, expand band ────────────────────────────────────────────────
  let peakY = 0;
  for (let y = 1; y < H; y++) {
    if (scores[y] > scores[peakY]) peakY = y;
  }

  // If max score is near zero, no digit window found — fallback to top third
  if (scores[peakY] < 0.001) {
    return fallbackCrop(src, W, H);
  }

  // Expand up/down while score stays above 25% of peak
  const thresh = scores[peakY] * 0.25;
  let topRow = peakY, bottomRow = peakY;
  while (topRow > 0        && scores[topRow - 1]    >= thresh) topRow--;
  while (bottomRow < H - 1 && scores[bottomRow + 1] >= thresh) bottomRow++;

  // Padding
  topRow    = Math.max(0,     topRow    - 12);
  bottomRow = Math.min(H - 1, bottomRow + 12);

  // ── Find horizontal extent of the dark+bright content ─────────────────────
  let leftCol = W, rightCol = 0;
  for (let y = topRow; y <= bottomRow; y++) {
    for (let x = 0; x < W; x++) {
      const l = lum(x, y);
      if (l < 65 || l > 175) {
        if (x < leftCol) leftCol = x;
        if (x > rightCol) rightCol = x;
      }
    }
  }
  if (leftCol >= rightCol) { leftCol = 0; rightCol = W; }

  leftCol  = Math.max(0,     leftCol  - 12);
  rightCol = Math.min(W - 1, rightCol + 12);

  return cropInvertUpscale(src, leftCol, topRow, rightCol - leftCol, bottomRow - topRow);
}

// Fallback: just take the top 35%
function fallbackCrop(src: HTMLCanvasElement, W: number, H: number): HTMLCanvasElement {
  return cropInvertUpscale(src, 0, 0, W, Math.round(H * 0.35));
}

// Crop → upscale 4× → invert colours (white digits become black for OCR)
function cropInvertUpscale(
  src: HTMLCanvasElement,
  x: number, y: number, w: number, h: number
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width  = w * 4;
  out.height = h * 4;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, x, y, w, h, 0, 0, out.width, out.height);

  const img = octx.getImageData(0, 0, out.width, out.height);
  const od = img.data;
  for (let i = 0; i < od.length; i += 4) {
    od[i]     = 255 - od[i];
    od[i + 1] = 255 - od[i + 1];
    od[i + 2] = 255 - od[i + 2];
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// ── OCR.space ─────────────────────────────────────────────────────────────────

async function ocrSpace(base64: string): Promise<number | null> {
  const apiKey = (import.meta.env.VITE_OCR_KEY as string) || "helloworld";
  const form = new FormData();
  form.append("base64Image", `data:image/jpeg;base64,${base64}`);
  form.append("apikey", apiKey);
  form.append("language", "eng");
  form.append("isOverlayRequired", "false");
  form.append("detectOrientation", "false");
  form.append("scale", "true");
  form.append("OCREngine", "2");

  const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: form });
  if (!res.ok) return null;
  const data = await res.json();
  if (data?.IsErroredOnProcessing) return null;

  const text: string = (data?.ParsedResults ?? [])
    .map((r: { ParsedText?: string }) => r.ParsedText ?? "")
    .join(" ");

  return parseMeterText(text);
}

// ── Parse: find 6-digit sequence, drop last (red drum) ───────────────────────

function parseMeterText(raw: string): number | null {
  if (!raw) return null;

  // Collapse space-separated digits: "0 0 6 1 3 5" → "006135"
  let t = raw;
  for (let i = 0; i < 7; i++) t = t.replace(/(\d) (\d)/g, "$1$2");

  const seqs = t.match(/\d+/g) ?? [];

  // Priority 1: exactly 6 digits → drop last = reading
  const six = seqs.find(s => s.length === 6);
  if (six) return parseInt(six.slice(0, -1), 10);

  // Priority 2: 7 digits → take first 6 → drop last
  const seven = seqs.find(s => s.length === 7);
  if (seven) return parseInt(seven.slice(0, 6).slice(0, -1), 10);

  // Priority 3: 5 digits → already without red digit
  const five = seqs
    .filter(s => s.length === 5)
    .sort((a, b) => (a.startsWith("0") ? -1 : 1))[0];
  if (five) return parseInt(five, 10);

  // Priority 4: longest sequence ≥ 4
  const best = seqs.filter(s => s.length >= 4)
                   .sort((a, b) => b.length - a.length)[0];
  if (best) return parseInt(best.slice(0, Math.min(best.length, 5)), 10);

  return null;
}

// ── File → Canvas ─────────────────────────────────────────────────────────────

function fileToCanvas(file: File, maxPx: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width  = Math.round(img.width  * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        resolve(c);
      };
      img.onerror = reject;
      img.src = ev.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
