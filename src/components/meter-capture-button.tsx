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
                Could not detect. Type the 5 black digits (ignore last red digit).
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
// Score each row in top 65% by (trueBlackFrac × trueWhiteFrac × whiteSpan).
// Peak row = digit display band. Expand while ≥ 20% of peak. Crop, upscale 4×, invert.
// ─────────────────────────────────────────────────────────────────────────────

const TRUE_BLACK = 40;
const TRUE_WHITE = 200;

function isolateDigitWindow(src: HTMLCanvasElement): HTMLCanvasElement {
  const W = src.width, H = src.height;
  const ctx = src.getContext("2d")!;
  const d = ctx.getImageData(0, 0, W, H).data;

  const lum = (x: number, y: number): number => {
    const i = (y * W + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };

  const scanLimit = Math.floor(H * 0.65);
  const scores = new Float32Array(H);

  for (let y = 0; y < scanLimit; y++) {
    let black = 0, white = 0;
    let firstWhite = W, lastWhite = -1;
    for (let x = 0; x < W; x++) {
      const l = lum(x, y);
      if (l < TRUE_BLACK) black++;
      if (l > TRUE_WHITE) {
        white++;
        if (x < firstWhite) firstWhite = x;
        if (x > lastWhite) lastWhite = x;
      }
    }
    const blackF = black / W;
    const whiteF = white / W;
    const whiteSpan = lastWhite > firstWhite ? (lastWhite - firstWhite) / W : 0;
    scores[y] = whiteSpan >= 0.20 ? blackF * whiteF * whiteSpan : 0;
  }

  let peakY = 0;
  for (let y = 1; y < H; y++) if (scores[y] > scores[peakY]) peakY = y;

  if (scores[peakY] < 0.0005) {
    return cropInvertUpscale(src, 0, 0, W, Math.round(H * 0.40));
  }

  const thresh = scores[peakY] * 0.20;
  let top = peakY, bottom = peakY;
  while (top > 0 && scores[top - 1] >= thresh) top--;
  while (bottom < H - 1 && scores[bottom + 1] >= thresh) bottom++;

  top = Math.max(0, top - 15);
  bottom = Math.min(H - 1, bottom + 15);

  let leftCol = W, rightCol = 0;
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < W; x++) {
      const l = lum(x, y);
      if (l < TRUE_BLACK || l > TRUE_WHITE) {
        if (x < leftCol) leftCol = x;
        if (x > rightCol) rightCol = x;
      }
    }
  }
  if (leftCol >= rightCol) { leftCol = 0; rightCol = W; }
  leftCol = Math.max(0, leftCol - 15);
  rightCol = Math.min(W - 1, rightCol + 15);

  return cropInvertUpscale(src, leftCol, top, rightCol - leftCol, bottom - top);
}

function cropInvertUpscale(
  src: HTMLCanvasElement,
  x: number, y: number, w: number, h: number
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(w * 4, 400);
  out.height = Math.max(h * 4, 100);
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, x, y, w, h, 0, 0, out.width, out.height);

  const img = octx.getImageData(0, 0, out.width, out.height);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i]     = 255 - img.data[i];
    img.data[i + 1] = 255 - img.data[i + 1];
    img.data[i + 2] = 255 - img.data[i + 2];
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// ── OCR.space ────────────────────────────────────────────────────────────────

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

// ── Parse OCR → meter reading ────────────────────────────────────────────────
// Priority order (per spec):
//  1. 6-digit sequence starting with "0" → drop last digit, parse int
//  2. Any other 6-digit sequence → drop last digit
//  3. 7-digit sequence → first 6, drop last
//  4. 5-digit sequence → parse directly
// "Starts with 0" wins because ISO/serial numbers (9001, 2000, 3200, 3788) never do.

function parseMeterText(raw: string): number | null {
  if (!raw) return null;

  let t = raw;
  for (let i = 0; i < 7; i++) t = t.replace(/(\d) (\d)/g, "$1$2");

  const seqs = t.match(/\d+/g) ?? [];

  // Priority 1: 6 digits starting with 0
  const sixZero = seqs.find(s => s.length === 6 && s.startsWith("0"));
  if (sixZero) return parseInt(sixZero.slice(0, 5), 10);

  // Priority 2: any 6 digits
  const six = seqs.find(s => s.length === 6);
  if (six) return parseInt(six.slice(0, 5), 10);

  // Priority 3: 7 digits → take first 6, drop last
  const seven = seqs.find(s => s.length === 7);
  if (seven) return parseInt(seven.slice(0, 6).slice(0, -1), 10);

  // Priority 4: 5 digits direct
  const five = seqs.find(s => s.length === 5);
  if (five) return parseInt(five, 10);

  return null;
}

// ── File → Canvas ────────────────────────────────────────────────────────────

function fileToCanvas(file: File, maxPx: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
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
