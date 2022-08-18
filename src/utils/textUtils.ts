/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import { URLSearchParams } from 'url';
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
    provideTextDocumentContent(uri: vscode.Uri, _token: vscode.CancellationToken): vscode.ProviderResult<string> {
        const searchParams = new URLSearchParams(uri.query);

        return searchParams.get('content') ?? undefined;
    }

    registerTextDocumentContent(content: string, filename: string = 'text.txt'): vscode.Uri {
        const searchParams = new URLSearchParams();

        searchParams.append('content', content);

        const query = searchParams.toString();

        // TODO: Do we need the hash now?
        const hash = getPseudononymousStringHash(content);
        const uri = vscode.Uri.from(
            {
                scheme: contentScheme,
                path: `${hash}/${filename}`,
                query
            });

        return uri;
    }
}

let contentProvider: StaticContentProvider | undefined;

export function registerContentProvider(): StaticContentProvider {
    if (!contentProvider) {
        contentProvider = new StaticContentProvider();

        ext.context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(contentScheme, contentProvider));
    }

    return contentProvider;
}

export function registerStaticContent(content: string, filename?: string): vscode.Uri {
    return registerContentProvider().registerTextDocumentContent(content, filename);
}

export async function showMarkdownPreviewContent(content: string, filename: string = 'markdown.md'): Promise<void> {
    const uri = registerStaticContent(content, filename);

    await showMarkdownPreviewFile(uri);
}

export async function showMarkdownPreviewFile(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand('markdown.showPreview', uri);
}
