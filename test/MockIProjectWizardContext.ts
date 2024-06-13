/* eslint-disable no-restricted-imports */
/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { type TestUserInput } from "@microsoft/vscode-azext-dev";
import { type Uri, type WorkspaceFolder } from "vscode";
import { type FuncVersion, type TemplateSchemaVersion } from "../extension.bundle";
import { type OpenBehavior } from "../src/commands/createNewProject/IProjectWizardContext";
import { type ProjectLanguage } from "../src/constants";
import { type cliFeedUtils } from "../src/utils/cliFeedUtils";

export interface MockIProjectWizardContext {
    projectPath: string;
    workspacePath: string;
    workspaceFolder: WorkspaceFolder | undefined;

    language?: ProjectLanguage;
    languageModel?: number;
    languageFilter?: RegExp;

    version: FuncVersion;
    templateSchemaVersion?: TemplateSchemaVersion;
    projectTemplateKey: string | undefined;
    workerRuntime?: cliFeedUtils.IWorkerRuntime;
    openBehavior?: OpenBehavior;

    generateFromOpenAPI?: boolean;
    openApiSpecificationFile?: Uri[];

    targetFramework?: string | string[];

    containerizedProject?: boolean;

    telemetry: {
        properties: { [key: string]: string | undefined; }
        measurements: { [key: string]: number | undefined; }
    };
    errorHandling: {
        issueProperties: {}
    };
    valuesToMask: string[];
    ui: TestUserInput;
}
