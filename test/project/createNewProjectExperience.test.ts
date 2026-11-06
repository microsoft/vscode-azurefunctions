/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { initializeWorkflowTelemetry, UserCancelledError, type IActionContext, type IAzureQuickPickItem } from '@microsoft/vscode-azext-utils';
import * as assert from 'assert';
import { routeCreateNewProject } from '../../src/commands/createNewProject/createNewProject';
import { runWithTelemetryContext } from '../utils/runWithTelemetryContext';

type ProjectCreationExperience = 'classic' | 'templateGallery';

suite('Create New Project experience', () => {
    test('routes Classic Create to the template feed', async () => {
        const { context, promptState } = createContext('classic');
        const { calls, handlers } = createHandlers();

        await runWithTelemetryContext(context, async () => routeCreateNewProject(context, {}, handlers));

        assert.deepStrictEqual(promptState.items, [
            {
                label: 'Classic Create',
                description: 'Template Feed',
            },
            {
                label: 'New Create',
                description: 'Template Gallery',
            },
        ]);
        assert.strictEqual(calls.classic, 1);
        assert.strictEqual(calls.templateGallery, 0);
        assert.strictEqual(context.telemetry.properties.projectCreationExperience, 'classic');
        assert.strictEqual(context.telemetry.properties.flow, undefined);
    });

    test('routes New Create to the Template Gallery', async () => {
        const { context } = createContext('templateGallery');
        const { calls, handlers } = createHandlers();

        await runWithTelemetryContext(context, async () => routeCreateNewProject(context, {}, handlers));

        assert.strictEqual(calls.classic, 0);
        assert.strictEqual(calls.templateGallery, 1);
        assert.strictEqual(context.telemetry.properties.projectCreationExperience, 'templateGallery');
        assert.strictEqual(context.telemetry.properties.flow, 'templateGallery');
        assert.strictEqual(context.telemetry.properties.outcome, 'handedOff');
        assert.strictEqual(context.telemetry.properties.cancelReason, 'templateGallery');
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

    test('preserves actual selector dismissal instead of claiming a handoff', async () => {
        const { context } = createContext('classic');
        const { calls, handlers } = createHandlers();
        context.ui.showQuickPick = async () => { throw new UserCancelledError(); };

        await assert.rejects(routeCreateNewProject(context, {}, handlers), UserCancelledError);

        assert.deepStrictEqual(calls, { classic: 0, templateGallery: 0 });
        assert.notStrictEqual(context.telemetry.properties.outcome, 'handedOff');
    });

    test('does not report a gallery handoff when launching the gallery fails', async () => {
        const { context } = createContext('templateGallery');
        const { handlers } = createHandlers();
        handlers.showTemplateGallery = () => { throw new Error('launch failed'); };

        await assert.rejects(routeCreateNewProject(context, {}, handlers), /launch failed/);

        assert.notStrictEqual(context.telemetry.properties.outcome, 'handedOff');
    });
});

function createContext(selection: ProjectCreationExperience): {
    context: IActionContext;
    promptState: { count: number; items: { label: string; description: string | undefined }[] };
} {
    const promptState = { count: 0, items: [] as { label: string; description: string | undefined }[] };
    const context = {
        telemetry: { properties: {}, measurements: {} },
        errorHandling: { issueProperties: {} },
        valuesToMask: [],
        ui: {
            showQuickPick: async (picks: IAzureQuickPickItem<ProjectCreationExperience>[]) => {
                promptState.count += 1;
                promptState.items = picks.map(pick => ({ label: pick.label, description: pick.description }));
                const selectionPick = picks.find(pick => pick.data === selection);
                assert.ok(selectionPick);
                return selectionPick;
            },
        },
    } as unknown as IActionContext;
    initializeWorkflowTelemetry(context, { workflow: 'createProject', command: 'createNewProject' });

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
