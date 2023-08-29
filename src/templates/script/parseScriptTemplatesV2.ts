/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullValue } from '@microsoft/vscode-azext-utils';
import { ActionType, ProjectLanguage } from '../../constants';
import { FunctionV2Template } from '../FunctionV2Template';
import { ResourceType } from '../IBindingTemplate';

/**
 * Describes script template resources to be used for parsing
 */
export interface Resources {
    lang?: { [key: string]: string | undefined };
    // Every Resources.json file also contains the english strings
    en: { [key: string]: string | undefined };
}

export interface RawTemplateV2 {
    actions: ParsedAction[];
    author?: string;
    name: string;
    id?: string;
    description: string;
    programmingModel: 'v1' | 'v2';
    language: ProjectLanguage;
    jobs: RawJob[]
    files: { [filename: string]: string };
}

export interface ParsedAction {
    name: string;
    type: ActionType;
    assignTo?: string;
    filePath?: string;
    continueOnError?: boolean;
    errorText?: string;
    source?: string;
    createIfNotExists?: boolean;
    replaceTokens?: boolean;
}

interface RawJob {
    actions: string[];
    condition: { name: string, expectedValue: string }
    inputs: RawInput[];
    name: string;
    type: JobType;
}

export enum JobType {
    CreateNewApp = 'CreateNewApp',
    CreateNewBlueprint = 'CreateNewBlueprint',
    AppendToBlueprint = 'AppendToBlueprint',
    GetTemplateFileContent = 'GetTemplateFileContent',
    WriteToFile = 'WriteToFile',
    AppendToFile = 'AppendToFile',
    ShowMarkdownPreview = 'ShowMarkdownPreview'
}

export interface RawInput {
    assignTo: string;
    defaultValue: string;
    paramId: string;
    required: boolean;
}

interface RawUserPrompt {
    id: string;
    name: string;
    label: string;
    help?: string;
    validators?: {
        // string representation of a regex
        expression: string;
        errorText: string;
    }[];
    value: 'string' | 'enum' | 'boolean';
    enum?: {
        value: string;
        display: string;
    }[];
    resource?: ResourceType,
    placeHolder?: string;
}

export interface ParsedInput extends RawUserPrompt, RawInput {

}

export interface ParsedJob extends RawJob {
    parsedInputs: ParsedInput[];
    parsedActions: ParsedAction[];
}

export function parseScriptTemplates(rawTemplates: RawTemplateV2[], rawBindings: object[], resources: Resources): FunctionV2Template[] {
    const userPrompts: RawUserPrompt[] = parseUserPrompts(rawBindings, resources);
    const templates: FunctionV2Template[] = [];
    for (const templateV2 of rawTemplates) {
        // look into jobs-- each job can be an Azure Wizard. Name is the title
        const parsedJobs: ParsedJob[] = [];
        for (const job of templateV2.jobs) {
            const parsedInputs: ParsedInput[] = [];
            job.inputs.forEach(input => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const userPrompt = userPrompts.find(up => up.id.toLocaleLowerCase() === input.paramId.toLocaleLowerCase())!;
                parsedInputs.push(Object.assign(input, userPrompt));
            });

            const parsedActions: ParsedAction[] = [];
            for (const action of job.actions) {
                const parsedAction = templateV2.actions.find(a => a.name.toLowerCase() === action.toLowerCase())
                if (parsedAction) {
                    parsedActions.push(parsedAction);
                }
            }
            parsedJobs.push(Object.assign(job, { parsedInputs, parsedActions }));
        }
        const isHttpTrigger = !!templateV2.id?.toLowerCase().includes('httptrigger-');
        const isTimerTrigger = !!templateV2.id?.toLowerCase().includes('timertrigger-');

        templates.push(Object.assign(templateV2, { wizards: parsedJobs, id: nonNullValue(templateV2.id), isHttpTrigger, isTimerTrigger }));
    }

    return templates;
}

export function parseUserPrompts(rawUserPrompts: object[], resources: Resources): RawUserPrompt[] {
    const userPrompts: RawUserPrompt[] = [];
    for (const rawUserPrompt of rawUserPrompts) {
        const userPrompt: RawUserPrompt = rawUserPrompt as RawUserPrompt;
        for (const key of Object.keys(rawUserPrompt)) {
            // all of the properties in the rawResources are in the format of "param_name" but the keys in the rawUserPrompt are in the format of "param-name"
            const paramName = userPrompt[key] as unknown;
            if (typeof paramName === 'string' && paramName.startsWith('$')) {
                const resourceKey = paramName.substring(1);
                userPrompt[key] = resources['en'][resourceKey];
            }
        }

        userPrompts.push(userPrompt);
    }
    return userPrompts;
}

