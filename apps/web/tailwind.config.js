/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#090a0f',
          800: '#11131a',
          700: '#1a1d27',
          600: '#262a38',
        },
      },
    },
  },
  plugins: [],
};
