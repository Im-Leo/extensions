/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import {
  DeferredItem,
  Form,
  NavigationRow,
  OAuthButtonRow,
  Section,
  type FormItemElement,
  type FormSectionElement,
} from "@paperback/types";

import { MANGADEX_AUTH_AUTHORIZE_URL, MANGADEX_AUTH_TOKEN_URL } from "../models";
import { getAccessToken, readJwtBody, saveAccessToken } from "../state";
import { SessionInfoForm } from "./session-info";
import { WebsiteStatusForm } from "./website-status";

/** Thumbnail quality and the other choices that only affect presentation. */
export class WebsiteSettingsForm extends Form {
  override getSections(): FormSectionElement<unknown>[] {
    return [
      Section("oAuthSection", [
        DeferredItem(() => {
          if (getAccessToken()) {
            return NavigationRow("sessionInfo", {
              title: "Session Info",
              form: new SessionInfoForm(() => this.reloadForm()),
            }) as FormItemElement<unknown>;
          }
          return this.createLoginButton();
        }),
        NavigationRow("mangadex_status", {
          title: "Service Status",
          form: new WebsiteStatusForm(),
        }),
      ]),
    ];
  }

  private createLoginButton(): FormItemElement<unknown> {
    return OAuthButtonRow("oAuthButton", {
      title: "Login with MangaDex",
      authorizeEndpoint: MANGADEX_AUTH_AUTHORIZE_URL,
      clientId: "paperback",
      redirectUri: "paperback://mangadex-login",
      responseType: {
        type: "pkce",
        pkceCodeLength: 64,
        pkceCodeMethod: "S256",
        formEncodeGrant: true,
        tokenEndpoint: MANGADEX_AUTH_TOKEN_URL,
      },
      onSuccess: Application.Selector(this as WebsiteSettingsForm, "handleOAuthSuccess"),
    });
  }

  async handleOAuthSuccess(first: string, second: string): Promise<void> {
    const [accessToken, refreshToken] = sortAuthTokens(first, second);
    saveAccessToken(accessToken, refreshToken);
    this.reloadForm();
  }
}

function sortAuthTokens(a: string, b: string): [string, string] {
  const typA = readJwtBody(a)?.typ;
  const typB = readJwtBody(b)?.typ;
  if (typA === "Refresh" && typB !== "Refresh") return [b, a];
  if (typB === "Refresh" && typA !== "Refresh") return [a, b];
  return [a, b];
}
