import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        drive: {
          blue: '#1a73e8',
          'blue-hover': '#1557b0',
          'blue-light': '#e8f0fe',
          'blue-text': '#1967d2',
          surface: '#f8f9fa',
          border: '#dadce0',
          muted: '#5f6368',
          hover: '#f1f3f4',
          text: '#202124'
        }
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)',
        'card-hover': '0 1px 2px 0 rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)',
        'new-btn': '0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)',
        'search-focus': '0 2px 5px 1px rgba(64,60,67,.16)',
        dropdown: '0 1px 3px 0 rgba(60,64,67,.3), 0 4px 8px 3px rgba(60,64,67,.15)',
        modal:
          '0 24px 38px 3px rgba(0,0,0,.14), 0 9px 46px 8px rgba(0,0,0,.12), 0 11px 15px -7px rgba(0,0,0,.2)'
      }
    }
  },
  plugins: []
} satisfies Config;
