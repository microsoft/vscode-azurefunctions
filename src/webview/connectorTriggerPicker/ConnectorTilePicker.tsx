/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button } from '@fluentui/react-components';
import { type JSX } from 'react';
import { type ConnectorTriggerOption } from './ConnectorTriggerPickerViewModel';
import { ConnectorIcon } from './ConnectorIcon';

interface ConnectorTilePickerProps {
    label: string;
    options: readonly ConnectorTriggerOption[];
    value: string;
    onChange: (value: string) => void;
}

/**
 * Connector Namespace tile picker adapted for the Functions connector-trigger flow.
 */
export function ConnectorTilePicker({
    label,
    options,
    value,
    onChange,
}: ConnectorTilePickerProps): JSX.Element {
    return (
        <div className="connector-grid" role="radiogroup" aria-label={label}>
            {options.map(option => {
                const selected = value === option.id;
                return (
                    <Button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        appearance="subtle"
                        className={`connector-tile${selected ? ' selected' : ''}`}
                        onClick={() => onChange(option.id)}
                    >
                        <span className="connector-tile-icon" aria-hidden="true">
                            <ConnectorIcon connector={option.id} label={option.label} />
                        </span>
                        <span className="connector-tile-label">{option.label}</span>
                    </Button>
                );
            })}
        </div>
    );
}
