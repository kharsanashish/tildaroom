import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FileText, Upload, Eye, Trash2, RefreshCw, Loader2, FolderLock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const BUCKET = "tenant-documents";

type DocType = "rental_agreement" | "aadhaar" | "pan";

const DOC_META: { type: DocType; label: string }[] = [
  { type: "rental_agreement", label: "Rental Agreement" },
  { type: "aadhaar", label: "Aadhaar" },
  { type: "pan", label: "PAN" },
];

interface DocRow {
  id: string;
  tenant_id: string;
  document_type: DocType;
  file_path: string;
  file_url: string;
  uploaded_at: string;
}

export function DocumentVault({
  tenantId,
  tenantName,
  trigger,
}: {
  tenantId: string;
  tenantName?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyType, setBusyType] = useState<DocType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DocRow | null>(null);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tenant_documents")
      .select("*")
      .eq("tenant_id", tenantId);
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as DocRow[]);
  };

  useEffect(() => { if (open) refresh(); }, [open, tenantId]);

  const handleUpload = async (type: DocType, file: File) => {
    if (file.size > 10 * 1024 * 1024) return toast.error("Max 10 MB per file");
    setBusyType(type);
    try {
      const existing = rows.find((r) => r.document_type === type);
      const ext = file.name.split(".").pop() || "bin";
      const path = `${tenantId}/${type}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const file_url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

      if (existing) {
        await supabase.storage.from(BUCKET).remove([existing.file_path]);
        const { error } = await supabase
          .from("tenant_documents")
          .update({ file_path: path, file_url, uploaded_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenant_documents").insert({
          tenant_id: tenantId, document_type: type, file_path: path, file_url,
        });
        if (error) throw error;
      }
      toast.success("Uploaded");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyType(null);
    }
  };

  const handleView = async (row: DocRow) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, 60 * 10);
    if (error || !data) return toast.error(error?.message ?? "Failed to open");
    window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (row: DocRow) => {
    setBusyType(row.document_type);
    try {
      const { error: storageErr } = await supabase.storage.from(BUCKET).remove([row.file_path]);
      if (storageErr) console.warn("storage remove error", storageErr);
      const { error } = await supabase.from("tenant_documents").delete().eq("id", row.id);
      if (error) throw error;
      toast.success("Deleted");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyType(null);
      setConfirmDelete(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <FolderLock className="h-4 w-4 mr-1" /> Document Vault
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Document Vault{tenantName ? ` — ${tenantName}` : ""}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {DOC_META.map(({ type, label }) => {
              const row = rows.find((r) => r.document_type === type);
              const busy = busyType === type;
              const inputId = `vault-${type}`;
              return (
                <Card key={type} className="p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{label}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {row ? `Uploaded ${new Date(row.uploaded_at).toLocaleDateString()}` : "Not uploaded (optional)"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        ref={(el) => { inputsRef.current[inputId] = el; }}
                        id={inputId}
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(type, f);
                          e.target.value = "";
                        }}
                      />
                      {row ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleView(row)} disabled={busy}>
                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => inputsRef.current[inputId]?.click()} disabled={busy}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(row)} disabled={busy} className="text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={() => inputsRef.current[inputId]?.click()} disabled={busy}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                          Upload
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
            <p className="text-[11px] text-muted-foreground text-center pt-1">
              Accepted: PDF / images, up to 10 MB. All documents are private.
            </p>
          </div>
        )}
      </DialogContent>
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete ? `This will permanently remove your ${DOC_META.find(d => d.type === confirmDelete.document_type)?.label}.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (confirmDelete) handleDelete(confirmDelete); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
