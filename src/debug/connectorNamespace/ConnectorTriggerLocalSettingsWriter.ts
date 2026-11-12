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
import { addValuesToMask, findSettingKey } from '../../connectorTrigger/connectorTriggerUtils';
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
        expected?: Readonly<Record<string, string | undefined>>,
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
        if (expected) {
            const currentValues = settings.Values ?? {};
            const current = Object.fromEntries(
                Object.keys(expected).map(key => [key, getConnectorTriggerSettingValue(currentValues, key)]),
            );
            addValuesToMask(context, ...Object.values(current));
            const changedNames = Object.keys(expected).filter(key => current[key] !== expected[key]);
            if (changedNames.length > 0) {
                throw new ConnectorTriggerLocalSettingsChangedError(changedNames, current);
            }
        }
        for (const [key, value] of Object.entries(values)) {
            addValuesToMask(context, key, value, process.env[key]);
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

/**
 * Returns a local.settings.json Values entry as the host sees it: names match case-insensitively and
 * non-string JSON values are compared by their serialized form. Returns undefined when absent.
 */
export function getConnectorTriggerSettingValue(values: Readonly<Record<string, unknown>>, name: string): string | undefined {
    const key = findSettingKey(values, name);
    if (key === undefined) {
        return undefined;
    }
    const value = values[key];
    return typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
}
