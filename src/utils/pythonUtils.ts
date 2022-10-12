/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectLanguage } from "../constants";

export function isPythonV2Plus(language: string | undefined, model: number | undefined): boolean {
    return language === ProjectLanguage.Python && model !== undefined && model > 1;
}

export function isNodeV4Plus(language: string | undefined, model: number | undefined): boolean {
    return (language === ProjectLanguage.JavaScript || language === ProjectLanguage.TypeScript) &&
        model !== undefined && model > 3;
}
