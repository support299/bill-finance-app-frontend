import { api, ApiError, refreshAccessToken } from "./client";
import { clearTokens, currentUserId, getTokens, onSessionChange, setTokens } from "./session";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
}

interface TokenResponse {
  access: string;
  refresh: string;
  user?: AuthUser;
}

export const auth = {
  hasSession: () => Boolean(getTokens()),
  onChange: onSessionChange,
  currentUserId,

  async signIn(email: string, password: string) {
    const res = await api.post<TokenResponse>(
      "/auth/login/",
      { email, password },
      { anonymous: true },
    );
    setTokens({ access: res.access, refresh: res.refresh });
  },

  /** Returns true when a session was started (the backend signs users in immediately after registering). */
  async signUp(email: string, password: string, fullName: string) {
    const res = await api.post<TokenResponse>(
      "/auth/register/",
      { email, password, full_name: fullName },
      { anonymous: true },
    );
    setTokens({ access: res.access, refresh: res.refresh });
    return true;
  },

  async signOut() {
    try {
      if (getTokens()) await api.post("/auth/logout/");
    } catch {
      /* the local session is cleared regardless */
    } finally {
      clearTokens();
    }
  },

  requestPasswordReset: (email: string) =>
    api.post("/auth/password-reset/", { email }, { anonymous: true }),

  confirmPasswordReset: (uid: string, token: string, password: string) =>
    api.post("/auth/password-reset/confirm/", { uid, token, password }, { anonymous: true }),

  /** Installs tokens handed out by the GoHighLevel session endpoint. */
  setSession: (tokens: { access: string; refresh: string }) => setTokens(tokens),

  /** Validates the stored session against the server; resolves the user or null. */
  async getUser(): Promise<AuthUser | null> {
    if (!getTokens()) return null;
    try {
      return await api.get<AuthUser>("/profile/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err; // network/server problems must not log the user out
    }
  },

  /** Quietly renews the access token (used when the tab becomes visible again). */
  refresh: refreshAccessToken,
};
