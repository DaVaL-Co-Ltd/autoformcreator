import tailwindAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: "#000000",
                background: "#F0F2F5",
                waiting: "#FACC15",
                developing: "#A855F7",
                completed: "#22C55E",
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }
        },
    },
    plugins: [
        tailwindAnimate
    ],
}
