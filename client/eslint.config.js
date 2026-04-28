import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginReact from 'eslint-plugin-react';
import { defineConfig } from 'eslint/config';

export default defineConfig([
	{
		files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		plugins: { js, pluginReact },
		extends: ['js/recommended'],
		languageOptions: { globals: globals.browser },
		rules: {
			'react/react-in-jsx-scope': 'off',
		},
	},
	tseslint.configs.recommended,
	{
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
		},
	},
]);
