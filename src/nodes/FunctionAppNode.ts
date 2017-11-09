/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Site } from 'azure-arm-website/lib/models';
import { SiteWrapper } from 'vscode-azureappservice';
import * as errors from '../errors';
import { NodeBase } from './NodeBase';
import { SubscriptionNode } from './SubscriptionNode';

export class FunctionAppNode extends NodeBase {
    public static readonly contextValue: string = 'azureFunctionsFunctionApp';
    public readonly name: string;
    public readonly parent: SubscriptionNode;
    public readonly siteWrapper: SiteWrapper;

    private constructor(parent: NodeBase, id: string, name: string, state: string, site: Site) {
        super(parent, id, state === 'Running' ? name : `${name} (${state})`, FunctionAppNode.contextValue);
        this.name = name;
        this.siteWrapper = new SiteWrapper(site);
    }

    public static CREATE(parent: NodeBase, functionApp: Site): FunctionAppNode {
        if (!functionApp.id || !functionApp.name || !functionApp.state) {
            throw new errors.ArgumentError(functionApp);
        }

        return new FunctionAppNode(parent, functionApp.id, functionApp.name, functionApp.state, functionApp);
    }
}
