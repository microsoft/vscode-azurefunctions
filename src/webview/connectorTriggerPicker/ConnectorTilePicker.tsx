/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type JSX } from 'react';
import { ConnectorBrandIcon } from './ConnectorBrandIcon';
import { type ConnectorTriggerOption } from './ConnectorTriggerPickerViewModel';

export function ConnectorTilePicker({ label, options, unavailableLabel, value, onChange }: {
    label: string; options: readonly ConnectorTriggerOption[]; unavailableLabel: string;
    value: string; onChange: (value: string) => void;
}): JSX.Element {
    return (
        <div className="connector-grid" role="radiogroup" aria-label={label}>
            {options.map(option => {
                const unavailable = option.availability === 'unavailable';
                return (
                    <button key={option.id} type="button" role="radio" aria-checked={value === option.id}
                        aria-label={unavailable ? `${option.label}. ${unavailableLabel}` : option.label}
                        className={`connector-tile${value === option.id ? ' selected' : ''}${unavailable ? ' unavailable' : ''}`}
                        disabled={unavailable} onClick={() => onChange(option.id)}>
                        <span className="connector-tile-icon" aria-hidden="true"><ConnectorBrandIcon connector={option} /></span>
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
