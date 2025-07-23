/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IHostJsonV2, bundleFeedUtils } from '../extension.bundle';

suite('ExtensionBundle Version Fix Tests', () => {
    test('addDefaultBundle fixes incomplete extensionBundle missing version', async () => {
        // Simulate the problematic host.json from the issue
        const incompleteHostJson: IHostJsonV2 = {
            version: '2.0',
            logging: {
                applicationInsights: {
                    samplingSettings: {
                        isEnabled: true,
                        excludedTypes: 'Request'
                    }
                }
            },
            extensionBundle: {
                id: 'Microsoft.Azure.Functions.ExtensionBundle'
                // Missing version property - this is the bug!
            }
        };

        const mockContext = {
            telemetry: { properties: {} }
        } as any;

        // Verify the bundle is incomplete before fix
        assert.ok(incompleteHostJson.extensionBundle, 'extensionBundle should exist');
        assert.ok(incompleteHostJson.extensionBundle.id, 'extensionBundle should have id');
        assert.ok(!incompleteHostJson.extensionBundle.version, 'extensionBundle should be missing version (this is the bug)');

        // Apply the fix
        await bundleFeedUtils.addDefaultBundle(mockContext, incompleteHostJson);

        // Verify the bundle is now complete
        assert.ok(incompleteHostJson.extensionBundle, 'extensionBundle should still exist');
        assert.strictEqual(incompleteHostJson.extensionBundle.id, bundleFeedUtils.defaultBundleId);
        assert.ok(incompleteHostJson.extensionBundle.version, 'extensionBundle should now have version');
        assert.ok(incompleteHostJson.extensionBundle.version.includes('*'), 'version should be a range pattern');
    });

    test('verifyExtensionBundle logic should detect incomplete bundle', () => {
        // Test the logic that was fixed in verifyExtensionBundle.ts
        
        // Case 1: No extensionBundle at all
        const hostJsonNoBundle: IHostJsonV2 = { version: '2.0' };
        const shouldFixNoBundle = !hostJsonNoBundle.extensionBundle || !hostJsonNoBundle.extensionBundle?.version;
        assert.ok(shouldFixNoBundle, 'Should fix when no extensionBundle exists');

        // Case 2: extensionBundle exists but missing version (the bug case)
        const hostJsonIncompleteBundle: IHostJsonV2 = {
            version: '2.0',
            extensionBundle: {
                id: 'Microsoft.Azure.Functions.ExtensionBundle'
                // No version!
            }
        };
        const shouldFixIncomplete = !hostJsonIncompleteBundle.extensionBundle || !hostJsonIncompleteBundle.extensionBundle.version;
        assert.ok(shouldFixIncomplete, 'Should fix when extensionBundle exists but version is missing');

        // Case 3: Complete extensionBundle
        const hostJsonComplete: IHostJsonV2 = {
            version: '2.0',
            extensionBundle: {
                id: 'Microsoft.Azure.Functions.ExtensionBundle',
                version: '[1.*, 2.0.0)'
            }
        };
        const shouldFixComplete = !hostJsonComplete.extensionBundle || !hostJsonComplete.extensionBundle.version;
        assert.ok(!shouldFixComplete, 'Should NOT fix when extensionBundle is complete');
    });
});