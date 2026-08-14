import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#ffffff',
        canvas: '#f6f7f9',
        line: '#e3e6ea',
        ink: '#111418',
        muted: '#5c6470',
        accent: '#1f5eff',
      },
      fontSize: {
        xs: ['0.75rem', '1rem'],
        sm: ['0.8125rem', '1.125rem'],
      },
    },
  },
  plugins: [],
} satisfies Config;
