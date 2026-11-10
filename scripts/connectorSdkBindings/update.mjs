/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import ts from 'typescript';

// Update these pins, then regenerate. Connector names, operations, and types come only from the packages.
const versions = {
    node: {
        '@azure/functions': '4.17.0',
        '@azure/functions-extensions-connectors': '0.2.0-preview',
        '@azure/connectors': '0.4.0-preview',
    },
    csharp: '0.15.0-preview.1',
    python: {
        'azurefunctions-extensions-connectors': '1.0.0b4',
        'azure-connectors': '0.6.0b1',
    },
};

const scriptPath = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptPath, '../../src/connectorTrigger/connectorTriggerSdkBindings.generated.ts');

function run(executable, args, options = {}) {
    return execFileSync(executable, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options });
}

function getNodeBindings(packageRoot) {
    const sdkPath = path.join(packageRoot, '@azure/connectors/dist/esm/generated');
    const extensionPath = path.join(packageRoot, '@azure/functions-extensions-connectors/types/index.d.ts');
    return readdir(sdkPath).then(files => {
        const declarationPaths = files.filter(file => file.endsWith('.d.ts')).sort().map(file => path.join(sdkPath, file));
        const program = ts.createProgram([...declarationPaths, extensionPath], {
            module: ts.ModuleKind.NodeNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            skipLibCheck: true,
        });
        const checker = program.getTypeChecker();
        const bindings = {};
        const operationsByModule = new Map();
        for (const filePath of declarationPaths) {
            const source = program.getSourceFile(filePath);
            const connector = path.basename(filePath, 'Extensions.d.ts').toLowerCase();
            const importPath = `@azure/connectors/generated/${path.basename(filePath, '.d.ts')}`;
            const operations = new Map();
            const payloads = new Map();
            for (const statement of source.statements) {
                if (ts.isVariableStatement(statement)) {
                    for (const declaration of statement.declarationList.declarations) {
                        if (declaration.name.getText(source).endsWith('TriggerOperations') && declaration.type && ts.isTypeLiteralNode(declaration.type)) {
                            for (const property of declaration.type.members) {
                                if (ts.isPropertySignature(property) && property.type && ts.isLiteralTypeNode(property.type) && ts.isStringLiteral(property.type.literal)) {
                                    operations.set(property.name.getText(source), property.type.literal.text);
                                }
                            }
                        }
                    }
                }
                if (ts.isTypeAliasDeclaration(statement) && ts.isTypeReferenceNode(statement.type) &&
                    statement.type.typeName.getText(source) === 'TriggerCallbackPayload') {
                    const comment = ts.displayPartsToString(checker.getSymbolAtLocation(statement.name).getDocumentationComment(checker));
                    const operation = /^Typed callback payload for trigger operation '([^']+)'\./.exec(comment)?.[1];
                    if (!operation || statement.type.typeArguments?.length !== 1) {
                        throw new Error(`Unrecognized SDK callback declaration: ${importPath}/${statement.name.text}`);
                    }
                    const item = statement.type.typeArguments[0];
                    const itemType = checker.getTypeFromTypeNode(item);
                    payloads.set(operation, {
                        itemType: item.getText(source),
                        importPath: itemType.symbol?.declarations?.some(declaration => declaration.getSourceFile() === source) ? importPath : undefined,
                    });
                }
            }
            if (operations.size) {
                operationsByModule.set(path.basename(source.fileName), { connector, operations });
            }
            for (const [operation, payload] of payloads) {
                if (![...operations.values()].includes(operation)) {
                    throw new Error(`Callback is absent from the SDK operation registry: ${connector}/${operation}`);
                }
                (bindings[connector] ??= {})[operation] = payload;
            }
        }

        const extensionSource = program.getSourceFile(extensionPath);
        const exported = checker.getExportsOfModule(checker.getSymbolAtLocation(extensionSource));
        const connectors = exported.find(symbol => symbol.name === 'connectors');
        if (!connectors) {
            throw new Error('The Functions SDK does not export its named helpers.');
        }
        for (const group of checker.getTypeOfSymbolAtLocation(connectors, extensionSource).getProperties()) {
            const helpers = checker.getTypeOfSymbolAtLocation(group, extensionSource).getProperties().map(helper => {
                const signature = checker.getTypeOfSymbolAtLocation(helper, extensionSource).getCallSignatures()[0];
                const options = signature?.getParameters()[1];
                const optionsType = options && checker.getTypeOfSymbolAtLocation(options, extensionSource);
                const handler = optionsType?.getProperty('handler');
                const handlerSignature = handler && checker.getTypeOfSymbolAtLocation(handler, extensionSource).getCallSignatures()[0];
                const event = handlerSignature?.getParameters()[0];
                const eventType = event && checker.getTypeOfSymbolAtLocation(event, extensionSource);
                const items = eventType?.getProperty('items');
                const itemType = items && checker.getIndexTypeOfType(checker.getTypeOfSymbolAtLocation(items, extensionSource), ts.IndexKind.Number);
                const declarations = itemType?.symbol?.declarations ?? [];
                return {
                    helper,
                    registries: [...new Set(declarations.map(declaration =>
                        operationsByModule.get(path.basename(declaration.getSourceFile().fileName))).filter(Boolean))],
                };
            });
            const groupRegistries = [...new Set(helpers.flatMap(helper => helper.registries))];
            for (const { helper, registries } of helpers) {
                for (const registry of registries.length ? registries : groupRegistries.length === 1 ? groupRegistries : []) {
                    // SDK operation constant names and exported helper names share the same semantic identifier.
                    const constantName = helper.name[0].toUpperCase() + helper.name.slice(1);
                    const operation = registry.operations.get(constantName);
                    if (!operation) {
                        continue;
                    }
                    const binding = (bindings[registry.connector] ??= {})[operation] ??= {};
                    const helperPath = `${group.name}.${helper.name}`;
                    if (binding.helper && binding.helper !== helperPath) {
                        throw new Error(`Ambiguous named helper for ${registry.connector}/${operation}`);
                    }
                    binding.helper = helperPath;
                }
            }
        }
        if (!Object.keys(bindings).length || !Object.values(bindings).some(events => Object.values(events).some(binding => binding.helper))) {
            throw new Error('No SDK callback types or named helpers were discovered.');
        }
        return bindings;
    });
}

