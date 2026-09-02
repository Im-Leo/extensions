/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Im-Leo */

import type { Form } from "@paperback/types";

import { MangaDexSettingsForm } from "./forms/index";

export async function getSettingsForm(): Promise<Form> {
  return new MangaDexSettingsForm();
}
