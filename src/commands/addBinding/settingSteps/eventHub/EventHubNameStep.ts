/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBindingWizardContext } from '../../IBindingWizardContext';
import { StringPromptStep } from '../StringPromptStep';
import { IEventHubWizardContext } from './IEventHubWizardContext';

export class EventHubNameStep extends StringPromptStep {
    public shouldPrompt(context: IEventHubWizardContext & IBindingWizardContext): boolean {
        // If the user decides to create a new app setting, `EventHubListStep` will take care of prompting
        // Otherwise, prompt to manually enter the name of the event hub using this step
        return !context.eventHubsNamespace && !context.eventhubname;
    }
}
