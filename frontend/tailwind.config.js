/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                mono: ['"Courier New"', 'Courier', 'monospace'],
                cyber: ['"Orbitron"', '"Courier New"', 'monospace']
            },
            colors: {
                cyber: {
                    black: '#050a10',
                    green: '#00ff41',
                    dark: '#001100',
                    dim: '#1e293b'
                }
            }
        },
    },
    plugins: [],
}
