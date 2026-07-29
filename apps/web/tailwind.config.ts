import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', ...defaultTheme.fontFamily.sans],
        display: ['"IBM Plex Sans Condensed"', '"IBM Plex Sans"', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        // JUMPSTART brand (jumpstartsc.org --js-* vars): navy/ink ramp, gold, cream
        navy: {
          DEFAULT: '#0F2346',
          deep: '#07101F',
          ink: '#07121C',
          slate: '#637290',
          light: '#B8C4DA',
        },
        gold: {
          DEFAULT: 'hsl(var(--gold))',
          alt: '#F3C745',
          dark: '#CB9317',
          soft: '#FAE7AF',
          foreground: 'hsl(var(--gold-foreground))',
        },
        cream: '#FEF6E3',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        info: { DEFAULT: 'hsl(var(--info))', foreground: 'hsl(var(--info-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        // Soft ink-tinted elevation for cards and popovers on the warm background
        card: '0 1px 2px 0 rgb(7 18 28 / 0.04), 0 1px 3px 0 rgb(7 18 28 / 0.06)',
        overlay: '0 10px 38px -10px rgb(7 18 28 / 0.35), 0 10px 20px -15px rgb(7 18 28 / 0.2)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
