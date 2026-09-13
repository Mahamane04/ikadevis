/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './index_jsx.js'],
    theme: {
        extend: {
            colors: {
                // Direction « Meta Design System » (2026-09-13).
                // Palette officielle Meta :
                // - Meta Blue : #0082FB
                // - Meta Dark Blue : #0064E0
                // - Meta Canvas Gray : #F1F5F8
                // - Meta Deep Slate : #1C2B33
                brand: {
                    50: '#f0f7ff', 100: '#e0efff', 200: '#b8dcfe',
                    300: '#7ac1fd', 400: '#38a2fc', 500: '#0082fb',
                    600: '#0064e0', 700: '#004fb8', 800: '#003b8a', 900: '#002a63',
                },
                neutral: {
                    50: '#f8fafc',
                    100: '#f1f5f8', // Meta Light Gray / Canvas
                    200: '#e4e9ee', // Meta Border / Divider
                    300: '#cbd5e1',
                    400: '#8f9ca8',
                    500: '#5f6f7e', // Meta Secondary Label
                    600: '#44515e',
                    700: '#2e3d48',
                    800: '#24333e',
                    900: '#1c2b33', // Meta Deep Slate / Heading Charcoal
                }
            },
            fontFamily: {
                sans: ['"Open Sans"', 'sans-serif'],
            },
            boxShadow: {
                'app': '0 2px 8px -2px rgba(0, 0, 0, 0.05), 0 1px 4px -1px rgba(0, 0, 0, 0.03)',
                'floating': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                'inner-sm': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
            }
        }
    },
    plugins: []
};
