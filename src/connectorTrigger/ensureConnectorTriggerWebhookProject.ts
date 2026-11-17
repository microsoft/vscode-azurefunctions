/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, UserCancelledError } from '@microsoft/vscode-azext-utils';
import * as path from 'path';
import { type CancellationToken } from 'vscode';
import { ProjectLanguage } from '../constants';
import { localize } from '../localize';
import { isPathEqual } from '../utils/fs';
import { findConnectorSampleFunctionPaths, validateConnectorSampleFiles } from './connectorSampleProject';
import {
    findConnectorTriggerRegistrations,
    findNonPollingFunctionRegistrations,
    findPollingConnectorBindings,
    getConnectorTriggerRegistrations,
    getNonPollingFunctionRegistrations,
    getPollingConnectorBindings,
    getSourceViews,
    readGroup,
} from './connectorTriggerBindings';
import { getConnectorTriggerEventIdentity, type ConnectorTriggerEventIdentity } from './connectorTriggerEventIdentity';
import { type ConnectorTriggerSelection, type ConnectorTriggerSelections } from './connectorTriggerSelection';
import {
    copyConnectorSampleHandler,
    isSampleHandlerIdentityAvailable,
    validateConnectorTriggerSelections,
    type ConnectorSampleSource,
} from './ensureConnectorTriggerPollProject';

export async function readConnectorWebhookSample(projectPath: string, language: string): Promise<ConnectorSampleSource> {
    await validateConnectorSampleFiles(projectPath);
    const extension = language === ProjectLanguage.CSharp ? '.cs' :
        language === ProjectLanguage.TypeScript ? '.ts' :
            language === ProjectLanguage.Python ? '.py' : undefined;
    const registrations = await findConnectorTriggerRegistrations(projectPath);
    const paths = await findConnectorSampleFunctionPaths(projectPath, registrations);
    for (const functionName of registrations) {
        const sourcePath = paths.get(functionName);
        if (!sourcePath || path.extname(sourcePath).toLowerCase() !== extension) {
            continue;
        }
        const source = await AzExtFsExtra.readFile(sourcePath);
        const sourceRegistrations = getConnectorTriggerRegistrations(source, extension);
        if (sourceRegistrations.filter(name => equalsIgnoreCase(name, functionName)).length !== 1 ||
            getPollingConnectorBindings(source, extension).length ||
            (language === ProjectLanguage.TypeScript && sourceRegistrations.length !== 1)) {
            continue;
        }
        return { projectPath, sourcePath, source, functionName };
    }
    throw unsupportedSample();
}

export async function ensureConnectorTriggerWebhookProjects(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelections,
    sample: ConnectorSampleSource,
    cancellationToken?: CancellationToken,
): Promise<string[]> {
    const selections = validateConnectorTriggerSelections(selection);
    for (const event of selections) {
        await getAvailableIdentity(projectPath, language, event, sample);
    }
    const handlerPaths: string[] = [];
    for (const event of selections) {
        if (cancellationToken?.isCancellationRequested) {
            throw new UserCancelledError('connectorProjectCreation');
        }
        const { identity, alreadyExists } = await getAvailableIdentity(projectPath, language, event, sample);
        handlerPaths.push(alreadyExists ? sample.sourcePath :
            await copyConnectorSampleHandler(projectPath, language, identity, sample, retargetSampleSource(sample, language, identity)));
    }
    return handlerPaths;
}

async function getAvailableIdentity(
    projectPath: string,
    language: string,
    selection: ConnectorTriggerSelection,
    sample: ConnectorSampleSource,
): Promise<{ identity: ConnectorTriggerEventIdentity; alreadyExists: boolean }> {
    const baseIdentity = getConnectorTriggerEventIdentity(selection.connectorId, selection.operationId);
    const registrations = [
        ...await findNonPollingFunctionRegistrations(projectPath),
        ...(await findPollingConnectorBindings(projectPath)).flatMap(binding => binding.functionName ? [binding.functionName] : []),
    ];
    if (registrations.some(name => equalsIgnoreCase(name, baseIdentity.functionName))) {
        if (isPathEqual(projectPath, sample.projectPath) && equalsIgnoreCase(sample.functionName, baseIdentity.functionName) &&
            registrations.filter(name => equalsIgnoreCase(name, baseIdentity.functionName)).length === 1) {
            return { identity: baseIdentity, alreadyExists: true };
        }
        throw new Error(localize(
            'connectorTriggerFunctionNameCollision',
            'A function with the selected event name is already registered. Rename the existing function or select another event before adding a Connector Trigger.',
        ));
    }
    for (let instance = 1; instance <= 100; instance++) {
        const candidate = getConnectorTriggerEventIdentity(selection.connectorId, selection.operationId, instance);
        if (await isSampleHandlerIdentityAvailable(projectPath, language, candidate, sample)) {
            return { identity: { ...candidate, functionName: baseIdentity.functionName }, alreadyExists: false };
        }
    }
    throw new Error(localize('connectorTriggerIdentityUnavailable', 'Unable to create a unique file for the selected Connector Trigger.'));
}

function retargetSampleSource(sample: ConnectorSampleSource, language: string, identity: ConnectorTriggerEventIdentity): string {
    let source = sample.source;
    if (language === ProjectLanguage.CSharp) {
        const view = getSourceViews(source, '.cs');
        const attributes = [...view.structure.matchAll(/\[\s*Function\s*\(\s*(["'])([^"']+)\1\s*\)\s*\]/gid)];
        if (attributes.filter(match => equalsIgnoreCase(readGroup(view, match, 2), sample.functionName)).length !== 1) {
            throw unsupportedSample();
        }
        for (const attribute of attributes.reverse()) {
            if (!equalsIgnoreCase(readGroup(view, attribute, 2), sample.functionName)) {
                source = source.slice(0, attribute.index) + source.slice(attribute.index + attribute[0].length);
            }
        }
    }
    const name = new RegExp(`(["'])${escapeRegExp(sample.functionName)}\\1`, 'g');
    if (!name.test(source)) {
        throw unsupportedSample();
    }
    source = source.replace(name, (_match, quote: string) => `${quote}${identity.functionName}${quote}`);
    const extension = path.extname(sample.sourcePath).toLowerCase();
    if (getConnectorTriggerRegistrations(source, extension).filter(name => equalsIgnoreCase(name, identity.functionName)).length !== 1 ||
        (language !== ProjectLanguage.Python && getNonPollingFunctionRegistrations(source, extension).length !== 1)) {
        throw unsupportedSample();
    }
    return source;
}

function unsupportedSample(): Error {
    return new Error(localize('connectorTriggerWebhookTemplateUnsupported',
        'The selected project template cannot be materialized using the generic Connector Trigger webhook sample.'));
}

function equalsIgnoreCase(left: string | undefined, right: string): boolean {
    return !!left && left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
