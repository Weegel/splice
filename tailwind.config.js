/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        splinter: {
          fire: "#e11d48",
          water: "#0284c7",
          earth: "#16a34a",
          life: "#eab308",
          death: "#7c3aed",
          dragon: "#d97706",
          neutral: "#64748b",
        }
      },
      fontFamily: {
        fantasy: ['Cinzel', 'Trajan Pro', 'Georgia', 'serif'],
      }
    },
  },
  plugins: [],
}
