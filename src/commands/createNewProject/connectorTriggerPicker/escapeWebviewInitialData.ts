/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const initialDataPrefix = `_initialData: '`;
const initialDataSuffix = `'\n`;

/**
 * encodeURIComponent leaves apostrophes unescaped, but the shared webview
 * template embeds its encoded initial data in a single-quoted JavaScript value.
 */
export function escapeWebviewInitialData(template: string): string {
    const prefixIndex = template.indexOf(initialDataPrefix);
    if (prefixIndex < 0) {
        return template;
    }

    const valueStart = prefixIndex + initialDataPrefix.length;
    const valueEnd = template.indexOf(initialDataSuffix, valueStart);
    if (valueEnd < 0) {
        throw new Error('Unable to locate the end of the webview initial data.');
    }

    const escapedValue = template.slice(valueStart, valueEnd).replace(/'/g, '%27');
    return template.slice(0, valueStart) + escapedValue + template.slice(valueEnd);
}

export function allowWebviewImageSources(template: string, sources: readonly string[]): string {
    if (sources.length === 0) {
        return template;
    }

    return template.replace(/img-src ([^;]+);/, (_match, existingSources: string) => {
        const missingSources = sources.filter(source => !existingSources.includes(source));
        return `img-src ${existingSources}${missingSources.length ? ` ${missingSources.join(' ')}` : ''};`;
    });
}
