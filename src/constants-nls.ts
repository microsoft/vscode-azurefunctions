import { localize } from "./localize";

export const viewOutput: string = localize('viewOutput', 'View Output');
export const defaultDescription: string = localize('default', '(Default)');
export const previewDescription: string = localize('preview', '(Preview)');
export const pythonNewModelPreview: string = localize('pythonNewModelPreview', 'Python (Programming Model V2)');
export const useEmulator: string = localize('useEmulator', 'Use Local Emulator');
export const skipForNow: string = localize('skipForNow', 'Skip For Now');
export const overwriteRemoteConnection = (a: string): string => localize('overwriteRemoteConnection', 'We detected a different local connection setting for "{0}" than what was previously used. Would you like to overwrite your remote setting?', a);

export const invalidAlphanumericWithHyphens: string = localize('invalidAlphanumericOrHyphen', `A name must consist of alphanumeric characters or '-', and must start and end with an alphanumeric character.`);
export const invalidLowerCaseAlphanumericWithHyphens: string = localize('invalidLowerAlphanumericOrHyphen', `A name must consist of lower-case alphanumeric characters or '-', and must start and end with a lower-case alphanumeric character.`);

export const getInvalidLengthMessage = (lowerLimitIncl?: number, upperLimitIncl?: number): string => {
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
