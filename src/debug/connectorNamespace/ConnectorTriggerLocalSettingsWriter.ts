/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AzExtFsExtra, type IActionContext } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';
import * as os from 'os';
import * as path from 'path';
import { Range, Uri, WorkspaceEdit, workspace } from 'vscode';
import { localSettingsFileName } from '../../constants';
import { localize } from '../../localize';
import { parseJson } from '../../utils/parseJson';
import {
    ConnectorTriggerF5SetupError,
    ConnectorTriggerLocalSettingsChangedError,
    type ConnectorTriggerLocalSettingsWriter,
} from './connectorTriggerF5Contracts';

export class FileConnectorTriggerLocalSettingsWriter implements ConnectorTriggerLocalSettingsWriter {
    public async write(
        context: IActionContext,
        projectPath: string,
        values: Readonly<Record<string, string>>,
        expectedExisting?: Readonly<Record<string, boolean>>,
    ): Promise<void> {
        const localSettingsPath = path.join(projectPath, localSettingsFileName);
        const uri = Uri.file(localSettingsPath);
        const exists = await AzExtFsExtra.pathExists(localSettingsPath);
        const original = exists ? (await AzExtFsExtra.readFile(localSettingsPath)).toString() : `{"IsEncrypted":false}${os.EOL}`;
        const document = exists ? await workspace.openTextDocument(uri) : undefined;
        const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
        if (document?.isDirty || document && document.getText() !== original.slice(bom.length)) {
            throw settingsChanged();
        }
        let contents = original.slice(bom.length).trim() ? original.slice(bom.length) : '{}';
        const settings = parseJson<{ IsEncrypted?: boolean; Values?: Record<string, unknown> }>(contents);
        if (settings.IsEncrypted) {
            throw new ConnectorTriggerF5SetupError(undefined, localize('connectorSettingsEncrypted', 'Decrypt local.settings.json using the Azure Functions extension, then retry F5. Encrypted settings were not changed.'));
        }
        if (settings.IsEncrypted === undefined) {
            contents = jsonc.applyEdits(contents, jsonc.modify(contents, ['IsEncrypted'], false, {}));
        }
        if (expectedExisting) {
            const currentValues = settings.Values ?? {};
            const currentExisting = Object.fromEntries(
                Object.keys(expectedExisting).map(key => [key, Object.hasOwn(currentValues, key)]),
            );
            const changedNames = Object.keys(expectedExisting).filter(key => currentExisting[key] !== expectedExisting[key]);
            if (changedNames.length > 0) {
                throw new ConnectorTriggerLocalSettingsChangedError(changedNames, currentExisting);
            }
        }
        for (const [key, value] of Object.entries(values)) {
            maskValue(context, key);
            maskValue(context, value);
            maskValue(context, process.env[key] ?? '');
            if (process.env[key] !== undefined && process.env[key] !== value) {
                throw new ConnectorTriggerF5SetupError(undefined, localize('connectorSettingsEnvironmentOverride', 'An environment variable overrides a computed Connector Trigger setting. Update or remove the override and restart VS Code before retrying F5. Local settings were not changed.'));
            }
            const edits = jsonc.modify(contents, ['Values', key], value, {
                formattingOptions: { insertSpaces: true, tabSize: 4, eol: original.includes('\r\n') ? '\r\n' : os.EOL },
            });
            contents = jsonc.applyEdits(contents, edits);
        }
        if (bom + contents === original) {
            return;
        }
        if (!document) {
            await fs.promises.writeFile(localSettingsPath, bom + contents, { encoding: 'utf8', flag: 'wx' });
            return;
        }
        const version = document.version;
        if ((await AzExtFsExtra.readFile(localSettingsPath)).toString() !== original ||
            document.isDirty || document.version !== version) {
            throw settingsChanged();
        }
        const edit = new WorkspaceEdit();
        edit.replace(uri, new Range(document.positionAt(0), document.positionAt(document.getText().length)), contents);
        if (!await workspace.applyEdit(edit) || !await document.save()) {
            throw settingsChanged();
        }
    }

}

function settingsChanged(): Error {
    return new ConnectorTriggerF5SetupError(undefined, localize('connectorSettingsChanged', 'Save or resolve changes to local.settings.json, then retry F5. Connector Trigger settings were not saved.'));
}

function maskValue(context: IActionContext, value: string): void {
    if (value && !context.valuesToMask.includes(value)) {
        context.valuesToMask.push(value);
    }
}
