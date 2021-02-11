module.exports = {
    "env": {
        "es6": true,
        "node": true
    },
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "project": "tsconfig.json",
        "sourceType": "module"
    },
    "plugins": [
        "@typescript-eslint",
        "import"
    ],
    "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking"
    ],
    "rules": {
        "no-unused-vars": "off",
        "no-useless-escape": "off",
        "no-inner-declarations": "off",
        "no-case-declarations": "off",
        "@typescript-eslint/prefer-regexp-exec": "off",
        "@typescript-eslint/no-unused-vars": [
            "error",
            { "argsIgnorePattern": "^_" }
        ],
        "@typescript-eslint/no-inferrable-types": "off",
        "@typescript-eslint/unbound-method": "off",
        "@typescript-eslint/no-unnecessary-type-assertion": "off",
        "@typescript-eslint/restrict-template-expressions": "off",
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/ban-types": "off",
    }
};
