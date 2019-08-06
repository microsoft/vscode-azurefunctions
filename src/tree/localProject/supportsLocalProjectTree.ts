/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectLanguage } from "../../constants";

export function supportsLocalProjectTree(projectLanguage: string | undefined): boolean {
    // The project tree relies heavily on a standard file structure, including "host.json" and "function.json" files
    // Languages not listed here (notably C# and Java) require a build step to generate files like "function.json" and are not yet supported
    // https://github.com/microsoft/vscode-azurefunctions/issues/1165
    const supportedLanguages: ProjectLanguage[] = [
        ProjectLanguage.CSharpScript,
        ProjectLanguage.FSharpScript,
        ProjectLanguage.JavaScript,
        ProjectLanguage.PowerShell,
        ProjectLanguage.Python,
        ProjectLanguage.TypeScript
    ];

    return supportedLanguages.some(l => l === projectLanguage);
}
