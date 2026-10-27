/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, type JSX } from 'react';
import { ConnectorIcon } from './ConnectorIcon';
import { type ConnectorTriggerOption } from './ConnectorTriggerPickerViewModel';

interface ConnectorBrandIconProps {
    connector: ConnectorTriggerOption;
    size?: number;
}

export function ConnectorBrandIcon({
    connector,
    size = 18,
}: ConnectorBrandIconProps): JSX.Element {
    const [broken, setBroken] = useState(false);
    if (!connector.iconUrl || broken) {
        return <ConnectorIcon connector={connector.id} label={connector.label} size={size} />;
    }

    return (
        <img
            src={connector.iconUrl}
            alt=""
            width={size}
            height={size}
            onError={() => setBroken(true)}
        />
    );
}
