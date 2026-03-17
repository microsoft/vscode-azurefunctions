/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzureWizardPromptStep, type IAzureQuickPickItem, type IWizardOptions } from '@microsoft/vscode-azext-utils';
import { type ProjectLanguage } from '../../constants';
import { localize } from '../../localize';
import { type IProjectTemplate, TemplateCategory } from '../../templates/projectTemplates/IProjectTemplate';
import { ProjectTemplateProvider } from '../../templates/projectTemplates/ProjectTemplateProvider';
import { nonNullProp } from '../../utils/nonNull';
import { CloneTemplateStep } from './CloneTemplateStep';
import { type IProjectWizardContext } from './IProjectWizardContext';
import { PostCloneStep } from './PostCloneStep';

type TemplatePromptResult = IProjectTemplate | 'refresh' | 'back';

/**
 * Wizard step that displays available project templates grouped by category
 */
export class TemplateListStep extends AzureWizardPromptStep<IProjectWizardContext> {
    public hideStepCount: boolean = true;

    private _templateProvider: ProjectTemplateProvider;

    public constructor() {
        super();
        this._templateProvider = new ProjectTemplateProvider();
    }

    public async prompt(context: IProjectWizardContext): Promise<void> {
        const language: ProjectLanguage = nonNullProp(context, 'language');
        const languageModel = context.languageModel;

        while (!context.selectedTemplate) {
            const placeHolder = localize('selectTemplate', 'Select a project template');
            const picks = await this.getPicks(context, language, languageModel);

            const result = await context.ui.showQuickPick(picks, {
                placeHolder,
                suppressPersistence: true
            });

            if (result.data === 'refresh') {
                await this._templateProvider.clearCache();
                context.telemetry.properties.refreshedTemplates = 'true';
            } else if (result.data === 'back') {
                // Reset starting point to go back
                context.startingPoint = undefined;
                return;
            } else {
                context.selectedTemplate = result.data;
                context.telemetry.properties.templateId = result.data.id;
                context.telemetry.properties.templateCategory = result.data.categories?.join(',');
            }
        }
    }

    public shouldPrompt(context: IProjectWizardContext): boolean {
        return context.startingPoint === 'template' && context.selectedTemplate === undefined;
    }

    public async getSubWizard(context: IProjectWizardContext): Promise<IWizardOptions<IProjectWizardContext>> {
        if (!context.selectedTemplate) {
            // User went back, no sub-wizard needed
            return {};
        }

        return {
            executeSteps: [new CloneTemplateStep(), new PostCloneStep()]
        };
    }

    private async getPicks(
        context: IProjectWizardContext,
        language: ProjectLanguage,
        languageModel?: number
    ): Promise<IAzureQuickPickItem<TemplatePromptResult>[]> {
        const templates = await this._templateProvider.getTemplates(context, language, languageModel);
        context.telemetry.measurements.projectTemplateCount = templates.length;

        // Group templates by category
        const groupedTemplates = this.groupByCategory(templates);
        const picks: IAzureQuickPickItem<TemplatePromptResult>[] = [];

        // Define category display order and labels
        const categoryOrder: TemplateCategory[] = [
            TemplateCategory.Starter,
            TemplateCategory.WebAPIs,
            TemplateCategory.EventProcessing,
            TemplateCategory.ScheduledTasks,
            TemplateCategory.AiMl,
            TemplateCategory.DataProcessing,
            TemplateCategory.Workflows,
            TemplateCategory.Other
        ];

        const categoryLabels: Record<TemplateCategory, string> = {
            [TemplateCategory.Starter]: localize('categoryStarter', 'Starter'),
            [TemplateCategory.WebAPIs]: localize('categoryWebApis', 'Web APIs'),
            [TemplateCategory.EventProcessing]: localize('categoryEventProcessing', 'Event Processing'),
            [TemplateCategory.ScheduledTasks]: localize('categoryScheduledTasks', 'Scheduling'),
            [TemplateCategory.AiMl]: localize('categoryAiMl', 'AI & Machine Learning'),
            [TemplateCategory.DataProcessing]: localize('categoryDataProcessing', 'Data Processing'),
            [TemplateCategory.Workflows]: localize('categoryWorkflows', 'Workflows'),
            [TemplateCategory.Other]: localize('categoryOther', 'Other')
        };

        // Add templates grouped by category
        for (const category of categoryOrder) {
            const categoryTemplates = groupedTemplates.get(category);
            if (categoryTemplates && categoryTemplates.length > 0) {
                // Sort templates by priority within category
                categoryTemplates.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

                // Add category separator
                picks.push({
                    label: categoryLabels[category],
                    kind: -1, // QuickPickItemKind.Separator
                    data: categoryTemplates[0] // placeholder, won't be selected
                });

                // Add templates in this category
                for (const template of categoryTemplates) {
                    picks.push(this.createTemplatePickItem(template));
                }
            }
        }

        // Add utility options at the bottom
        picks.push({
            label: '',
            kind: -1, // Separator
            data: 'refresh'
        });

        picks.push({
            label: `$(sync) ${localize('refreshTemplates', 'Refresh templates')}`,
            data: 'refresh',
            suppressPersistence: true
        });

        picks.push({
            label: `$(arrow-left) ${localize('backToStartingPoint', 'Back to starting point selection')}`,
            data: 'back',
            suppressPersistence: true
        });

        return picks;
    }

    private createTemplatePickItem(template: IProjectTemplate): IAzureQuickPickItem<IProjectTemplate> {
        const icon = template.icon ? `$(${template.icon}) ` : '';
        let label = `${icon}${template.displayName}`;

        // Add badges
        if (template.isNew) {
            label += ` $(sparkle)`;
        }
        if (template.isPopular) {
            label += ` $(star-full)`;
        }

        return {
            label,
            description: template.shortDescription,
            detail: template.tags?.join(', '),
            data: template,
            suppressPersistence: true
        };
    }

    private groupByCategory(templates: IProjectTemplate[]): Map<TemplateCategory, IProjectTemplate[]> {
        const grouped = new Map<TemplateCategory, IProjectTemplate[]>();

        for (const template of templates) {
            // Support both "categories" (array) and legacy "category" (string)
            const legacyCategory = (template as unknown as { category?: TemplateCategory }).category;
            const categories = template.categories?.length ? template.categories
                : legacyCategory ? [legacyCategory]
                : [TemplateCategory.Other];
            for (const category of categories) {
                if (!grouped.has(category)) {
                    grouped.set(category, []);
                }
                grouped.get(category)!.push(template);
            }
        }

        return grouped;
    }
}
