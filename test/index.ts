/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as glob from 'glob';
import * as Mocha from 'mocha';
import * as path from 'path';

// tslint:disable-next-line: export-name
export async function run(): Promise<void> {
    const options: Mocha.MochaOptions = {
        ui: 'tdd',
        color: true,
        reporter: 'mocha-multi-reporters',
        reporterOptions: {
            reporterEnabled: 'spec, mocha-junit-reporter',
            mochaJunitReporterReporterOptions: {
                mochaFile: path.resolve(__dirname, '..', '..', 'test-results.xml')
            }
        }
    };

    addEnvVarsToMochaOptions(options);
    console.log(`Mocha options: ${JSON.stringify(options, undefined, 2)}`);

    const mocha = new Mocha(options);

    const files: string[] = await new Promise((resolve, reject) => {
        glob('**/**.test.js', { cwd: __dirname }, (err, result) => {
            err ? reject(err) : resolve(result);
        });
    });

    files.forEach(f => mocha.addFile(path.resolve(__dirname, f)));

    const failures = await new Promise<number>(resolve => mocha.run(resolve));
    if (failures > 0) {
        throw new Error(`${failures} tests failed.`);
    }
}

function addEnvVarsToMochaOptions(options: Mocha.MochaOptions): void {
    for (const envVar of Object.keys(process.env)) {
        const match: RegExpMatchArray | null = envVar.match(/^mocha_(.+)/i);
        if (match) {
            const [, option] = match;
            // tslint:disable-next-line:strict-boolean-expressions
            let value: string | number = process.env[envVar] || '';
            if (typeof value === 'string' && !isNaN(parseInt(value))) {
                value = parseInt(value);
            }
            // tslint:disable-next-line: no-any
            (<any>options)[option] = value;
        }
    }
}
