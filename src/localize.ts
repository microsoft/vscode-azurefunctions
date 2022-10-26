/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';

export const localize: nls.LocalizeFunc = nls.loadMessageBundle();

export const local: string = localize('local', 'Local');
export const remote: string = localize('remote', 'Remote');
export const viewOutput: string = localize('viewOutput', 'View Output');
export const previewDescription: string = localize('preview', '(Preview)');
export const pythonNewModelPreview: string = localize('pythonNewModelPreview', 'Python (Programming Model V2)');
export const hostJsonConfigFailed: string = localize('durableStorageConfigFailed', 'WARNING: Failed to configure your JSON files for durable storage, you may need to configure them manually or start from a clean project.');
export const emptyWorkspace: string = localize('emptyWorkspace', 'Your workspace folder looks empty, please navigate to the root directory of your project.');
export const useEmulator: string = localize('useEmulator', 'Use Local Emulator');
export const skipForNow: string = localize('skipForNow', 'Skip For Now');
export const recommended: string = localize('recommended', '(Recommended)');
export const invalidAlphanumericWithHyphens: string = localize('invalidAlphanumericOrHyphen', `A name must consist of alphanumeric characters or '-', and must start and end with an alphanumeric character.`);
export const invalidLowerCaseAlphanumericWithHyphens: string = localize('invalidLowerAlphanumericOrHyphen', `A name must consist of lower-case alphanumeric characters or '-', and must start and end with a lower-case alphanumeric character.`);
export const overwriteRemoteConnection = (a: string) => localize('overwriteRemoteConnection', 'We detected a different local connection setting for "{0}" than what was previously used. Would you like to overwrite your remote setting?', a);

export const invalidLength = (lowerLimitIncl?: string, upperLimitIncl?: string) => {
    if (!lowerLimitIncl && !upperLimitIncl) {
        return localize('invalidInputLength', 'A value is required to proceed.');
    } else if (lowerLimitIncl && !upperLimitIncl) {
        return localize('inputLengthTooShort', 'The value must be {0} or greater.', lowerLimitIncl);
    } else if (!lowerLimitIncl && upperLimitIncl) {
        return localize('inputLengthTooLong', 'The value must be {0} or less.', upperLimitIncl);
    } else {
        return localize('invalidBetweenInputLength', 'The value must be between {0} and {1} characters long.', lowerLimitIncl, upperLimitIncl);
    }
}
