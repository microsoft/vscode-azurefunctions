/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import extract from 'extract-zip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface TemplateJsonSymbol {
    type: string;
    datatype?: string;
    defaultValue?: string;
    description?: string;
    choices?: TemplateJsonChoice[] | Record<string, string>;
}

interface TemplateJsonChoice {
    choice: string;
    description: string;
}

interface TemplateJson {
    identity: string;
    name: string;
    shortName: string;
    defaultName?: string;
    sourceName?: string;
    author?: string;
    classifications?: string[];
    groupIdentity?: string;
    symbols?: Record<string, TemplateJsonSymbol>;
}

/**
 * Output format matching the JSON Cli tool's output so that
 * parseDotnetTemplates.ts can consume it without changes.
 */
export interface RawParameter {
    Documentation: string | undefined;
    Name: string;
    DefaultValue: string | undefined;
    DataType: string | undefined;
    Choices: Record<string, string> | undefined;
}

export interface RawTemplate {
    Identity: string;
    Name: string;
    ShortName: string;
    DefaultName: string;
    Author: string;
    Classifications: string[];
    GroupIdentity: string;
    Parameters: RawParameter[];
}

/**
 * Parses .NET template metadata directly from a nupkg file by extracting
 * the `.template.config/template.json` files within it.
 * This replaces the need for the Microsoft.TemplateEngine.JsonCli tool.
 */
export async function parseTemplatesFromNupkg(nupkgPath: string): Promise<RawTemplate[]> {
    const tempDir = path.join(os.tmpdir(), `azfunc-templates-${Date.now()}-${Math.random().toString(36).substring(2)}`);

    try {
        await extract(nupkgPath, { dir: tempDir });

        const templateJsonFiles = await findTemplateJsonFiles(tempDir);

        const results = await Promise.all(templateJsonFiles.map(async (jsonFile) => {
            try {
                const content = await fs.promises.readFile(jsonFile, 'utf-8');
                const templateJson: TemplateJson = JSON.parse(content);
                return convertToRawTemplate(templateJson);
            } catch {
                // Ignore malformed template.json files
                return undefined;
            }
        }));

        return results.filter((t): t is RawTemplate => t !== undefined);
    } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
    }
}

/**
 * Finds the shortName for a template with a given identity by searching
 * through the provided nupkg files.
 */
export async function findShortNameByIdentity(nupkgPaths: string[], identity: string): Promise<string> {
    for (const nupkgPath of nupkgPaths) {
        try {
            const templates = await parseTemplatesFromNupkg(nupkgPath);
            const match = templates.find(t => t.Identity === identity);
            if (match) {
                return match.ShortName;
            }
        } catch {
            // continue to next nupkg
        }
    }
    throw new Error(`Template with identity "${identity}" not found in any of the provided nupkg files.`);
}

function convertToRawTemplate(templateJson: TemplateJson): RawTemplate {
    const parameters: RawParameter[] = [];

    if (templateJson.symbols) {
        for (const [name, symbol] of Object.entries(templateJson.symbols)) {
            if (symbol.type === 'parameter') {
                parameters.push({
                    Documentation: symbol.description,
                    Name: name,
                    DefaultValue: symbol.defaultValue,
                    DataType: symbol.datatype ?? undefined,
                    Choices: convertChoices(symbol.choices),
                });
            }
        }
    }

    return {
        Identity: templateJson.identity,
        Name: templateJson.name,
        ShortName: templateJson.shortName,
        DefaultName: templateJson.defaultName ?? templateJson.sourceName ?? templateJson.name,
        Author: templateJson.author ?? '',
        Classifications: templateJson.classifications ?? [],
        GroupIdentity: templateJson.groupIdentity ?? '',
        Parameters: parameters,
    };
}

function convertChoices(choices?: TemplateJsonChoice[] | Record<string, string>): Record<string, string> | undefined {
    if (!choices) {
        return undefined;
    }

    // Handle array format: [{ choice: "X", description: "Y" }]
    if (Array.isArray(choices)) {
        const dict: Record<string, string> = {};
        for (const choice of choices) {
            dict[choice.choice] = choice.description;
        }
        return dict;
    }

    // Handle dict format: { "X": "Y" }
    return choices;
}

async function findTemplateJsonFiles(dir: string): Promise<string[]> {
    const results: string[] = [];

    async function walk(currentDir: string): Promise<void> {
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.name === 'template.json' && path.basename(path.dirname(fullPath)) === '.template.config') {
                results.push(fullPath);
            }
        }
    }

    await walk(dir);
    return results;
}
