/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { validationUtils } from '@microsoft/vscode-azext-utils';
import { localize } from '../../../localize';

export function validateConnectorNamespaceName(namespaceName: string = ''): string | undefined {
    namespaceName = namespaceName.trim();

    const constraints: validationUtils.RangeConstraints = { lowerLimitIncl: 2, upperLimitIncl: 64 };
    if (!validationUtils.hasValidCharLength(namespaceName, constraints)) {
        return validationUtils.getInvalidCharLengthMessage(constraints);
    }

    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(namespaceName)) {
        return localize(
            'invalidConnectorNamespaceName',
            'A connector namespace name must start with an alphanumeric character and contain only alphanumeric characters, hyphens, or underscores.',
        );
    }

    return undefined;
}
