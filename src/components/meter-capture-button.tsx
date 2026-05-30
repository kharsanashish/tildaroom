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
                Could not auto-detect. Type the 5 black digits (ignore the last red digit).
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
// DIGIT WINDOW ISOLATION
//
// The meter digit display is unique: it has BOTH very dark pixels (black bg)
// AND very bright pixels (white digits) in the same rows.
// Score = dark_fraction × bright_fraction   ← highest for digit window rows
//
// Metal casing / wall: high dark, low bright → low score
// White face plate text: low dark, high bright → low score
// Digit window: both dark AND bright → HIGH score  ✓
// ─────────────────────────────────────────────────────────────────────────────

function isolateDigitWindow(src: HTMLCanvasElement): HTMLCanvasElement {
  const W = src.width, H = src.height;
  const ctx = src.getContext("2d")!;
  const d = ctx.getImageData(0, 0, W, H).data;

  const lum = (x: number, y: number): number => {
    const i = (y * W + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };

  // ── Step 1: Score each row by bimodal contrast ────────────────────────────
  // Only scan top 65% — digit display is always in upper portion of photo
  const scores: number[] = new Array(H).fill(0);
  for (let y = 0; y < Math.floor(H * 0.65); y++) {
    let dark = 0, bright = 0;
    for (let x = 0; x < W; x++) {
      const l = lum(x, y);
      if (l < 60)  dark++;    // very dark = black background
      if (l > 180) bright++;  // very bright = white digit
    }
    const df = dark / W;
    const bf = bright / W;
    // Bimodal score: both dark AND bright pixels in same row = digit window
    scores[y] = df * bf;
  }

  // ── Step 2: Find peak score row, expand to full band ─────────────────────
  let peakY = 0;
  for (let y = 1; y < H; y++) {
    if (scores[y] > scores[peakY]) peakY = y;
  }

  // Expand upward and downward while score stays above 30% of peak
  const threshold = scores[peakY] * 0.30;
  let topRow = peakY, bottomRow = peakY;
  while (topRow > 0    && scores[topRow - 1] >= threshold) topRow--;
  while (bottomRow < H - 1 && scores[bottomRow + 1] >= threshold) bottomRow++;

  // Safety: if band is tiny (< 1% of height), fallback to top third
  if (bottomRow - topRow < H * 0.01) {
    topRow    = Math.round(H * 0.05);
    bottomRow = Math.round(H * 0.38);
  }

  // Vertical padding
  topRow    = Math.max(0, topRow - 10);
  bottomRow = Math.min(H - 1, bottomRow + 10);

  // ── Step 3: Find horizontal extent within the detected band ───────────────
  let leftCol = W, rightCol = 0;
  for (let y = topRow; y <= bottomRow; y++) {
    for (let x = 0; x < W; x++) {
      const l = lum(x, y);
      if (l < 60 || l > 180) {          // dark OR bright pixel → digit window content
        if (x < leftCol) leftCol = x;
        if (x > rightCol) rightCol = x;
      }
    }
  }
  if (leftCol >= rightCol) { leftCol = 0; rightCol = W; }

  // Horizontal padding
  leftCol  = Math.max(0, leftCol - 10);
  rightCol = Math.min(W - 1, rightCol + 10);

  const cropW = rightCol - leftCol;
  const cropH = bottomRow - topRow;

  // ── Step 4: Crop → upscale 4× → invert ────────────────────────────────────
  // Invert so white-on-black becomes black-on-white → OCR reads easily
  const out = document.createElement("canvas");
  out.width  = cropW * 4;
  out.height = cropH * 4;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, leftCol, topRow, cropW, cropH, 0, 0, out.width, out.height);

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

// ── Parse OCR text → meter reading ───────────────────────────────────────────
// Digit window has 6 digits: first 5 are the reading, last is red (ignored).
// OCR may return them together "006135" or spaced "0 0 6 1 3 5".

function parseMeterText(raw: string): number | null {
  if (!raw) return null;

  // Collapse space-separated digits without lookbehind (broad browser support)
  // "0 0 6 1 3 5" → "006135"
  let t = raw;
  for (let i = 0; i < 6; i++) {
    t = t.replace(/(\d) (\d)/g, "$1$2");
  }

  // Extract all digit-only sequences
  const seqs = t.match(/\d+/g) ?? [];

  // Priority 1: exactly 6 digits (full display)
  const six = seqs.find(s => s.length === 6);
  if (six) return parseInt(six.slice(0, -1), 10); // drop last (red digit)

  // Priority 2: 7 digits (OCR added 1 extra) → take first 6
  const seven = seqs.find(s => s.length === 7);
  if (seven) return parseInt(seven.slice(0, 6).slice(0, -1), 10);

  // Priority 3: 5 digits (OCR already dropped red digit or misread 1)
  const five = seqs.filter(s => s.length === 5)
                   .sort((a, b) => (a.startsWith("0") ? -1 : 1))[0]; // prefer leading 0
  if (five) return parseInt(five, 10);

  // Priority 4: any 4+ digit sequence
  const four = seqs.find(s => s.length >= 4);
  if (four) return parseInt(four.slice(0, -1), 10);

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
