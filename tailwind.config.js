/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './index_jsx.js'],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca',
                    300: '#fca5a5', 400: '#f87171', 500: '#e6222b',
                    600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d',
                },
                neutral: {
                    50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0',
                    300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b',
                    600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a',
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
