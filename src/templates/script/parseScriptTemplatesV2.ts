/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { nonNullValue } from '@microsoft/vscode-azext-utils';
import { ProjectLanguage } from '../../constants';
import { ResourceType } from '../IBindingTemplate';
import { IFunctionTemplateV2 } from '../IFunctionTemplateV2';

/**
 * Describes script template resources to be used for parsing
 */
export interface IResources {
    lang?: { [key: string]: string | undefined };
    // Every Resources.json file also contains the english strings
    en: { [key: string]: string | undefined };
}

export interface IRawTemplateV2 {
    actions: IParsedAction[];
    author?: string;
    name: string;
    id?: string;
    description: string;
    programmingModel: 'v1' | 'v2';
    language: ProjectLanguage;
    jobs: IRawJob[]
    files: { [filename: string]: string };
}

interface IParsedAction {
    name: string;
    type: string;
    assignTo: string;
    filePath: string;
    continueOnError?: boolean;
    errorText?: string;
    source: string;
    createIfNotExists: boolean;
    replaceTokens: boolean;
}

interface IRawJob {
    actions: string[];
    condition: { name: string, expectedValue: string }
    inputs: IRawInput[];
    name: string;
    type: string;
}

export interface IRawInput {
    assignTo: string;
    defaultValue: string;
    paramId: string;
    required: boolean;
}

interface IRawUserPrompt {
    id: string;
    name: string;
    label: string;
    help?: string;
    validator?: {
        // string representation of a regex
        expression: string;
        errorText: string;
    }[];
    value: 'string' | 'enum' | 'boolean';
    enum?: {
        value: string;
        display: string;
    };
    resource?: ResourceType,
    placeHolder?: string;
}

interface IParsedInputPrompt extends IRawUserPrompt {
    assignTo: string;
    defaultValue: string;
    required: boolean;
}

export interface IParsedJob extends IRawJob {
    prompts: IParsedInputPrompt[];
    // doesn't seem like there's a need to parse these yet
    executes: IParsedAction[];
}

export function parseScriptTemplates(rawTemplates: IRawTemplateV2[], rawBindings: object[], resources: IResources): IFunctionTemplateV2[] {
    const userPrompts: IRawUserPrompt[] = parseUserPrompts(rawBindings, resources);
    const templates: IFunctionTemplateV2[] = [];
    for (const templateV2 of rawTemplates) {
        // look into jobs-- each job can be an Azure Wizard. Name is the title
        const parsedJobs: IParsedJob[] = [];
        for (const job of templateV2.jobs) {
            const prompts: IParsedInputPrompt[] = [];
            job.inputs.forEach(input => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const userPrompt = userPrompts.find(up => up.id.toLocaleLowerCase() === input.paramId.toLocaleLowerCase())!;
                prompts.push(Object.assign(input, userPrompt));
            });

            const executes: IParsedAction[] = [];
            for (const action of job.actions) {
                const parsedAction = templateV2.actions.find(a => a.name.toLowerCase() === action.toLowerCase())
                if (parsedAction) {
                    executes.push(parsedAction);
                }
            }
            parsedJobs.push(Object.assign(job, { prompts, executes }));
        }

        templates.push(Object.assign(templateV2, { wizards: parsedJobs, id: nonNullValue(templateV2.id) }));
    }

    return templates;
}

export function parseUserPrompts(rawUserPrompts: object[], resources: IResources): IRawUserPrompt[] {
    const userPrompts: IRawUserPrompt[] = [];
    for (const rawUserPrompt of rawUserPrompts) {
        const userPrompt: IRawUserPrompt = rawUserPrompt as IRawUserPrompt;
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

