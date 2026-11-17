/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ConnectorTriggerEventIdentity {
    camelName: string;
    csharpClassName: string;
    csharpFileName: string;
    csharpNamespace: string;
    functionName: string;
    operationId: string;
    packageName: string;
    pascalName: string;
    projectName: string;
    pythonFunctionName: string;
    triggerConfigSettingName: string;
    typescriptFileName: string;
}

const windowsReservedNames =
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function getConnectorTriggerEventIdentity(
    _connectorId: string,
    operationId: string,
    instance = 1,
): ConnectorTriggerEventIdentity {
    const instanceSuffix = instance > 1 ? instance.toString() : '';
    const tokens = splitIdentifier(operationId);
    const safeTokens = tokens.length > 0 ? tokens : ['Connector', 'Event'];
    let pascalName = safeTokens.map(toPascalToken).join('');
    let needsPrefix = false;
    if (!/^[A-Za-z]/.test(pascalName) || windowsReservedNames.test(pascalName)) {
        pascalName = `Connector${pascalName}`;
        needsPrefix = true;
    }
    pascalName = `${pascalName}${instanceSuffix}`;

    const operationName = operationId.trim();
    const baseFunctionName =
        /^[A-Za-z][A-Za-z\d_-]*$/.test(operationName) &&
        !windowsReservedNames.test(operationName) ?
            operationName :
            pascalName.replace(new RegExp(`${instanceSuffix}$`), '');
    const functionName = `${baseFunctionName}${instanceSuffix}`;
    const camelName = `${pascalName[0].toLowerCase()}${pascalName.slice(1)}`;
    const basePackageName = safeTokens
        .map(token => token.toLowerCase())
        .join('-');
    const baseSafePackageName = needsPrefix || windowsReservedNames.test(basePackageName) ?
        `connector-${basePackageName}` :
        basePackageName;
    const packageName = instanceSuffix ?
        `${baseSafePackageName}-${instanceSuffix}` :
        baseSafePackageName;
    const pythonBaseName = [
        ...(needsPrefix ? ['connector'] : []),
        ...safeTokens.map(token => token.toLowerCase()),
    ].join('_');

    return {
        camelName,
        csharpClassName: `${pascalName}Function`,
        csharpFileName: `${pascalName}Function.cs`,
        csharpNamespace: `${pascalName}App`,
        functionName,
        operationId,
        packageName,
        pascalName,
        projectName: camelName,
        pythonFunctionName: `${pythonBaseName}${instanceSuffix ? `_${instanceSuffix}` : ''}_function`,
        triggerConfigSettingName: `${functionName.replace(/[^A-Za-z\d_]/g, '_')}TriggerConfigName`,
        typescriptFileName: `${camelName}Function.ts`,
    };
}

function splitIdentifier(value: string): string[] {
    return value
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .split(/[^A-Za-z\d]+/)
        .filter(Boolean);
}

function toPascalToken(token: string): string {
    return `${token[0].toUpperCase()}${token.slice(1)}`;
}
