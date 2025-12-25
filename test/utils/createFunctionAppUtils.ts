/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace createFunctionAppUtils {
    export function generateBasicCreateInputs(appName: string, folderName: string, connection: ConnectionType): (string | RegExp)[] {
        return [
            folderName,
            appName,
            /West US 2/i,
            /Node\.js 22/i,
            new RegExp(connection, 'i'),
        ];
    }

    export function generateAdvancedCreateInputs(appName: string, folderName: string, connection: ConnectionType, os: OperatingSystem, plan: PlanType): (string | RegExp)[] {
        switch (plan) {
            case PlanType.FlexConsumption:
                return [
                    folderName,
                    appName,
                    new RegExp(plan, 'i'),
                    /West US 2/i,
                    /Node\.js 22/i,
                    '2048',
                    '100',
                    /Create new resource group/i,
                    appName,
                    ...getConnectionTypeInputs(connection),
                    /Create new storage account/i,
                    appName,
                    /Create new application insights/i,
                    appName,
                ];
            case PlanType.Premium:
                return [
                    folderName,
                    appName,
                    new RegExp(plan, 'i'),
                    /West US 2/i,
                    /Node\.js 22/i,
                    new RegExp(os, 'i'),
                    /Create new app service plan/i,
                    appName,
                    /EP1/i,
                    /Create new resource group/i,
                    appName,
                    ...getConnectionTypeInputs(connection),
                    /Create new storage account/i,
                    appName,
                    /Create new application insights/i,
                    appName,
                ];
            case PlanType.LegacyConsumption:
                return [
                    folderName,
                    appName,
                    new RegExp(plan, 'i'),
                    /West US 2/i,
                    /Node\.js 22/i,
                    new RegExp(os, 'i'),
                    /Create new resource group/i,
                    appName,
                    ...getConnectionTypeInputs(connection),
                    /Create new storage account/i,
                    appName,
                    /Create new application insights/i,
                    appName,
                ];
            case PlanType.AppService:
                return [
                    folderName,
                    appName,
                    new RegExp(plan, 'i'),
                    /West US 2/i,
                    /Node\.js 22/i,
                    new RegExp(os, 'i'),
                    /Create new app service plan/i,
                    appName,
                    /S1/i,
                    /Create new resource group/i,
                    appName,
                    ...getConnectionTypeInputs(connection),
                    /Create new storage account/i,
                    appName,
                    /Create new application insights/i,
                    appName,
                ];
        }
    }

    function getConnectionTypeInputs(connection: ConnectionType): (string | RegExp)[] {
        return connection === ConnectionType.ManagedIdentity ?
            [new RegExp(connection, 'i'), /Create new user[- ]assigned identity/i] :
            [new RegExp(connection, 'i')];
    }
}

export enum ConnectionType {
    Secrets = 'Secrets',
    ManagedIdentity = 'Managed Identity',
}

export enum OperatingSystem {
    Linux = 'Linux',
    Windows = 'Windows',
}

export enum PlanType {
    FlexConsumption = 'Flex Consumption',
    Premium = 'Premium',
    LegacyConsumption = 'Legacy',
    AppService = 'App Service Plan',
}

export enum CreateMode {
    Basic = 'Basic',
    Advanced = 'Advanced',
}
