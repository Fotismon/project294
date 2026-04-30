/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0f',
        surface: '#12121a',
        'surface-elevated': '#1a1a24',
        border: '#2a2a3a',
        'text-primary': '#e8e8ed',
        'text-secondary': '#9898a8',
        'text-muted': '#686878',
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6',
        charge: '#3b82f6',
        discharge: '#f59e0b',
      },
    },
  },
  plugins: [],
}
