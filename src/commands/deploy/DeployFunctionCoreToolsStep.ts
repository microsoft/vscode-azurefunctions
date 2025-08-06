/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type InnerDeployContext } from "@microsoft/vscode-azext-azureappservice";
import { ActivityChildItem, ActivityChildType, activityFailContext, activityFailIcon, activityProgressContext, activityProgressIcon, activitySuccessContext, activitySuccessIcon, AzureWizardExecuteStep, createContextValue, randomUtils, type ExecuteActivityOutput } from "@microsoft/vscode-azext-utils";
import { l10n, ThemeIcon, TreeItemCollapsibleState, type Progress } from "vscode";
import { ext } from "../../extensionVariables";
import { cpUtils } from "../../utils/cpUtils";

export class DeployFunctionCoreToolsStep extends AzureWizardExecuteStep<InnerDeployContext> {
    stepName: string;
    private _childId: string = randomUtils.getRandomHexString(8); // create child id in class to make it idempotent
    private _command: { title: string; command: string } = {
        title: '',
        command: ext.prefix + '.showOutputChannel'
    };
    public createSuccessOutput(context: InnerDeployContext): ExecuteActivityOutput {
        const label = l10n.t('Publish "{0}" to "{1}" with Function Core Tools', context.originalDeployFsPath, context.site.fullName);
        return {
            item: new ActivityChildItem({
                contextValue: createContextValue([activitySuccessContext, context.site.id]),
                label,
                iconPath: activitySuccessIcon,
                activityType: ActivityChildType.Success,

            })
        };
    }
    public createProgressOutput(context: InnerDeployContext): ExecuteActivityOutput {
        const label = l10n.t('Publish "{0}" to "{1}" with Function Core Tools', context.originalDeployFsPath, context.site.fullName);
        const item = new ActivityChildItem({
            contextValue: createContextValue([activityProgressContext, context.site.id]),
            label,
            iconPath: activityProgressIcon,
            activityType: ActivityChildType.Progress,
            isParent: true,
            initialCollapsibleState: TreeItemCollapsibleState.Expanded
        });

        item.getChildren = () => {
            return [
                new ActivityChildItem({
                    label: l10n.t('Click to view output channel'),
                    id: this._childId,
                    command: this._command,
                    activityType: ActivityChildType.Info,
                    contextValue: createContextValue([activityProgressContext, 'viewOutputChannel']),
                    iconPath: new ThemeIcon('output')
                })
            ];
        };

        return {
            item
        };
    }
    public createFailOutput(context: InnerDeployContext): ExecuteActivityOutput {
        const label = l10n.t('Publish "{0}" to "{1}" with Function Core Tools', context.originalDeployFsPath, context.site.fullName);
        const item = new ActivityChildItem({
            contextValue: createContextValue([activityFailContext, context.site.id]),
            label,
            iconPath: activityFailIcon,
            activityType: ActivityChildType.Fail,
            isParent: true,
            initialCollapsibleState: TreeItemCollapsibleState.Expanded
        });

        item.getChildren = () => {
            return [
                new ActivityChildItem({
                    label: l10n.t('Click to view output channel'),
                    id: this._childId,
                    command: this._command,
                    activityType: ActivityChildType.Info,
                    contextValue: createContextValue([activityProgressContext, 'viewOutputChannel']),
                    iconPath: new ThemeIcon('output')
                })
            ];
        };

        return {
            item
        };
    }
    public priority: number = 100;
    public async execute(context: InnerDeployContext, progress: Progress<{ message?: string; increment?: number; }>): Promise<void> {
        const message = l10n.t('Publishing "{0}" to "{1}" with Functiontion Core Tools...', context.originalDeployFsPath, context.site.fullName);
        progress.report({ message });
        context.activityAttributes = context.activityAttributes ?? { logs: [] };
        const args = ['func', 'azure', 'functionapp', 'publish', context.site.siteName];
        if (context.site.isSlot) {
            // if there's no slotName, then just assume production
            args.push('--slot', context.site.slotName ?? 'production');
        }
        const cmdOutput = await cpUtils.tryExecuteCommand(ext.outputChannel, context.originalDeployFsPath, args.join(' '));
        context.activityAttributes.logs = [{ content: cmdOutput.cmdOutputIncludingStderr }];
    }
    public shouldExecute(_context: InnerDeployContext): boolean {
        return true;
    }
}
