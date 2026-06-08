import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          blue: '#3DA1FF',
          deep: '#256199',
          mid: '#2E7CC1',
        },
        ink: {
          DEFAULT: '#232635',
          soft: '#454a5c',
        },
        muted: '#7c8294',
        canvas: {
          DEFAULT: '#cfe1f5',
          2: '#dceaf8',
        },
        surface: '#ffffff',
        line: {
          DEFAULT: '#e7eef7',
          2: '#dbe6f3',
        },
        success: '#27ae8a',
        warning: '#f5a524',
        error: '#ef4655',
        info: '#3DA1FF',
      },
      borderRadius: {
        pill: '999px',
        card: '22px',
        md: '14px',
        sm: '10px',
      },
      boxShadow: {
        sm: '0 4px 14px rgba(37,97,153,.08)',
        md: '0 14px 40px rgba(37,97,153,.12)',
        lg: '0 24px 70px rgba(37,97,153,.16)',
      },
      maxWidth: {
        container: '1120px',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(105deg, #256199 0%, #3DA1FF 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
