/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          900: '#14532d',
        },
        cyber: {
          bg: '#030712',
          card: '#070b14',
          border: '#1e293b',
          emerald: '#10b981',
          cyan: '#06b6d4',
          rose: '#f43f5e',
          amber: '#f59e0b',
        },
      },
      boxShadow: {
        'glow-emerald': '0 0 15px rgba(16, 185, 129, 0.3)',
        'glow-emerald-lg': '0 0 25px rgba(16, 185, 129, 0.5)',
        'glow-cyan': '0 0 15px rgba(6, 182, 212, 0.3)',
        'glow-rose': '0 0 15px rgba(244, 63, 94, 0.3)',
        'glow-amber': '0 0 15px rgba(245, 158, 11, 0.3)',
      },
    },
  },
  plugins: [],
};
