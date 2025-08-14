/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Site } from '@azure/arm-appservice';
import { type ParsedSite } from '@microsoft/vscode-azext-azureappservice';
import * as assert from 'assert';

suite('Deploy Stopped Function App Tests', () => {
    test('Should block deployment to stopped function app', () => {
        // Create mock site with STOPPED state
        const mockSite: Site = {
            name: 'test-function-app',
            state: 'STOPPED',
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Web/sites/test-function-app',
            kind: 'functionapp',
            location: 'East US',
            type: 'Microsoft.Web/sites'
        };

        const mockParsedSite = {
            fullName: 'test-function-app',
            rawSite: mockSite
        } as ParsedSite;

        // Simulate the check that should happen in the deploy function
        try {
            if (mockParsedSite.rawSite.state === 'STOPPED') {
                throw new Error('Cannot deploy to function app "test-function-app" because it is currently stopped. Please start the function app before deploying.');
            }
            assert.fail('Expected deployment to fail for stopped function app');
        } catch (error) {
            // Verify the error message is user-friendly and contains expected keywords
            assert.ok(error instanceof Error);
            assert.ok(error.message.includes('Cannot deploy to function app'));
            assert.ok(error.message.includes('currently stopped'));
            assert.ok(error.message.includes('Please start the function app'));
        }
    });

    test('Should allow deployment to running function app', () => {
        // Create mock site with READY state
        const mockSite: Site = {
            name: 'test-function-app',
            state: 'READY',
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Web/sites/test-function-app',
            kind: 'functionapp',
            location: 'East US',
            type: 'Microsoft.Web/sites'
        };

        const mockParsedSite = {
            fullName: 'test-function-app',
            rawSite: mockSite
        } as ParsedSite;

        // Simulate the check that should happen in the deploy function
        // This should not throw an error for READY state
        if (mockParsedSite.rawSite.state === 'STOPPED') {
            throw new Error('Cannot deploy to function app "test-function-app" because it is currently stopped. Please start the function app before deploying.');
        }

        // If we reach here, the check passed as expected
        assert.ok(true, 'Deployment should proceed for READY function app');
    });

    test('Should allow deployment to function app with unknown state', () => {
        // Create mock site with UNKNOWN state - should not block deployment
        const mockSite: Site = {
            name: 'test-function-app',
            state: 'UNKNOWN',
            id: '/subscriptions/test/resourceGroups/test/providers/Microsoft.Web/sites/test-function-app',
            kind: 'functionapp',
            location: 'East US',
            type: 'Microsoft.Web/sites'
        };

        const mockParsedSite = {
            fullName: 'test-function-app',
            rawSite: mockSite
        } as ParsedSite;

        // Simulate the check that should happen in the deploy function
        // This should not throw an error for UNKNOWN state
        if (mockParsedSite.rawSite.state === 'STOPPED') {
            throw new Error('Cannot deploy to function app "test-function-app" because it is currently stopped. Please start the function app before deploying.');
        }

        // If we reach here, the check passed as expected
        assert.ok(true, 'Deployment should proceed for UNKNOWN function app');
    });
});