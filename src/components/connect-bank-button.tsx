import { useQueryClient } from "@tanstack/react-query";
import { Landmark, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createLinkTokenFn, exchangePublicTokenFn } from "@/api/plaid";
import { useAccess } from "@/hooks/use-access";

interface PlaidMetadata {
  institution?: { institution_id?: string; name?: string } | null;
}

declare global {
  interface Window {
    Plaid?: {
      create: (config: Record<string, unknown>) => {
        open: () => void;
        exit: () => void;
        destroy: () => void;
      };
    };
  }
}

const SCRIPT_SRC = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

function loadPlaidScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Could not load the bank connection widget.")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the bank connection widget."));
    document.head.appendChild(script);
  });
}

export type ConnectStatus =
  | "idle"
  | "Connecting…"
  | "Fetching transactions…"
  | "Importing historical transactions…"
  | "Sync complete";

export function ConnectBankButton({
  className,
  itemId,
  label,
  variant = "default",
  size = "default",
}: {
  className?: string;
  itemId?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
}) {
  const queryClient = useQueryClient();
  const createLinkToken = createLinkTokenFn;
  const exchange = exchangePublicTokenFn;
  const [status, setStatus] = useState<ConnectStatus>("idle");
  const { can_edit } = useAccess();

  const open = useCallback(async () => {
    try {
      setStatus("Connecting…");
      await loadPlaidScript();
      const { link_token } = await createLinkToken({ data: itemId ? { itemId } : {} });

      const handler = window.Plaid!.create({
        token: link_token,
        onSuccess: async (publicToken: string, metadata: PlaidMetadata) => {
          try {
            setStatus("Fetching transactions…");
            const toastId = toast.loading("Importing your transactions…");
            const res = await exchange({
              data: {
                publicToken,
                institutionId: metadata?.institution?.institution_id,
                institutionName: metadata?.institution?.name,
              },
            });
            setStatus("Sync complete");
            toast.success(`${res.added} transactions imported`, { id: toastId });
            queryClient.invalidateQueries();
          } catch (err) {
            toast.error((err as Error).message);
            setStatus("idle");
          }
        },
        onExit: (err: unknown) => {
          setStatus("idle");
          if (err) toast.error("Bank connection cancelled or failed. You can try again.");
        },
      });
      handler.open();
    } catch (err) {
      setStatus("idle");
      toast.error((err as Error).message);
    }
  }, [createLinkToken, exchange, itemId, queryClient]);

  const busy = status !== "idle" && status !== "Sync complete";
  if (!can_edit) return null;

  return (
    <Button className={className} onClick={open} disabled={busy} variant={variant} size={size}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Landmark className="size-4" />}
      {busy ? status : (label ?? (itemId ? "Reconnect" : "Connect bank account"))}
    </Button>
  );
}
