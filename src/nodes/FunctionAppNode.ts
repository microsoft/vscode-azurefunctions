/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Site } from '../../node_modules/azure-arm-website/lib/models';
import * as errors from '../errors';
import * as util from '../util';
import { NodeBase } from './NodeBase';
import { SubscriptionNode } from './SubscriptionNode';

export class FunctionAppNode extends NodeBase {
    public static readonly contextValue: string = 'azureFunctionsFunctionApp';
    public readonly name: string;
    public readonly resourceGroup: string;
    public readonly parent: SubscriptionNode;

    private constructor(id: string, name: string, state: string, resourceGroup: string) {
        super(id, state === util.FunctionAppState.Running ? name : `${name} (${state})`, FunctionAppNode.contextValue);
        this.resourceGroup = resourceGroup;
        this.name = name;
    }

    public static CREATE(functionApp: Site): FunctionAppNode {
        if (!functionApp.id || !functionApp.name || !functionApp.state || !functionApp.resourceGroup) {
            throw new errors.ArgumentError(functionApp);
        }

        return new FunctionAppNode(functionApp.id, functionApp.name, functionApp.state, functionApp.resourceGroup);
    }
}
