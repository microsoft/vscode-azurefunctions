/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { locationDefaultPick, nodeDefaultPick, pythonDefaultPick } from "../constants";

export namespace createFunctionAppUtils {
    export function generateBasicCreateInputs(appName: string, folderName: string, runtime: Runtime, connection: ConnectionType): (string | RegExp)[] {
        return [
            folderName,
            appName,
            locationDefaultPick,
            getRuntimePick(runtime),
            new RegExp(connection, 'i'),
        ];
    }

    export function generateAdvancedCreateInputs(appName: string, folderName: string, runtime: Runtime, connection: ConnectionType, plan: PlanType, os?: OperatingSystem): (string | RegExp)[] {
        switch (plan) {
            case PlanType.FlexConsumption:
                return [
                    folderName,
                    appName,
                    new RegExp(plan, 'i'),
                    locationDefaultPick,
                    getRuntimePick(runtime),
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
                    locationDefaultPick,
                    getRuntimePick(runtime),
                    ...(os ? [new RegExp(os, 'i')] : []),
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
                    locationDefaultPick,
                    getRuntimePick(runtime),
                    ...(os ? [new RegExp(os, 'i')] : []),
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
                    locationDefaultPick,
                    getRuntimePick(runtime),
                    ...(os ? [new RegExp(os, 'i')] : []),
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

    function getRuntimePick(runtime: Runtime): RegExp | string {
        switch (runtime) {
            case Runtime.Python:
                return pythonDefaultPick;
            case Runtime.Node:
                return nodeDefaultPick;
            default:
                throw new Error(`Runtime "${runtime}" not yet supported in "createFunctionAppUtils.generateBasicCreateInputs".`);
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

export enum Runtime {
    Node = 'Node',
    Python = 'Python',
    DotNet = '.NET',
}
