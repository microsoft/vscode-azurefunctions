/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { QuickPickItemKind } from 'vscode';
import { ProjectLanguage } from '../../constants';
import { localize } from '../../localize';
import { getWorkspaceSetting } from '../../vsCodeConfig/settings';
import { FunctionListStep } from '../createFunction/FunctionListStep';
import { type IProjectWizardContext } from './IProjectWizardContext';
import { TemplateListStep } from './TemplateListStep';

type StartingPointChoice = 'template' | 'scratch';

/**
 * Wizard step that prompts the user to choose between starting from a template
 * or starting from scratch (existing flow with trigger selection)
 */
export class StartingPointStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;

    private readonly _templateId?: string;
    private readonly _functionSettings?: { [key: string]: string | undefined };

    public constructor(templateId?: string, functionSettings?: { [key: string]: string | undefined }) {
        super();
        this._templateId = templateId;
        this._functionSettings = functionSettings;
    }

    public async prompt(context: IProjectWizardContext): Promise<void> {
        const preferTemplate = getWorkspaceSetting<boolean>('projectTemplates.preferTemplateFlow') ?? true;

        const picks: IAzureQuickPickItem<StartingPointChoice>[] = [
            {
                label: `$(repo-clone) ${localize('startFromTemplate', 'Start from template')}`,
                description: localize('templateDescription', 'Get a complete, ready-to-run project with deployment files'),
                data: 'template',
                suppressPersistence: true
            },
            {
                label: `$(new-file) ${localize('startFromScratch', 'Start from scratch')}`,
                description: localize('scratchDescription', 'Create a minimal project and add functions manually'),
                data: 'scratch',
                suppressPersistence: true
            }
        ];

        // Reorder based on preference setting
        if (!preferTemplate) {
            picks.reverse();
        }

        // Add separator and informational (non-selectable) hint
        picks.push(
            { label: '', data: 'template' as StartingPointChoice, kind: QuickPickItemKind.Separator },
            {
                label: `$(info) ${localize('templateInfoLine', 'Templates include working code, tests, and Bicep deployment files')}`,
                data: 'template' as StartingPointChoice,
                suppressPersistence: true,
                kind: QuickPickItemKind.Separator,
            },
        );

        const placeHolder = localize('selectStartingPoint', 'How would you like to start your project?');
        const result = await context.ui.showQuickPick(picks, {
            placeHolder,
            suppressPersistence: true
        });

        context.startingPoint = result.data;
        context.telemetry.properties.startingPoint = result.data;
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        // Skip this step for certain languages that don't support templates yet
        // or when a template ID is explicitly provided (API usage)
        if (this._templateId) {
            context.startingPoint = 'scratch';
            return false;
        }

        // Skip for languages that don't have project templates
        const unsupportedLanguages: ProjectLanguage[] = [
            ProjectLanguage.Ballerina,
            ProjectLanguage.Custom,
            ProjectLanguage.SelfHostedMCPServer
        ];

        if (context.language && unsupportedLanguages.includes(context.language)) {
            context.startingPoint = 'scratch';
            return false;
        }

        return context.startingPoint === undefined;
    }

    public async getSubWizard(context: IProjectWizardContext): Promise<IWizardOptions<IProjectWizardContext>> {
        const promptSteps: AzureWizardPromptStep<IProjectWizardContext>[] = [];

        if (context.startingPoint === 'template') {
            // Template flow: show template selection
            promptSteps.push(new TemplateListStep());
        } else {
            // Scratch flow: show existing function trigger selection
            promptSteps.push(new FunctionListStep({
                isProjectWizard: true,
                templateId: this._templateId,
                functionSettings: this._functionSettings,
            }));
        }

        return { promptSteps };
    }
}
