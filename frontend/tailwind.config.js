/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // « presque-noir opérationnel » (alanbouo-pilotage/chaine.md)
        gray: {
          50: '#f5f4f0',
          100: '#ecebe5',
          200: '#dad8d1',
          300: '#c2c1ba',
          400: '#8f9499',
          500: '#6b7279',
          600: '#4a5259',
          700: '#2e363d',
          800: '#1d2329',
          900: '#14181c',
        },
        primary: {
          50: '#fbf6ec',
          100: '#f5ead0',
          200: '#ebd5a3',
          300: '#e0bf7f',
          400: '#d9b26a',
          500: '#d1a55a',
          600: '#c99a4e',
          700: '#a8793f',
          800: '#8a6230',
          900: '#6b4c26',
        },
        blue: {
          50: '#fbf6ec',
          100: '#f5ead0',
          200: '#ebd5a3',
          300: '#e0bf7f',
          400: '#d9b26a',
          500: '#d1a55a',
          600: '#c99a4e',
          700: '#a8793f',
          800: '#8a6230',
          900: '#6b4c26',
        },
        steel: '#5b7a87',
      },
      fontFamily: {
        sans: ['"Libre Franklin"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: '0.375rem',
        xl: '0.5rem',
        '2xl': '0.625rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
