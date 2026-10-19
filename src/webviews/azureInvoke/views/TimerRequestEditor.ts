/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type CollectionReviewConfiguration } from '../shared/collectionReview';
import { type TimerInvocationRequest } from '../shared/timerInvocation';

export class TimerRequestEditor {
    public readonly element = document.createElement('fieldset');
    private readonly hostUrl = document.createElement('input');
    private readonly functionName = document.createElement('input');
    private readonly schedule = document.createElement('input');

    public constructor(request: TimerInvocationRequest, labels: CollectionReviewConfiguration['labels']['timer'], changed: () => void) {
        this.element.className = 'timer-request-editor';
        for (const [key, input] of [
            ['hostUrl', this.hostUrl], ['functionName', this.functionName], ['schedule', this.schedule],
        ] as const) {
            const label = document.createElement('label');
            label.className = 'request-field';
            const caption = document.createElement('span');
            caption.textContent = labels[key];
            input.className = `timer-${key}`;
            input.type = key === 'hostUrl' ? 'url' : 'text';
            input.readOnly = key === 'schedule';
            input.addEventListener('input', changed);
            label.append(caption, input);
            this.element.append(label);
        }
        this.setRequest(request);
    }

    public get request(): TimerInvocationRequest {
        return { hostUrl: this.hostUrl.value, functionName: this.functionName.value, schedule: this.schedule.value };
    }

    public setRequest(request: TimerInvocationRequest): void {
        this.hostUrl.value = request.hostUrl;
        this.functionName.value = request.functionName;
        this.schedule.value = request.schedule;
    }

    public setEnabled(enabled: boolean): void {
        this.element.disabled = !enabled;
    }
}
