import { useEffect } from "react";

import { auth } from "@/api/auth";

/** Renews the access token when users leave and return to the (iframed) app. */
export function SessionKeepAlive() {
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && auth.hasSession()) void auth.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
  return null;
}
