// Other configurations exist
import { azExtEslintRecommended } from '@microsoft/vscode-azext-eng/eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    azExtEslintRecommended,
    {
        rules: {
            '@typescript-eslint/no-namespace': 'off'
        }
    }
]);

