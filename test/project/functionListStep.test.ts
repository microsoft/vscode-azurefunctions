/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UserCancelledError, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { ProjectLanguage } from '../../src/constants';
import { FunctionListStep, isConnectorTriggerTemplateId } from '../../src/commands/createFunction/FunctionListStep';
import { type IFunctionWizardContext } from '../../src/commands/createFunction/IFunctionWizardContext';
import { type TemplateGalleryLaunchOptions } from '../../src/commands/createNewProject/FunctionsTemplateGalleryController';
import { ext } from '../../src/extensionVariables';
import { FuncVersion } from '../../src/FuncVersion';
import { type CentralTemplateProvider } from '../../src/templates/CentralTemplateProvider';
import { type FunctionTemplateBase } from '../../src/templates/IFunctionTemplate';
import { TemplateSchemaVersion } from '../../src/templates/TemplateProviderBase';

suite('FunctionListStep', () => {
    const connectorTemplate: FunctionTemplateBase = {
        id: 'Office365ConnectorTrigger-JavaScript',
        name: 'Office 365 connector trigger',
        language: ProjectLanguage.JavaScript,
        isHttpTrigger: false,
        isTimerTrigger: false,
        isMcpTrigger: false,
        templateSchemaVersion: TemplateSchemaVersion.v1,
    };

    test('opens the filtered template gallery for connector trigger templates during project creation', async () => {
        let launchOptions: TemplateGalleryLaunchOptions | undefined;
        const context = createContext(connectorTemplate);
        const step = new FunctionListStep({
            isProjectWizard: true,
            templateId: undefined,
            functionSettings: undefined,
            showTemplateGallery: options => {
                launchOptions = options;
            },
        });

        await assert.rejects(step.prompt(context), UserCancelledError);
        assert.deepStrictEqual(launchOptions, {
            initialLocation: context.projectPath,
            initialFilters: { resource: 'connector' },
        });
        assert.strictEqual(context.telemetry.properties.flow, 'templateGalleryFromConnector');
        assert.strictEqual(context.functionTemplate, undefined);
    });

    test('keeps connector trigger templates in the create function flow', async () => {
        let galleryOpened = false;
        const context = createContext(connectorTemplate);
        const step = new FunctionListStep({
            isProjectWizard: false,
            templateId: undefined,
            functionSettings: undefined,
            showTemplateGallery: () => {
                galleryOpened = true;
            },
        });

        await step.prompt(context);
        assert.strictEqual(galleryOpened, false);
        assert.strictEqual(context.functionTemplate, connectorTemplate);
    });

    test('identifies connector trigger template ids', () => {
        assert.strictEqual(isConnectorTriggerTemplateId('ConnectorTrigger'), true);
        assert.strictEqual(isConnectorTriggerTemplateId('office365-connector-trigger-csharp'), true);
        assert.strictEqual(isConnectorTriggerTemplateId('HttpTrigger'), false);
    });
});

function createContext(template: FunctionTemplateBase): IFunctionWizardContext {
    const context = {
        language: ProjectLanguage.JavaScript,
        version: FuncVersion.v4,
        projectPath: 'test-project',
        telemetry: {
            properties: {},
            measurements: {},
        },
        ui: {
            showQuickPick: async (
                picksPromise: Promise<IAzureQuickPickItem<FunctionTemplateBase | string>[]>,
            ) => {
                const picks = await picksPromise;
                const connectorPick = picks.find(p => typeof p.data !== 'string' && p.data.id === template.id);
                if (!connectorPick) {
                    throw new Error('Expected connector trigger in function template picks.');
                }
                return connectorPick;
            },
        },
    } as unknown as IFunctionWizardContext;

    ext.templateProvider.registerActionVariable({
        templateSource: undefined,
        getFunctionTemplates: async () => [template],
    } as unknown as CentralTemplateProvider, context);

    return context;
}
