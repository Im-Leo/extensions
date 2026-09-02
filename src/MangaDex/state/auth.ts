/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { AccessToken, AuthError, AuthResponse, TokenBody } from "../models";
import { MANGADEX_AUTH_TOKEN_URL } from "../models";
import { parseJSONBody } from "../utils";

/**
 * The OAuth token this source holds on the user's behalf.
 *
 * Tokens are cached in memory and re-read from persisted state only when that
 * cache is cold, because every authenticated request consults them.
 */

let cachedTokenResult: AccessToken | undefined = undefined;
let cacheValid = false;

/** JWT bodies are base64url; `Application.base64Decode` expects standard base64. */
function canonicalizeBase64Url(s: string): string {
  let canonical = s.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (canonical.length % 4)) % 4;
  if (padLen > 0) canonical += "=".repeat(padLen);
  return canonical;
}

export function readJwtBody(token: string): TokenBody | null {
  try {
    const tokenBodyBase64 = token.split(".")[1];
    if (!tokenBodyBase64) return null;
    const tokenBodyJSON = Application.base64Decode(canonicalizeBase64Url(tokenBodyBase64));
    if (typeof tokenBodyJSON !== "string" || tokenBodyJSON.trimStart().charAt(0) !== "{") {
      return null;
    }
    return JSON.parse(tokenBodyJSON) as TokenBody;
  } catch {
    return null;
  }
}

export function isAuthInvalidError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /status code: 40[01]/.test(msg) || /invalid_grant|invalid_token/i.test(msg);
}

export function getAccessToken(): AccessToken | undefined {
  if (cacheValid) return cachedTokenResult;

  const accessToken = Application.getSecureState("access_token") as string | undefined;
  if (!accessToken) {
    const orphan = Application.getSecureState("refresh_token") as string | undefined;
    if (orphan) Application.setSecureState(undefined, "refresh_token");
    cachedTokenResult = undefined;
    cacheValid = true;
    return undefined;
  }

  const refreshToken = Application.getSecureState("refresh_token") as string | undefined;
  const parsed = readJwtBody(accessToken);
  if (!parsed) {
    return saveAccessToken(undefined, undefined);
  }
  if (parsed.typ === "Refresh") {
    const refreshParsed = refreshToken ? readJwtBody(refreshToken) : null;
    if (refreshParsed && refreshParsed.typ !== "Refresh") {
      return saveAccessToken(refreshToken, accessToken);
    }
    return saveAccessToken(undefined, undefined);
  }
  cachedTokenResult = { accessToken, refreshToken, tokenBody: parsed };
  cacheValid = true;
  return cachedTokenResult;
}

export function saveAccessToken(
  accessToken: string | undefined,
  refreshToken: string | undefined,
): AccessToken | undefined {
  if (!accessToken) {
    Application.setSecureState(undefined, "access_token");
    Application.setSecureState(undefined, "refresh_token");
    cachedTokenResult = undefined;
    cacheValid = true;
    return undefined;
  }

  const parsed = readJwtBody(accessToken);
  if (!parsed) {
    Application.setSecureState(undefined, "access_token");
    Application.setSecureState(undefined, "refresh_token");
    cachedTokenResult = undefined;
    cacheValid = true;
    return undefined;
  }
  Application.setSecureState(accessToken, "access_token");
  Application.setSecureState(refreshToken, "refresh_token");
  cachedTokenResult = { accessToken, refreshToken, tokenBody: parsed };
  cacheValid = true;
  return cachedTokenResult;
}

const authRequestCache: Record<string, Promise<AuthResponse>> = {};

async function _authEndpointRequest(payload: string): Promise<AuthResponse> {
  const [response, buffer] = await Application.scheduleRequest({
    method: "POST",
    url: MANGADEX_AUTH_TOKEN_URL,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: [
      `refresh_token=${encodeURIComponent(payload)}`,
      "client_id=paperback",
      "grant_type=refresh_token",
    ].join("&"),
  });

  const data = Application.arrayBufferToUTF8String(buffer);
  let json: AuthResponse | AuthError | undefined;
  try {
    json = parseJSONBody<AuthResponse | AuthError>(data, response.status);
  } catch {}

  if (response.status >= 400) {
    if (json && "error" in json) {
      throw new Error(
        `Auth failed: ${json.error}: ${json.error_description || ""} (status code: ${response.status})`,
      );
    }
    throw new Error(`Request failed with status code: ${response.status}`);
  }

  if (!json) {
    throw new Error(`Unexpected non JSON auth response (status ${response.status})`);
  }

  if ("error" in json) {
    throw new Error(`Auth failed: ${json.error}: ${json.error_description || ""}`);
  }

  return json;
}

export function authEndpointRequest(payload: string): Promise<AuthResponse> {
  const inFlight = authRequestCache[payload];
  if (inFlight) return inFlight;

  const request = _authEndpointRequest(payload).finally(() => {
    delete authRequestCache[payload];
  });
  authRequestCache[payload] = request;

  return request;
}

export type RefreshOutcome =
  | { kind: "rotated"; token: AccessToken }
  | { kind: "racedRotation"; token: AccessToken }
  | { kind: "racedLogout" }
  | { kind: "loggedOut" }
  | { kind: "transient"; message: string };

export async function refreshSession(originalRefreshToken: string): Promise<RefreshOutcome> {
  try {
    const response = await authEndpointRequest(originalRefreshToken);
    const currentTokens = getAccessToken();
    if (currentTokens?.refreshToken !== originalRefreshToken) {
      if (!currentTokens) return { kind: "racedLogout" };
      return { kind: "racedRotation", token: currentTokens };
    }
    const saved = saveAccessToken(response.access_token, response.refresh_token);
    if (!saved) {
      return { kind: "loggedOut" };
    }
    return { kind: "rotated", token: saved };
  } catch (e: unknown) {
    const currentTokens = getAccessToken();
    if (currentTokens?.refreshToken !== originalRefreshToken) {
      if (!currentTokens) return { kind: "racedLogout" };
      return { kind: "racedRotation", token: currentTokens };
    }
    if (isAuthInvalidError(e)) {
      saveAccessToken(undefined, undefined);
      return { kind: "loggedOut" };
    }
    return { kind: "transient", message: e instanceof Error ? e.message : String(e) };
  }
}
