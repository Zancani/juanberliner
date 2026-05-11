/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './tours/*.html',
    './blog/*.html',
    './berlin-map.html',
  ],
  theme: {
    extend: {
      colors: {
        gold: '#B8860B',
        'gold-light': '#E9D8A6',
        'gold-dark': '#8B6508',
        'berlin-dark': '#001219',
        'berlin-surface': '#012A36',
        'berlin-elevated': '#013747',
        'berlin-border': '#003D52',
        'berlin-muted': '#7FB5BF',
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
