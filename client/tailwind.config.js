import tailwindAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            // ⚠️ 색상은 src/index.css의 @theme 블록에서 관리합니다.
            // primary/background 등 공통 토큰을 여기에 정의하면 @theme 정의를 덮어쓰게 되니 주의.
            colors: {
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
