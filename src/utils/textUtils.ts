/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as vscode from 'vscode';

import { ext } from '../extensionVariables';

const contentScheme = 'vscode-azurefunctions-static-content';

/**
 * @remarks Borrowed from vscode-azuretools
 */
function getPseudononymousStringHash(s: string, encoding: crypto.BinaryToTextEncoding = 'base64'): string {
    return crypto.createHash('sha256').update(s).digest(encoding);
}

class StaticContentProvider implements vscode.TextDocumentContentProvider {
    private readonly contentMap = new Map<string, string>();

    provideTextDocumentContent(uri: vscode.Uri, _token: vscode.CancellationToken): vscode.ProviderResult<string> {
        const content = this.contentMap.get(uri.toString());

        if (content === undefined) {
            throw new Error('Unable to find the requested content.');
        }

        return content;
    }

    registerTextDocumentContent(content: string, filename: string = 'text.txt'): vscode.Uri {
        const hash = getPseudononymousStringHash(content);
        const uri = vscode.Uri.parse(`${contentScheme}://${hash}/${filename}`)

        this.contentMap.set(uri.toString(), content);

        return uri;
    }
}

let contentProvider: StaticContentProvider | undefined;

function getContentProvider(): StaticContentProvider {
    if (!contentProvider) {
        contentProvider = new StaticContentProvider();

        ext.context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(contentScheme, contentProvider));
    }

    return contentProvider;
}

export function registerStaticContent(content: string, filename?: string): vscode.Uri {
    return getContentProvider().registerTextDocumentContent(content, filename);
}

export async function showMarkdownPreviewContent(content: string, filename: string = 'markdown.md'): Promise<void> {
    const uri = registerStaticContent(content, filename);

    await vscode.commands.executeCommand('markdown.showPreview', uri);
}
