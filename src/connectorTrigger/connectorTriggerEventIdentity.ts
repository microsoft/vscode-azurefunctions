/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ConnectorTriggerPayloadModel {
    schemaName: string;
    collectionSchemaName: string;
    csharp?: {
        namespace: string;
        packageName: string;
        packageVersion: string;
        payloadType: string;
    };
    python?: {
        importName: string;
        importPath: string;
        packageName: string;
        packageVersion: string;
        wireProperties: Readonly<Record<string, string>>;
    };
    typescript?: {
        importName: string;
        importPath: string;
    };
}

export interface ConnectorTriggerEventIdentity {
    camelName: string;
    csharpClassName: string;
    csharpFileName: string;
    csharpNamespace: string;
    functionName: string;
    operationId: string;
    packageName: string;
    pascalName: string;
    payloadModel?: ConnectorTriggerPayloadModel;
    projectName: string;
    pythonFunctionName: string;
    triggerConfigSettingName: string;
    typescriptFileName: string;
}

const windowsReservedNames =
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

const calendarChangedPayload: ConnectorTriggerPayloadModel = {
    schemaName: 'GraphCalendarEventClientWithActionType',
    collectionSchemaName: 'GraphCalendarEventListWithActionType',
    csharp: {
        namespace: 'Azure.Connectors.Sdk.Office365.Models',
        packageName: 'Azure.Connectors.Sdk',
        packageVersion: '0.14.0-preview.1',
        payloadType: 'Office365OnCalendarChangedItemsTriggerPayload',
    },
    python: {
        importName: 'GraphCalendarEventClientWithActionType',
        importPath: 'azure.connectors.office365',
        packageName: 'azure-connectors',
        packageVersion: '0.1.0',
        wireProperties: {
            ActionType: 'action_type',
            IsAdded: 'is_added',
            IsUpdated: 'is_updated',
            subject: 'subject',
            start: 'start',
            end: 'end',
            startWithTimeZone: 'start_with_time_zone',
            endWithTimeZone: 'end_with_time_zone',
            body: 'body',
            isHtml: 'is_html',
            responseType: 'response_type',
            responseTime: 'response_time',
            id: 'id',
            createdDateTime: 'created_date_time',
            lastModifiedDateTime: 'last_modified_date_time',
            organizer: 'organizer',
            timeZone: 'time_zone',
            seriesMasterId: 'series_master_id',
            iCalUId: 'i_cal_u_id',
            categories: 'categories',
            webLink: 'web_link',
            requiredAttendees: 'required_attendees',
            optionalAttendees: 'optional_attendees',
            resourceAttendees: 'resource_attendees',
            location: 'location',
            importance: 'importance',
            isAllDay: 'is_all_day',
            recurrence: 'recurrence',
            recurrenceEnd: 'recurrence_end',
            numberOfOccurences: 'number_of_occurences',
            reminderMinutesBeforeStart: 'reminder_minutes_before_start',
            isReminderOn: 'is_reminder_on',
            showAs: 'show_as',
            responseRequested: 'response_requested',
            sensitivity: 'sensitivity',
        },
    },
    typescript: {
        importName: 'GraphCalendarEventClientWithActionType',
        importPath: '@azure/connectors/generated/Office365Extensions',
    },
};

const payloadModels = new Map<string, ConnectorTriggerPayloadModel>([
    [
        getPayloadKey('office365', 'CalendarGetOnChangedItemsV3'),
        calendarChangedPayload,
    ],
]);

export function getConnectorTriggerEventIdentity(
    connectorId: string,
    operationId: string,
): ConnectorTriggerEventIdentity {
    const tokens = splitIdentifier(operationId);
    const safeTokens = tokens.length > 0 ? tokens : ['Connector', 'Event'];
    let pascalName = safeTokens.map(toPascalToken).join('');
    let needsPrefix = false;
    if (!/^[A-Za-z]/.test(pascalName) || windowsReservedNames.test(pascalName)) {
        pascalName = `Connector${pascalName}`;
        needsPrefix = true;
    }

    const operationName = operationId.trim();
    const functionName =
        /^[A-Za-z][A-Za-z\d_-]*$/.test(operationName) &&
        !windowsReservedNames.test(operationName) ?
            operationName :
            pascalName;
    const camelName = `${pascalName[0].toLowerCase()}${pascalName.slice(1)}`;
    const basePackageName = safeTokens
        .map(token => token.toLowerCase())
        .join('-');
    const packageName = needsPrefix || windowsReservedNames.test(basePackageName) ?
        `connector-${basePackageName}` :
        basePackageName;
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
        payloadModel: payloadModels.get(getPayloadKey(connectorId, operationId)),
        projectName: camelName,
        pythonFunctionName: `${pythonBaseName}_function`,
        triggerConfigSettingName: `${functionName}TriggerConfigName`,
        typescriptFileName: `${camelName}Function.ts`,
    };
}

function getPayloadKey(connectorId: string, operationId: string): string {
    return `${connectorId.toLowerCase()}\0${operationId.toLowerCase()}`;
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
