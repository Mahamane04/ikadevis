/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './index_jsx.js'],
    theme: {
        extend: {
            colors: {
                // 2026-08-21 — Direction « Encre ». Le bleu #2563eb, saturé et
                // employé en aplats pleins partout, était jugé trop agressif.
                // `brand` devient un bleu d'ACCENT, plus dense et moins criard :
                // il colore les textes (168 usages), les bordures (78) et les
                // fonds pâles (65). L'action principale, elle, n'est plus bleue
                // mais quasi noire — voir .btn-primary dans index.html.
                //
                // Contrastes sur blanc : 500 = 5,67:1 · 600 = 7,78:1. Au-dessus du
                // seuil AA dans les deux cas.
                //
                // Les `red-*` natifs restent rouges : ils portent le danger.
                brand: {
                    50: '#f1f3fa', 100: '#e2e7f6', 200: '#c7d0ee',
                    300: '#a3b2e2', 400: '#7d90d4', 500: '#3b5bdb',
                    600: '#2f49b0', 700: '#26398a', 800: '#1e2c69', 900: '#16204a',
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
