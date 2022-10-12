/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IFunctionJson {
    disabled?: boolean;
    scriptFile?: string;
    bindings?: IFunctionBinding[];
}

export interface IFunctionBinding {
    type?: string;
    name?: string;
    route?: string;
    direction?: string;
    authLevel?: string;
    [propertyName: string]: BindingSettingValue;
}

export type BindingSettingValue = string | boolean | number | undefined;

export enum HttpAuthLevel {
    admin = 'admin',
    function = 'function',
    anonymous = 'anonymous'
}

/**
 * Basic config for a function, stored in the 'function.json' file at the root of the function's folder
 * Since the user can manually edit their 'function.json' file, we can't assume it will have the proper schema
 */
export class ParsedFunctionJson {
    public readonly data: IFunctionJson;

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
    public constructor(data: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (typeof data === 'object' && data !== null && (data.bindings === undefined || data.bindings instanceof Array)) {

            this.data = <IFunctionJson>data;
        } else {
            this.data = {};
        }
    }

    public get bindings(): IFunctionBinding[] {
        return this.data.bindings || [];
    }

    public get disabled(): boolean {
        return this.data.disabled === true;
    }

    /**
     * A trigger defines how a function is invoked and a function must have exactly one trigger.
     * https://docs.microsoft.com/azure/azure-functions/functions-triggers-bindings
     */
    public get triggerBinding(): IFunctionBinding | undefined {
        return this.bindings.find(b => /trigger$/i.test(b.type || ''));
    }

    public get isHttpTrigger(): boolean {
        return !!this.triggerBinding && !!this.triggerBinding.type && /^http/i.test(this.triggerBinding.type);
    }

    public get isTimerTrigger(): boolean {
        return !!this.triggerBinding && !!this.triggerBinding.type && /^timer/i.test(this.triggerBinding.type);
    }

    public get authLevel(): HttpAuthLevel | undefined {
        if (this.triggerBinding && this.triggerBinding.authLevel) {
            return <HttpAuthLevel | undefined>HttpAuthLevel[this.triggerBinding.authLevel.toLowerCase()];
        } else {
            return undefined;
        }
    }
}
