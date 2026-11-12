/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type JSX } from 'react';
import { ConnectorBrandIcon } from './ConnectorBrandIcon';
import { type ConnectorTriggerOption } from './ConnectorTriggerPickerViewModel';

export function ConnectorTilePicker({ label, options, value, onChange }: {
    label: string; options: readonly ConnectorTriggerOption[];
    value: string; onChange: (value: string) => void;
}): JSX.Element {
    return (
        <div className="connector-grid" role="radiogroup" aria-label={label}>
            {options.map(option => (
                <button key={option.id} type="button" role="radio" aria-checked={value === option.id}
                    aria-label={option.label}
                    className={`connector-tile${value === option.id ? ' selected' : ''}`}
                    onClick={() => onChange(option.id)}>
                    <span className="connector-tile-icon" aria-hidden="true"><ConnectorBrandIcon connector={option} /></span>
                    <span className="connector-tile-label">{option.label}</span>
                </button>
            ))}
        </div>
    );
}
