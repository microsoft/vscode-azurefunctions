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
    const key = connector.toLowerCase();
    const common = {
        width: size,
        height: size,
        viewBox: '0 0 32 32',
        'aria-label': label,
        role: 'img' as const,
        style: { flexShrink: 0, verticalAlign: 'middle' },
    };

    if (key === 'teams' || key.includes('teams')) {
        return (
            <svg {...common}>
                <title>{label}</title>
                <rect x="2" y="2" width="28" height="28" rx="5" fill="#5059C9" />
                <rect x="8" y="9" width="16" height="3.2" rx="1" fill="#fff" />
                <rect x="14.4" y="9" width="3.2" height="14.5" rx="1" fill="#fff" />
            </svg>
        );
    }

    if (key === 'office365' || key.includes('office') || key.includes('outlook')) {
        return (
            <svg {...common}>
                <title>{label}</title>
                <rect x="2" y="2" width="28" height="28" rx="5" fill="#0078D4" />
                <rect x="7" y="10" width="12" height="12" rx="1.5" fill="#fff" />
                <path
                    d="M7.5 10.5 L13 17 L18.5 10.5"
                    stroke="#0078D4"
                    strokeWidth="1.6"
                    fill="none"
                    strokeLinejoin="round"
                />
                <rect x="20" y="12" width="5" height="8" rx="1" fill="#fff" opacity="0.85" />
            </svg>
        );
    }

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
