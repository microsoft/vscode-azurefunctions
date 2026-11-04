/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProjectLanguage } from '../constants';
import {
    TemplateCategory,
    type IProjectTemplate,
} from '../templates/projectTemplates/IProjectTemplate';

const genericTemplates = new Map<ProjectLanguage, IProjectTemplate>([
    [ProjectLanguage.CSharp, createGenericTemplate(
        'generic-connector-trigger-csharp',
        'Generic Connector Trigger (C#)',
        ProjectLanguage.CSharp,
        'https://github.com/Azure-Samples/functions-connectors-net',
        '01698c55fd05899cc15aa540ab86f8103cb0d5fe',
    )],
    [ProjectLanguage.TypeScript, createGenericTemplate(
        'generic-connector-trigger-typescript',
        'Generic Connector Trigger (TypeScript)',
        ProjectLanguage.TypeScript,
        'https://github.com/Azure-Samples/functions-connectors-typescript',
        '3bb7fff156eb1856d16cc8488599a2f28fbd8522',
    )],
    [ProjectLanguage.Python, createGenericTemplate(
        'generic-connector-trigger-python',
        'Generic Connector Trigger (Python)',
        ProjectLanguage.Python,
        'https://github.com/Azure-Samples/functions-connectors-python',
        'fecf4d0666e84e07291355ac9e40904397bf6749',
    )],
]);

export function getGenericConnectorTriggerTemplate(
    language: string,
): IProjectTemplate | undefined {
    const template = genericTemplates.get(language as ProjectLanguage);
    return template ? {
        ...template,
        categories: [...template.categories],
        languages: [...template.languages],
    } : undefined;
}

export function isGenericConnectorTriggerTemplate(
    template: IProjectTemplate,
    language: string,
): boolean {
    const expected = genericTemplates.get(language as ProjectLanguage);
    return !!expected &&
        template.id === expected.id &&
        template.repositoryUrl === expected.repositoryUrl &&
        template.folderPath === expected.folderPath &&
        template.gitRef === expected.gitRef;
}

function createGenericTemplate(
    id: string,
    displayName: string,
    language: ProjectLanguage,
    repositoryUrl: string,
    gitRef: string,
): IProjectTemplate {
    return {
        id,
        displayName,
        shortDescription: 'Generic Poll Connector Trigger project',
        categories: ['connectors' as TemplateCategory],
        languages: [language],
        repositoryUrl,
        folderPath: 'genericApp',
        gitRef,
    };
}
