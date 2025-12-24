/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getRandomAlphanumericString } from "../../../../../extension.bundle";
import { type AzExtFunctionsTestScenario, type CreateAndDeployTestCase } from "../AzExtFunctionsTestScenario";

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

export function generateTSNodeScenario(): AzExtFunctionsTestScenario {
    const appName: string = getRandomAlphanumericString();
    const folderName: string = 'scenarios-dts-tsnode';

    return {
        label: folderName,
        folderName,
        createNewProjectTest: {
            label: '',
            inputs: [
                /TypeScript/i,
                /v4/i,
                /Durable Functions Orchestrator/i,
                /Durable Task Scheduler/i,
                'durableHello1',
            ],
            resourceGroupToDelete: appName,
        },
        createAndDeployTests: [
            /** 1. */ generateCreateAndDeployTest(appName, folderName, ConnectionType.ManagedIdentity, OperatingSystem.Linux, PlanType.FlexConsumption),
            /** 2. */ generateCreateAndDeployTest(appName, folderName, ConnectionType.ManagedIdentity, OperatingSystem.Windows, PlanType.FlexConsumption),
            /** 3. */ generateCreateAndDeployTest(appName, folderName, ConnectionType.ManagedIdentity, OperatingSystem.Linux, PlanType.Premium),
            /** 4. */ generateCreateAndDeployTest(appName, folderName, ConnectionType.ManagedIdentity, OperatingSystem.Windows, PlanType.Premium),
            /** 5. */ generateCreateAndDeployTest(appName, folderName, ConnectionType.Secrets, OperatingSystem.Linux, PlanType.FlexConsumption),
            /** 6. */ generateCreateAndDeployTest(appName, folderName, ConnectionType.Secrets, OperatingSystem.Windows, PlanType.FlexConsumption),
            /** 7. */ generateCreateAndDeployTest(appName, folderName, ConnectionType.Secrets, OperatingSystem.Linux, PlanType.Premium),
            /** 8. */ generateCreateAndDeployTest(appName, folderName, ConnectionType.Secrets, OperatingSystem.Windows, PlanType.Premium),
        ],
    }
}

function generateCreateAndDeployTest(appName: string, folderName: string, connection: ConnectionType, os: OperatingSystem, plan: PlanType): CreateAndDeployTestCase {
    return {
        createFunctionApp: {
            label: 'Create Function App',
            inputs: plan === PlanType.FlexConsumption ?
                generateCreateFunctionAppBasicInputs(appName, folderName, connection) :
                generateCreateFunctionAppAdvancedInputs(appName, folderName, connection, os, plan),
        },
        deployFunctionApp: {
            label: 'Deploy Function App',
            inputs: [
                // Todo: Expand regexp capability for context.ui.showWarningMessage
                'Connect Durable Task Scheduler',
                /Create New Durable Task Scheduler/i,
                appName,
                /Create New Durable Task Hub/i,
                appName,
                /Assign New User[- ]Assigned Identity/i,
                /Create New User[- ]Assigned Identity/i,
                // Todo: Here too
                'Deploy',
            ],
        },
        resourceGroupToDelete: appName,
    };
}

function generateCreateFunctionAppBasicInputs(appName: string, folderName: string, connection: ConnectionType): (string | RegExp)[] {
    return [
        folderName,
        appName,
        /West US 2/i,
        /Node\.js 22/i,
        new RegExp(connection, 'i'),
    ];
}

function generateCreateFunctionAppAdvancedInputs(appName: string, folderName: string, connection: ConnectionType, os: OperatingSystem, plan: PlanType): (string | RegExp)[] {
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
    return connection === ConnectionType.ManagedIdentity ? [new RegExp(connection, 'i'), /Create new user[- ]assigned identity/i] : [new RegExp(connection, 'i')];
}
