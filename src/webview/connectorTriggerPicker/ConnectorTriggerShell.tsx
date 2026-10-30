/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type JSX } from 'react';
import { type ConnectorTriggerPickerViewModel } from './ConnectorTriggerPickerViewModel';

export type ConnectorTriggerStep = 1 | 2;

interface ConnectorTriggerShellProps {
    activeStep: ConnectorTriggerStep;
    canOpenEvent: boolean;
    labels: ConnectorTriggerPickerViewModel['labels'];
    onBrowseTemplates: () => void;
    onOpenCopilot: () => void;
    onStepChange: (step: ConnectorTriggerStep) => void;
}

export function ConnectorTriggerShell({
    activeStep,
    canOpenEvent,
    labels,
    onBrowseTemplates,
    onOpenCopilot,
    onStepChange,
}: ConnectorTriggerShellProps): JSX.Element {
    return (
        <>
            <header className="gallery-header">
                <h1>{labels.galleryTitle}</h1>
                <p>{labels.gallerySubtitle}</p>
                <nav className="gallery-tabs" aria-label={labels.galleryTitle}>
                    <button type="button" onClick={onBrowseTemplates}>
                        <span className="codicon codicon-extensions" aria-hidden="true" />
                        {labels.browseTemplates}
                    </button>
                    <button type="button" className="active" aria-current="page">
                        <span className="codicon codicon-debug-disconnect" aria-hidden="true" />
                        {labels.connectorTriggers}
                    </button>
                    <button type="button" onClick={onOpenCopilot}>
                        <span className="codicon codicon-sparkle" aria-hidden="true" />
                        {labels.buildWithCopilotChat}
                    </button>
                </nav>
            </header>

            <nav className="step-navigation" aria-label={labels.connectorTriggers}>
                <StepButton
                    number={1}
                    label={labels.connectorStep}
                    active={activeStep === 1}
                    complete={activeStep > 1}
                    enabled
                    onClick={() => onStepChange(1)}
                />
                <StepButton
                    number={2}
                    label={labels.eventStep}
                    active={activeStep === 2}
                    complete={false}
                    enabled={canOpenEvent}
                    onClick={() => onStepChange(2)}
                />
            </nav>
        </>
    );
}

function StepButton({
    number,
    label,
    active,
    complete,
    enabled,
    onClick,
}: {
    number: number;
    label: string;
    active: boolean;
    complete: boolean;
    enabled: boolean;
    onClick: () => void;
}): JSX.Element {
    return (
        <button
            type="button"
            className={`step-button${active ? ' active' : ''}${complete ? ' complete' : ''}`}
            disabled={!enabled}
            aria-current={active ? 'step' : undefined}
            onClick={onClick}
        >
            <span className="step-number" aria-hidden="true">
                {complete ? <span className="codicon codicon-check" /> : number}
            </span>
            <span>{label}</span>
        </button>
    );
}
