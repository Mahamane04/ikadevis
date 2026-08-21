/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './index_jsx.js'],
    theme: {
        extend: {
            colors: {
                // 2026-08-21 — Passage du rouge au bleu (demande utilisateur).
                // Le 500 est #2563eb et non le bleu clair de la sidebar (#4b8df8) :
                // mesuré sur blanc, #4b8df8 ne donne que 3.25:1 et échoue le seuil
                // AA (4.5:1) du texte des boutons. #2563eb donne 5.17:1, soit mieux
                // que le rouge qu'il remplace (#e6222b, 4.54:1 — tout juste passant).
                // Seul `brand` change : les `red-*` natifs restent rouges, ils
                // portent le sens « danger » (erreurs, suppressions, pertes).
                brand: {
                    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe',
                    300: '#93c5fd', 400: '#60a5fa', 500: '#2563eb',
                    600: '#1d4ed8', 700: '#1e40af', 800: '#1e3a8a', 900: '#172554',
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
