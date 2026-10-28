/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type JSX } from 'react';

interface ConnectorIconProps {
    connector: string;
    label: string;
    size?: number;
}

export function ConnectorIcon({ connector, label, size = 18 }: ConnectorIconProps): JSX.Element {
    const common = {
        width: size,
        height: size,
        viewBox: '0 0 32 32',
        'aria-label': label,
        role: 'img' as const,
        style: { flexShrink: 0, verticalAlign: 'middle' },
    };

    return (
        <svg {...common}>
            <title>{label}</title>
            <rect x="2" y="2" width="28" height="28" rx="5" fill="#6b6b6b" />
            <text
                x="16"
                y="22"
                textAnchor="middle"
                fontFamily="var(--vscode-font-family)"
                fontSize="16"
                fontWeight="700"
                fill="#fff"
            >
                {connector.charAt(0).toUpperCase()}
            </text>
        </svg>
    );
}
