/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Codex theme colors
        primary: '#10a37f',
        'primary-hover': '#0d8c6d',
        danger: '#ef4444',
        warning: '#f59e0b',
      },
      animation: {
        highlight: "highlight 1.5s infinite",
      },
      keyframes: {
        highlight: {
          "0%, 100%": {
            color: "#9ca3af", // gray-400
          },
          "50%": {
            color: "#1f2937", // gray-800
          },
        },
      },
    },
  },
  plugins: [],
}
