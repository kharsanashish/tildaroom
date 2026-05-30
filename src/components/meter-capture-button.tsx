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

      // Isolate exactly the dark-background digit strip, invert for OCR
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
        disabled={disabled || loading}
        title="Capture meter reading">
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Camera className="h-4 w-4" />}
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
                Could not auto-detect. Type the 5 black digits from your meter
                (ignore the last red digit).
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

// ─────────────────────────────────────────────────────────────────────────────
// CORE: Isolate the dark-background digit window
//
// The meter display is the ONLY region with:
//   - Dark/black background  (luminance < 70)
//   - White digits on top    (large bright pixels inside dark zone)
//   - Red background on last digit (also dark-ish when greyscaled)
//
// All other meter text (brand, serial, specs) is black on WHITE/LIGHT background.
// We detect this dark band, crop it, invert it, then upscale for OCR.
// After inversion: white digits → black, black background → white = perfect for OCR.
// ─────────────────────────────────────────────────────────────────────────────

function isolateDigitWindow(src: HTMLCanvasElement): HTMLCanvasElement {
  const W = src.width, H = src.height;
  const ctx = src.getContext("2d")!;
  const d = ctx.getImageData(0, 0, W, H).data;

  // Build greyscale luminance map
  const lum = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };

  // ── Step 1: find the dark horizontal band (digit window rows) ─────────────
  // For each row: count dark pixels (lum < 70). Digit window rows have many dark pixels.
  // Only scan top 60% — display is always in upper half of meter photo.

  const rowDarkFraction: number[] = [];
  for (let y = 0; y < H; y++) {
    let dark = 0;
    for (let x = 0; x < W; x++) {
      if (lum(x, y) < 70) dark++;
    }
    rowDarkFraction.push(dark / W);
  }

  // Find contiguous band where ≥15% of pixels are dark, within top 60%
  const DARK_ROW_THRESH = 0.15;
  let topRow = -1, bottomRow = -1;
  for (let y = 0; y < Math.floor(H * 0.60); y++) {
    if (rowDarkFraction[y] >= DARK_ROW_THRESH) {
      if (topRow === -1) topRow = y;
      bottomRow = y;
    } else if (topRow !== -1 && y - bottomRow > 8) {
      // Allow small gaps (inter-row light gaps) up to 8 rows
      break;
    }
  }

  // Fallback: use top 35%
  if (topRow === -1 || bottomRow - topRow < 5) {
    topRow = 0;
    bottomRow = Math.round(H * 0.35);
  }

  // Add vertical padding
  topRow    = Math.max(0, topRow - 6);
  bottomRow = Math.min(H - 1, bottomRow + 6);

  // ── Step 2: find horizontal extent of dark region ─────────────────────────
  let leftCol = W, rightCol = 0;
  for (let y = topRow; y <= bottomRow; y++) {
    for (let x = 0; x < W; x++) {
      if (lum(x, y) < 70) {
        if (x < leftCol) leftCol = x;
        if (x > rightCol) rightCol = x;
      }
    }
  }

  // Fallback: full width
  if (leftCol >= rightCol) { leftCol = 0; rightCol = W; }

  // Add horizontal padding
  leftCol  = Math.max(0, leftCol - 8);
  rightCol = Math.min(W - 1, rightCol + 8);

  const cropW = rightCol - leftCol;
  const cropH = bottomRow - topRow;

  // ── Step 3: crop, upscale 4×, invert ─────────────────────────────────────
  // Upscale 4× so OCR has big clear digits to read
  const out = document.createElement("canvas");
  out.width  = cropW * 4;
  out.height = cropH * 4;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(src, leftCol, topRow, cropW, cropH, 0, 0, out.width, out.height);

  // Invert: white digits → black (OCR reads black-on-white)
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

  const res = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: form,
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (data?.IsErroredOnProcessing) return null;

  const text: string = (data?.ParsedResults ?? [])
    .map((r: { ParsedText?: string }) => r.ParsedText ?? "")
    .join(" ");

  return parseMeterText(text);
}

// ── Parse: find 5–6 digit sequence, drop last (red drum) ─────────────────────

function parseMeterText(raw: string): number | null {
  if (!raw) return null;

  // Collapse space-separated single digits: "0 1 5 5 3 7" → "015537"
  // Run multiple times to handle all gaps
  let t = raw;
  for (let pass = 0; pass < 4; pass++) {
    t = t.replace(/(?<=\b\d)\s+(?=\d\b)/g, "");
  }

  // Pattern A: exactly 6 digits together → prefer starting with 0
  const sixAll = [...(t.matchAll(/\d{6}/g))].map(m => m[0]);
  const six = sixAll.find(s => s.startsWith("0")) ?? sixAll[0];
  if (six) return parseInt(six.slice(0, -1), 10);

  // Pattern B: 7 digits (OCR added extra) → take middle 6
  const sevenAll = [...(t.matchAll(/\d{7}/g))].map(m => m[0]);
  const seven = sevenAll.find(s => s.slice(1).startsWith("0"))
    ?? sevenAll.find(s => s.startsWith("0"))
    ?? sevenAll[0];
  if (seven) return parseInt(seven.slice(0, 6).slice(0, -1), 10);

  // Pattern C: 5 digits (OCR already dropped red digit)
  const fiveAll = [...(t.matchAll(/\d{5}/g))].map(m => m[0]);
  const five = fiveAll.find(s => s.startsWith("0")) ?? fiveAll[0];
  if (five) return parseInt(five, 10);

  return null;
}

// ── file → canvas helper ──────────────────────────────────────────────────────

function fileToCanvas(file: File, maxPx: number): Promise<HTMLCanvasElement> {
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
        resolve(c);
      };
      img.onerror = reject;
      img.src = ev.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
