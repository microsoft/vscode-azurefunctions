/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IResources {
    en: { [key: string]: string };
}

export class Resources {
    private _resources: IResources;
    constructor(data: object) {
        this._resources = <IResources>data;
    }

    public getValue(data: string): string {
        const matches: RegExpMatchArray | null = data.match(/\$(.*)/);

        return matches !== null ? this._resources.en[matches[1]] : data;
    }
}
