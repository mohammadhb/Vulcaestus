import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5dae3',
          300: '#b0bacb',
          400: '#7f8ea8',
          500: '#5b6b87',
          600: '#44536d',
          700: '#364257',
          800: '#242d3d',
          900: '#151b26',
          950: '#0b0f16',
        },
        accent: {
          50: '#eefbf5',
          100: '#d6f5e6',
          200: '#b0e9d2',
          300: '#7bd7b7',
          400: '#43bd97',
          500: '#21a27f',
          600: '#148268',
          700: '#116755',
          800: '#105246',
          900: '#0e443b',
        },
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Inter',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 15, 22, 0.04), 0 8px 24px -12px rgba(11, 15, 22, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
