import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Editable } from "@/components/editable";
import {
  deleteAttachmentFn,
  listAttachmentsFn,
  openAttachment,
  uploadAttachmentFn,
} from "@/api/transactions";
import { formatDate } from "@/lib/format";

const MAX_BYTES = 10 * 1024 * 1024;

function formatSize(n: number) {
  return n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Receipts and invoices for one transaction. Files are kept in the sub-account's GoHighLevel media library. */
export function AttachmentsPanel({ transactionId }: { transactionId: string }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const key = ["attachments", transactionId];
  const list = useQuery({
    queryKey: key,
    queryFn: () => listAttachmentsFn({ data: { transactionId } }),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["transactions"] }); // paperclip count in the list
  };

  const upload = useMutation({
    mutationFn: (file: File) => uploadAttachmentFn({ data: { transactionId, file } }),
    onSuccess: () => {
      toast.success("File attached");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAttachmentFn({ data: { id } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Files can be at most 10 MB.");
      return;
    }
    upload.mutate(file);
  }

  const files = list.data ?? [];
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Receipts & invoices</p>
        <Editable>
          <input
            ref={input}
            type="file"
            hidden
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.csv,.xlsx,.xls,.doc,.docx,.txt"
            onChange={(e) => pick(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => input.current?.click()}
            disabled={upload.isPending}
          >
            <Upload className="size-4" /> {upload.isPending ? "Uploading…" : "Attach file"}
          </Button>
        </Editable>
      </div>
      {list.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {!list.isLoading && files.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No files yet. PDF, images, spreadsheets or documents up to 10 MB.
        </p>
      )}
      <ul className="space-y-1">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 text-left hover:underline"
              onClick={() => openAttachment(f.id).catch((e: Error) => toast.error(e.message))}
            >
              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatSize(f.size)} · {formatDate(f.created_at)}
              </span>
            </button>
            <Editable>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${f.name}`}
                disabled={remove.isPending}
                onClick={() => {
                  if (
                    window.confirm(`Remove ${f.name}? It is also deleted from GoHighLevel media.`)
                  )
                    remove.mutate(f.id);
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </Editable>
          </li>
        ))}
      </ul>
    </div>
  );
}