function renderBindings(node, csharp, python, nodeMinimumVersion) {
    const bindings = {};
    for (const [runtime, connectors] of Object.entries({ typescript: node, csharp, python })) {
        for (const [connector, events] of Object.entries(connectors)) {
            for (const [operation, binding] of Object.entries(events)) {
                const event = (bindings[connector] ??= {})[operation] ??= { typescript: {} };
                event[runtime] = binding;
            }
        }
    }
    const sorted = Object.keys(bindings).sort().map(connector =>
        [connector, Object.keys(bindings[connector]).sort().map(operation => [operation, bindings[connector][operation]])]);
    const entries = sorted.map(([connector, events]) =>
        `    [${JSON.stringify(connector)}, [\n${events.map(event => `        ${JSON.stringify(event)},`).join('\n')}\n    ]],`).join('\n');
    return `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Generated by npm run update-connector-sdk-bindings. Do not edit connector entries by hand.
import type { ConnectorTriggerSdkBinding } from './connectorTriggerSdkBindings';

export const connectorSdkVersions = ${JSON.stringify({ ...versions, nodeMinimumVersion }, null, 4)};

const generatedBindings: readonly [string, readonly [string, ConnectorTriggerSdkBinding][]][] = [
${entries}
];

export const connectorSdkBindings: Readonly<Record<string, Readonly<Record<string, ConnectorTriggerSdkBinding>>>> =
    Object.fromEntries(generatedBindings.map(([connector, events]) => [connector, Object.fromEntries(events)]));
`;
}

export { getNodeBindings, renderBindings };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (!process.env.npm_execpath) {
        throw new Error('Run this generator with npm run update-connector-sdk-bindings.');
    }
    const temporaryPath = await mkdtemp(path.join(tmpdir(), 'azfunc-sdk-bindings-'));
    try {
        await writeFile(path.join(temporaryPath, 'package.json'), JSON.stringify({ private: true, dependencies: versions.node }));
        run(process.execPath, [process.env.npm_execpath, 'install', '--prefix', temporaryPath, '--ignore-scripts', '--no-audit', '--no-fund', '--quiet']);
        const pythonExecutable = process.env.AZFUNC_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
        const pythonPath = path.join(temporaryPath, 'python');
        run(pythonExecutable, ['-m', 'pip', 'install', '--target', pythonPath, '--quiet', '--disable-pip-version-check',
            ...Object.entries(versions.python).map(([name, version]) => `${name}==${version}`),
            "azure-functions==2.4.0b1; python_version >= '3.13'", "azure-functions==1.27.0b1; python_version < '3.13'"]);
        const python = JSON.parse(run(pythonExecutable, [path.join(scriptPath, 'collectPython.py')], {
            env: { ...process.env, PYTHONPATH: pythonPath },
        }));
        await writeFile(path.join(temporaryPath, 'collect.csproj'), `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><TargetFramework>net8.0</TargetFramework><OutputType>Exe</OutputType><Nullable>enable</Nullable><RollForward>Major</RollForward></PropertyGroup>
  <ItemGroup><PackageReference Include="Azure.Connectors.Sdk" Version="${versions.csharp}" /><Compile Include="${path.join(scriptPath, 'collectDotnet.cs').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')}" /></ItemGroup>
</Project>`);
        run('dotnet', ['build', path.join(temporaryPath, 'collect.csproj'), '--nologo', '--verbosity', 'quiet', '--output', path.join(temporaryPath, 'dotnet')]);
        const csharp = JSON.parse(run('dotnet', [path.join(temporaryPath, 'dotnet', 'collect.dll')]));
        const node = await getNodeBindings(path.join(temporaryPath, 'node_modules'));
        const extensionPackage = JSON.parse(await readFile(path.join(temporaryPath, 'node_modules/@azure/functions-extensions-connectors/package.json'), 'utf8'));
        const nodeMinimumVersion = semver.minVersion(extensionPackage.engines.node)?.version;
        if (!nodeMinimumVersion) {
            throw new Error('The Functions SDK does not declare a minimum supported Node.js version.');
        }
        const output = renderBindings(node, csharp, python, nodeMinimumVersion);
        if (process.argv.includes('--check')) {
            if (await readFile(outputPath, 'utf8') !== output) {
                throw new Error('Connector SDK bindings are stale. Run npm run update-connector-sdk-bindings.');
            }
        } else {
            await writeFile(outputPath, output);
        }
        console.log(`Verified ${Object.keys(node).length} Node, ${Object.keys(csharp).length} .NET, and ${Object.keys(python).length} Python connector bindings.`);
    } finally {
        await rm(temporaryPath, { recursive: true, force: true });
    }
}
