/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTestActionContext } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { ProjectLanguage } from '../src/constants';
import { FuncVersion } from '../src/FuncVersion';
import { CentralTemplateProvider } from '../src/templates/CentralTemplateProvider';
import { type FunctionTemplateBase } from '../src/templates/IFunctionTemplate';
import { type ITemplates } from '../src/templates/ITemplates';

suite('Classic Core Tools template filtering', () => {
    for (const [language, languageModel, projectTemplateKey, excludedIds, httpId] of [
        [ProjectLanguage.Python, 2, undefined, [
            'OutlookTrigger-Python',
            'SharepointTrigger-Python',
            'OneDriveTrigger-Python',
            'DataverseTrigger-Python',
            'TeamsTrigger-Python',
        ], 'HttpTrigger-Python'],
        [ProjectLanguage.CSharp, undefined, 'net8.0-isolated', [
            'Azure.Function.CSharp.Isolated.ConnectorTrigger.Office365.OnNewEmailV3',
            'Azure.Function.CSharp.Isolated.ConnectorTrigger.SharePoint.GetOnNewFileItems',
            'Azure.Function.CSharp.Isolated.ConnectorTrigger.Teams.OnNewChannelMessage',
            'Azure.Function.CSharp.Isolated.ConnectorTrigger.OneDrive.OnNewFilesV2',
            'Azure.Function.CSharp.Isolated.ConnectorTrigger.Dataverse.SubscribeOnNewItems',
        ], 'Azure.Function.CSharp.Isolated.HttpTrigger'],
    ] as const) {
        for (const source of ['latest', 'matching cache', 'stale cache', 'backup']) {
            test(`${language}: excludes only Core Tools IDs from ${source}`, async () => {
                const context = await createTestActionContext();
                const central = new CentralTemplateProvider();
                const [provider] = CentralTemplateProvider.getProviders(undefined, language, languageModel, FuncVersion.v4, projectTemplateKey);
                const makeTemplate = (id: string): FunctionTemplateBase => ({
                    id, name: id, language, templateSchemaVersion: provider.templateSchemaVersion,
                    isHttpTrigger: id === httpId, isTimerTrigger: false, isMcpTrigger: false,
                    ...(language === ProjectLanguage.Python ? { wizards: [] } : { categories: [] }),
                });
                const included = [makeTemplate(httpId), makeTemplate(`${excludedIds[0]}.Custom`)];
                const templates: ITemplates = {
                    functionTemplates: [
                        ...excludedIds.flatMap(id => [makeTemplate(id), makeTemplate(id.toUpperCase())]),
                        ...included,
                        { ...makeTemplate(httpId), language: ProjectLanguage.Java },
                    ],
                    bindingTemplates: [],
                };
                provider.getLatestTemplateVersion = async () => 'new';
                provider.getCachedTemplateVersion = async () => source === 'matching cache' ? 'new' : 'old';
                provider.doesCachedProjKeyMatch = async () => true;
                provider.getCachedTemplates = async () => source.includes('cache') ? templates : undefined;
                provider.getLatestTemplates = async () => {
                    if (source !== 'latest') {
                        throw new Error('Test feed unavailable');
                    }
                    return templates;
                };
                provider.getBackupTemplateVersion = async () => 'backup';
                provider.getBackupTemplates = async () => templates;
                provider.cacheTemplateMetadata = async () => undefined;
                provider.cacheTemplates = async () => undefined;

                try {
                    const result = await central['refreshTemplatesForProvider'](context, provider);
                    assert.deepStrictEqual(result.functionTemplates, included);
                    assert.strictEqual(context.telemetry.properties.templateSource,
                        source.includes('cache') ? 'cache' : source);
                } finally {
                    provider.dispose();
                    central.dispose();
                }
            });
        }
    }
});
