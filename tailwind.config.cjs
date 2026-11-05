/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // ReadyRoom design tokens (src/styles/tokens.css)
      colors: {
        bg: 'var(--rr-bg)',
        panel: 'var(--rr-panel)',
        panel2: 'var(--rr-panel2)',
        panel3: 'var(--rr-panel3)',
        border: 'var(--rr-border)',
        border2: 'var(--rr-border2)',
        text: 'var(--rr-text)',
        text2: 'var(--rr-text2)',
        text3: 'var(--rr-text3)',
        good: 'var(--rr-good)',
        warn: 'var(--rr-warn)',
        bad: 'var(--rr-bad)',
        info: 'var(--rr-info)',
        accent: 'var(--rr-accent)',
        'accent-weak': 'var(--rr-accent-weak)',
        track: 'var(--rr-track)',
      },
      backgroundColor: {
        'background': 'hsl(var(--background))',
      },
      textColor: {
        'foreground': 'hsl(var(--foreground))',
      },
      fontFamily: {
        ui: ['Saira', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'rr-sm': '4px',
        'rr-md': '6px',
        'rr-ctl': '7px',
        'rr-lg': '8px',
        'rr-xl': '10px',
        'rr-2xl': '12px',
      },
      boxShadow: {
        rr: 'var(--rr-shadow)',
        'rr-lg': 'var(--rr-shadow-lg)',
      },
      transitionTimingFunction: {
        pop: 'cubic-bezier(.34,1.4,.5,1)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
