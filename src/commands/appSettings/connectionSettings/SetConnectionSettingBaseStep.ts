/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { AzureWizardExecuteStep } from "@microsoft/vscode-azext-utils";
// import { CodeAction, CodeActionValues, ConnectionKeyValues } from "../../constants";
// import { MismatchBehavior, setLocalAppSetting } from "../../funcConfig/local.settings";
// import { IFunctionWizardContext } from "../createFunction/IFunctionWizardContext";

// export interface IDebugOrDeployContext extends IFunctionWizardContext {
//     action?: CodeActionValues;
// }

// export abstract class SetConnectionSettingBaseStep<T extends IDebugOrDeployContext> extends AzureWizardExecuteStep<T> {
//     public abstract readonly debugDeploySetting: ConnectionKeyValues;

//     protected setSetting(context: T, value: string): void {
//         if (context.action === CodeAction.Deploy) {
//             context[this.debugDeploySetting] = value;
//         } else {
//             setLocalAppSetting(context, context.projectPath, this.debugDeploySetting, value, MismatchBehavior.Overwrite);
//         }
//     }
// }
