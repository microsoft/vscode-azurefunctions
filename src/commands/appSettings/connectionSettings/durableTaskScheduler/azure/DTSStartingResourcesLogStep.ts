/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActivityChildItem, ActivityChildType, activityInfoContext, activityInfoIcon, AzureWizardPromptStep, createContextValue, prependOrInsertAfterLastInfoChild, type ActivityInfoChild } from "@microsoft/vscode-azext-utils";
import { ext } from "../../../../../extensionVariables";
import { localize } from "../../../../../localize";
import { type IDTSAzureConnectionWizardContext } from "../IDTSConnectionWizardContext";

const startingResourcesContext: string = 'startingResourcesLogStepItem';

export class DTSStartingResourcesLogStep<T extends IDTSAzureConnectionWizardContext> extends AzureWizardPromptStep<T> {
    public hideStepCount: boolean = true;
    protected hasLogged: boolean = false;

    public async configureBeforePrompt(context: T): Promise<void> {
        if (this.hasLogged) {
            return;
        }

        if (context.resourceGroup) {
            prependOrInsertAfterLastInfoChild(context,
                new ActivityChildItem({
                    contextValue: createContextValue([startingResourcesContext, activityInfoContext]),
                    label: localize('useResourceGroup', 'Use resource group "{0}"', context.resourceGroup.name),
                    activityType: ActivityChildType.Info,
                    iconPath: activityInfoIcon
                }) as ActivityInfoChild
            );
            ext.outputChannel.appendLog(localize('usingResourceGroup', 'Using resource group "{0}".', context.resourceGroup.name));
        }

        if (context.site) {
            prependOrInsertAfterLastInfoChild(context,
                new ActivityChildItem({
                    label: localize('useFunctionApp', 'Use function app "{0}"', context.site.fullName),
                    contextValue: createContextValue([startingResourcesContext, activityInfoContext]),
                    activityType: ActivityChildType.Info,
                    iconPath: activityInfoIcon,
                }) as ActivityInfoChild,
            );
            ext.outputChannel.appendLog(localize('usingFunctionApp', 'Using function app "{0}".', context.site.fullName));
        }

        if (context.dts) {
            prependOrInsertAfterLastInfoChild(context,
                new ActivityChildItem({
                    label: localize('useDTS', 'Use durable task scheduler "{0}"', context.dts.name),
                    contextValue: createContextValue([startingResourcesContext, activityInfoContext]),
                    activityType: ActivityChildType.Info,
                    iconPath: activityInfoIcon
                }) as ActivityInfoChild,
            );
            ext.outputChannel.appendLog(localize('usingDTS', 'Using durable task scheduler "{0}".', context.dts.name));
        }

        if (context.dtsHub) {
            prependOrInsertAfterLastInfoChild(context,
                new ActivityChildItem({
                    label: localize('useDTSHub', 'Use durable task hub "{0}"', context.dtsHub.name),
                    contextValue: createContextValue([startingResourcesContext, activityInfoContext]),
                    activityType: ActivityChildType.Info,
                    iconPath: activityInfoIcon,
                }) as ActivityInfoChild,
            );
            ext.outputChannel.appendLog(localize('usingDTSHub', 'Using durable task hub "{0}".', context.dtsHub.name));
        }

        ext.outputChannel.appendLog(localize('prioritizingSiteLocation', 'Prioritizing site location: "{0}".', context.site?.location));
        this.hasLogged = true;
    }

    public async prompt(): Promise<void> {
        // Don't prompt, just use to log starting resources
    }

    public shouldPrompt(): boolean {
        return false;
    }
}
