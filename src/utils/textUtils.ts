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

    registerTextDocumentContent(content: string, extension: string = '.txt'): vscode.Uri {
        const hash = getPseudononymousStringHash(content);
        const uri = vscode.Uri.parse(`${contentScheme}://${hash}/file${extension}`)

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

export function registerStaticContent(content: string, extension?: string): vscode.Uri {
    return getContentProvider().registerTextDocumentContent(content, extension);
}

export async function showMarkdownPreviewContent(content: string): Promise<void> {
    const uri = registerStaticContent(content, '.md');

    await vscode.commands.executeCommand('markdown.showPreview', uri);
}
