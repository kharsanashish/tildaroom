import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface MeterCaptureButtonProps {
  onReading: (value: number) => void;
  disabled?: boolean;
}

export function MeterCaptureButton({ onReading, disabled }: MeterCaptureButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setSuccess(false);

    try {
      const reading = await extractMeterReading(file);
      if (reading === null) {
        toast.error("Could not detect reading. Please enter manually.");
        return;
      }
      onReading(reading);
      setSuccess(true);
      toast.success(`Meter reading detected: ${reading}`);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      toast.error("Failed to process image. Please enter manually.");
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
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
        className={`h-9 w-9 flex-shrink-0 transition-colors ${
          success ? "border-success text-success" : ""
        }`}
        onClick={() => inputRef.current?.click()}
        disabled={disabled || loading}
        title="Capture meter photo to auto-fill reading"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : success ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
      </Button>
    </>
  );
}

// ── Core OCR pipeline ─────────────────────────────────────────────────────────

async function extractMeterReading(file: File): Promise<number | null> {
  // 1. Draw original image onto canvas
  const original = await fileToCanvas(file);

  // 2. Try to auto-detect the digit strip (dark row of digits)
  const cropped = cropDigitRegion(original);

  // 3. Preprocess: greyscale + high contrast + binarise
  const processed = preprocessForOcr(cropped);

  // 4. Run Tesseract (digits only mode)
  const raw = await runTesseract(processed);

  // 5. Parse: keep only digits, drop last one (red digit), remove leading zeros
  return parseReading(raw);
}

// ── Step 1: file → canvas ─────────────────────────────────────────────────────

function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // Limit to 1400px max dimension to keep processing fast
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(c);
      };
      img.onerror = reject;
      img.src = ev.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Step 2: crop the digit display region ─────────────────────────────────────
// Meters typically have the digit window in the upper-middle third of the photo.
// We take a generous centre crop so we're not running OCR on the whole image.

function cropDigitRegion(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext("2d")!;
  const { width: W, height: H } = src;
  const imgData = ctx.getImageData(0, 0, W, H);
  const data = imgData.data;

  // Scan rows to find the band with highest contrast (digit area is high-contrast)
  const rowContrast: number[] = [];
  for (let y = 0; y < H; y++) {
    let min = 255, max = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }
    rowContrast.push(max - min);
  }

  // Find the row with peak contrast — digit display lives nearby
  let peakRow = 0, peakVal = 0;
  for (let y = 0; y < H; y++) {
    if (rowContrast[y] > peakVal) { peakVal = rowContrast[y]; peakRow = y; }
  }

  // Take a band ±25% of image height around the peak row, centred horizontally
  const bandH = Math.round(H * 0.28);
  const y0 = Math.max(0, peakRow - bandH);
  const y1 = Math.min(H, peakRow + bandH);
  const x0 = Math.round(W * 0.05);
  const x1 = Math.round(W * 0.95);

  const out = document.createElement("canvas");
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext("2d")!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// ── Step 3: greyscale + contrast stretch + binarise ───────────────────────────

function preprocessForOcr(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext("2d")!;
  const { width: W, height: H } = src;

  // Scale up 3× so Tesseract has enough pixels per digit
  const scale = 3;
  const out = document.createElement("canvas");
  out.width = W * scale;
  out.height = H * scale;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(src, 0, 0, out.width, out.height);

  const imgData = octx.getImageData(0, 0, out.width, out.height);
  const d = imgData.data;

  // Find min/max luminance for contrast stretch
  let mn = 255, mx = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (l < mn) mn = l; if (l > mx) mx = l;
  }
  const range = mx - mn || 1;

  // Greyscale + stretch + binarise at 50%
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const stretched = ((l - mn) / range) * 255;
    const bin = stretched > 128 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = bin;
  }
  octx.putImageData(imgData, 0, 0);
  return out;
}

// ── Step 4: Tesseract OCR (digits only) ───────────────────────────────────────

async function runTesseract(canvas: HTMLCanvasElement): Promise<string> {
  // Dynamic import so Tesseract (~4 MB) only loads when camera is used
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    logger: () => {}, // suppress progress logs
  });

  // PSM 7 = single line of text, OEM 1 = LSTM
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789",
    tessedit_pageseg_mode: "7" as never,
  });

  const dataUrl = canvas.toDataURL("image/png");
  const { data } = await worker.recognize(dataUrl);
  await worker.terminate();
  return data.text;
}

// ── Step 5: parse result ──────────────────────────────────────────────────────
// Meter has 6 rotating drum digits — 5 black + 1 red (decimal fraction).
// Rules:
//  - Keep only digit characters from OCR output
//  - Drop the last digit (the red drum on the right)
//  - Parse as integer (strips leading zeros automatically)
//  Example: "001246" → drop "6" → "00124" → 124

function parseReading(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 2) return null;                // need at least 2 digits
  const withoutRed = digits.slice(0, -1);            // remove last digit
  const value = parseInt(withoutRed, 10);            // removes leading zeros
  return isNaN(value) ? null : value;
}
