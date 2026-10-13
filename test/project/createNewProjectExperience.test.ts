/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { routeCreateNewProject } from '../../src/commands/createNewProject/createNewProject';

type ProjectCreationExperience = 'classic' | 'templateGallery';

suite('Create New Project experience', () => {
    test('routes Classic Create to the template feed', async () => {
        const { context, promptState } = createContext('classic');
        const { calls, handlers } = createHandlers();

        await routeCreateNewProject(context, {}, handlers);

        assert.deepStrictEqual(promptState.labels, [
            'Classic Create (Template Feed)',
            'New Create (Template Gallery)',
        ]);
        assert.strictEqual(calls.classic, 1);
        assert.strictEqual(calls.templateGallery, 0);
        assert.strictEqual(context.telemetry.properties.projectCreationExperience, 'classic');
        assert.strictEqual(context.telemetry.properties.flow, undefined);
    });

    test('routes New Create to the Template Gallery', async () => {
        const { context } = createContext('templateGallery');
        const { calls, handlers } = createHandlers();

        await routeCreateNewProject(context, {}, handlers);

        assert.strictEqual(calls.classic, 0);
        assert.strictEqual(calls.templateGallery, 1);
        assert.strictEqual(context.telemetry.properties.projectCreationExperience, 'templateGallery');
        assert.strictEqual(context.telemetry.properties.flow, 'templateGallery');
    });

    test('bypasses the selector for explicit classic paths', async () => {
        for (const options of [{ templateId: 'HttpTrigger' }, { startFromScratch: true }]) {
            const { context, promptState } = createContext('classic');
            const { calls, handlers } = createHandlers();

            await routeCreateNewProject(context, options, handlers);

            assert.strictEqual(promptState.count, 0);
            assert.strictEqual(calls.classic, 1);
            assert.strictEqual(calls.templateGallery, 0);
        }
    });
});

function createContext(selection: ProjectCreationExperience): {
    context: IActionContext;
    promptState: { count: number; labels: string[] };
} {
    const promptState = { count: 0, labels: [] as string[] };
    const context = {
        telemetry: { properties: {} },
        ui: {
            showQuickPick: async (picks: IAzureQuickPickItem<ProjectCreationExperience>[]) => {
                promptState.count += 1;
                promptState.labels = picks.map(pick => pick.label);
                const selectionPick = picks.find(pick => pick.data === selection);
                assert.ok(selectionPick);
                return selectionPick;
            },
        },
    } as unknown as IActionContext;

    return { context, promptState };
}

function createHandlers(): {
    calls: { classic: number; templateGallery: number };
    handlers: {
        createClassicProject(): Promise<void>;
        showTemplateGallery(): void;
    };
} {
    const calls = { classic: 0, templateGallery: 0 };
    return {
        calls,
        handlers: {
            createClassicProject: async () => {
                calls.classic += 1;
            },
            showTemplateGallery: () => {
                calls.templateGallery += 1;
            },
        },
    };
}
