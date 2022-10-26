/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace validateUtils {
    export function isValidLength(value: string, lower?: number, upper?: number): boolean {
        const thirtyTwoBitMaxSafeInteger = 2147483647;

        lower ??= 1;
        upper = (!upper || upper > thirtyTwoBitMaxSafeInteger) ? thirtyTwoBitMaxSafeInteger : upper;

        if (lower > upper || value.length < lower || value.length > upper) {
            return false;
        } else {
            return true;
        }
    }

    export function isAlphanumericWithHypens(value: string): boolean {
        const regExp = /^[a-zA-z0-9]([-a-zA-z0-9]*[a-zA-z0-9])?$/;
        if (regExp.test(value)) {
            return true;
        } else {
            return false;
        }
    }

    export function isLowerCaseAlphanumericWithHypens(value: string): boolean {
        const regExp = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
        if (regExp.test(value)) {
            return true;
        } else {
            return false;
        }
    }

    export function meetsBasePasswordStrength(password: string): boolean {
        const lowerCaseAlpha = /[a-z]/;
        const upperCaseAlpha = /[A-Z]/;
        const numeric = /[0-9]/;
        const symbols = /#?!@$%^&*-/;
        let strengthCoefficient: number = 0;

        // Must include at least 3 of the 4 character groups
        [lowerCaseAlpha, upperCaseAlpha, numeric, symbols].forEach(condition => {
            if (condition.test(password)) {
                strengthCoefficient++;
            }
        });

        return strengthCoefficient >= 3;
    }

    /*
        Per the Azure Portal... your password cannot contain all or part of the login name.
        Part of a login name is defined as some number of consecutive alphanumeric characters.
    */
    export function passwordOverlapsLogin(password: string, login: string, consecutiveChars: number = 3): boolean {
        const consecutiveCharSet = new Set<string>();

        // Iterate over login and build consecutive char set
        for (let i = 0; i < login.length; i++) {
            if (i + consecutiveChars > login.length) {
                break;
            }
            consecutiveCharSet.add(login.slice(i, i + consecutiveChars - 1));
        }

        // Iterate over password and check for overlap
        for (let i = 0; i < password.length; i++) {
            if (i + consecutiveChars > password.length) {
                break;
            }
            if (consecutiveCharSet.has(password.slice(i, i + consecutiveChars - 1))) {
                return true;
            }
        }

        return false;
    }
}
