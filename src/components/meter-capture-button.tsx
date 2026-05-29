import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Camera, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PSM, createWorker } from "tesseract.js";

interface MeterCaptureButtonProps {
  onReading: (value: number) => void;
  disabled?: boolean;
}

export function MeterCaptureButton({ onReading, disabled }: MeterCaptureButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);   // base64 preview
  const [detected, setDetected] = useState<string>("");          // raw OCR result
  const [editValue, setEditValue] = useState<string>("");        // user-editable
  const [dialogOpen, setDialogOpen] = useState(false);

  // ── Capture handler ────────────────────────────────────────────────────────
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (inputRef.current) inputRef.current.value = "";

    setLoading(true);

    try {
      const canvas = await fileToCanvas(file);
      const previewUrl = canvas.toDataURL("image/jpeg", 0.6);
      setPreview(previewUrl);

      // Run multiple passes and pick the best digit sequence
      const reading = await ocrMeter(canvas);
      const str = reading !== null ? String(reading) : "";
      setDetected(str);
      setEditValue(str);
      setDialogOpen(true);
    } catch (err) {
      console.error(err);
      toast.error("Failed to process image.");
    } finally {
      setLoading(false);
    }
  };

  // ── Confirm dialog ─────────────────────────────────────────────────────────
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
    setTimeout(() => inputRef.current?.click(), 100);
  };

  return (
    <>
      {/* Hidden camera input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCapture}
      />

      {/* Camera trigger button */}
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

      {/* Confirm / correct dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Meter Reading</DialogTitle>
          </DialogHeader>

          {/* Photo preview */}
          {preview && (
            <div className="rounded-lg overflow-hidden border bg-muted max-h-48 flex items-center justify-center">
              <img
                src={preview}
                alt="Meter photo"
                className="max-h-48 w-full object-contain"
              />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {detected
                ? `Detected reading: ${detected}. Correct it below if wrong.`
                : "Could not auto-detect. Please type the reading manually."}
            </p>
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ""))}
              type="number"
              inputMode="numeric"
              placeholder="Enter meter reading"
              className="text-lg font-semibold text-center"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground text-center">
              Read the 5 black digits — ignore the last red digit
            </p>
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

// ── OCR pipeline ──────────────────────────────────────────────────────────────

async function ocrMeter(canvas: HTMLCanvasElement): Promise<number | null> {
  // Try 3 preprocessings in parallel, pick the one giving best digit sequence
  const [normal, inverted, high] = await Promise.all([
    runOcr(preprocess(canvas, false, 128)),
    runOcr(preprocess(canvas, true, 128)),
    runOcr(preprocess(canvas, false, 160)),
  ]);

  const best = [normal, inverted, high]
    .map(extractBestSequence)
    .filter(Boolean)
    .sort((a, b) => b!.length - a!.length)[0];

  return best ? parseReading(best) : null;
}

// Find the longest run of digits in OCR output (5 or 6 consecutive digits)
function extractBestSequence(raw: string): string | null {
  const cleaned = raw.replace(/[^0-9]/g, " ").trim();
  // Find all digit groups of length 5-7
  const matches = cleaned.match(/\d{5,7}/g);
  if (!matches) return null;
  // Prefer sequences of exactly 6 (full meter display)
  const six = matches.find((m) => m.length === 6);
  return six ?? matches.sort((a, b) => b.length - a.length)[0];
}

// Drop last digit (red), remove leading zeros
function parseReading(digits: string): number | null {
  if (digits.length < 2) return null;
  const withoutRed = digits.slice(0, -1);
  const value = parseInt(withoutRed, 10);
  return isNaN(value) ? null : value;
}

// ── Tesseract runner ──────────────────────────────────────────────────────────

async function runOcr(canvas: HTMLCanvasElement): Promise<string> {
  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789",
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
  });
  const { data } = await worker.recognize(canvas.toDataURL("image/png"));
  await worker.terminate();
  return data.text ?? "";
}

// ── Image preprocessing ───────────────────────────────────────────────────────

function preprocess(
  src: HTMLCanvasElement,
  invert: boolean,
  threshold: number
): HTMLCanvasElement {
  const scale = 3;
  const out = document.createElement("canvas");
  out.width = src.width * scale;
  out.height = src.height * scale;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;

  // Find luminance range for contrast stretch
  let mn = 255, mx = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (l < mn) mn = l;
    if (l > mx) mx = l;
  }
  const range = mx - mn || 1;

  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let v = ((l - mn) / range) * 255;
    if (invert) v = 255 - v;
    const bin = v > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = bin;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

// ── File → canvas ─────────────────────────────────────────────────────────────

function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
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
