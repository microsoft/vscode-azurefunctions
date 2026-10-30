/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type JSX } from 'react';
import { type ConnectorTriggerOption } from './ConnectorTriggerPickerViewModel';
import { ConnectorBrandIcon } from './ConnectorBrandIcon';

interface ConnectorTilePickerProps {
    label: string;
    options: readonly ConnectorTriggerOption[];
    unavailableLabel: string;
    value: string;
    onChange: (value: string) => void;
}

export function ConnectorTilePicker({
    label,
    options,
    unavailableLabel,
    value,
    onChange,
}: ConnectorTilePickerProps): JSX.Element {
    return (
        <div className="connector-grid" role="radiogroup" aria-label={label}>
            {options.map(option => {
                const selected = value === option.id;
                const unavailable = option.availability === 'unavailable';
                return (
                    <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={unavailable ? `${option.label}. ${unavailableLabel}` : option.label}
                        className={`connector-tile${selected ? ' selected' : ''}${unavailable ? ' unavailable' : ''}`}
                        disabled={unavailable}
                        onClick={() => onChange(option.id)}
                    >
                        <span className="connector-tile-icon" aria-hidden="true">
                            <ConnectorBrandIcon connector={option} />
                        </span>
                        <span className="connector-tile-label">
                            {option.label}
                            {unavailable && <small>{unavailableLabel}</small>}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
