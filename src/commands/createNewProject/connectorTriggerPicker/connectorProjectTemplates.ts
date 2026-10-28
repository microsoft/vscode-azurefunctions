/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IProjectTemplate } from '../../../templates/projectTemplates/IProjectTemplate';
import { type ConnectorTriggerOption } from '../../../webview/connectorTriggerPicker/ConnectorTriggerPickerViewModel';

type ConnectorProjectTemplate = IProjectTemplate & {
    connectorName?: string;
    resource?: string;
};

export function findConnectorProjectTemplates(
    templates: IProjectTemplate[],
    connector: Pick<ConnectorTriggerOption, 'id' | 'label'>,
): IProjectTemplate[] {
    const connectorId = connector.id.toLowerCase();
    const connectorTokens = connector.label
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(token => token.length > 1);

    return templates
        .filter(template => {
            const candidate = template as ConnectorProjectTemplate;
            const isConnectorTemplate =
                candidate.resource?.toLowerCase() === 'connector' ||
                template.categories.some(category => category.toLowerCase() === 'connectors');
            if (!isConnectorTemplate) {
                return false;
            }

            if (candidate.connectorName?.localeCompare(
                connector.id,
                undefined,
                { sensitivity: 'accent' },
            ) === 0) {
                return true;
            }

            const corpus = [
                template.id,
                template.displayName,
                template.shortDescription,
            ].join(' ').toLowerCase();
            return corpus.includes(connectorId) ||
                connectorTokens.every(token => corpus.includes(token));
        })
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
}
