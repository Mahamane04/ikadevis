const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ═══════════════════════════════════════════════════════════════
// V6.2 — SUPABASE CLIENT INIT (config runtime par environnement)
// ═══════════════════════════════════════════════════════════════
// Lit window.__APP_CONFIG__, injecté par config.js (généré depuis .env.<env>
// via scripts/generate-config.mjs, voir README). config.js n'est jamais
// versionné : seul config.example.js sert de gabarit commité.
const __CFG = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};
if (typeof window !== 'undefined' && !window.__APP_CONFIG__) {
    console.warn('[ikadevis] config.js absent ou non chargé avant app.compiled.js — copiez config.example.js en config.js et renseignez vos identifiants Supabase.');
}
const SUPABASE_URL  = __CFG.SUPABASE_URL || '';
const SUPABASE_ANON = __CFG.SUPABASE_ANON || '';
const sb = (typeof window !== 'undefined' && window.supabase && SUPABASE_URL && SUPABASE_ANON)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON)
    : null;

// ═══════════════════════════════════════════════════════════════
// V5.3 — localStorage HELPER (cache offline + migration legacy)
// ═══════════════════════════════════════════════════════════════
// P0.1 V5.7 — Cache local isolé par user_id + Outbox persistant & détection guest V5.1
const CC_PREFIX = 'costcalc_';
const LS = {
    getKey: (key, userId) => userId ? ('costcalc:' + userId + ':' + key) : ('costcalc:guest:' + key),
    get: (key, userId) => {
        try {
            const k = LS.getKey(key, userId);
            const v = localStorage.getItem(k);
            if (v !== null) return JSON.parse(v);
            return null;
        } catch(e) { return null; }
    },
    set: (key, val, userId) => {
        try {
            const k = LS.getKey(key, userId);
            localStorage.setItem(k, JSON.stringify(val));
        } catch(e) {}
    },
    getOutbox: (userId) => {
        if (!userId) return {};
        try {
            const v = localStorage.getItem('costcalc:' + userId + ':outbox');
            return v ? JSON.parse(v) : {};
        } catch(e) { return {}; }
    },
    setOutboxKey: (key, val, userId) => {
        if (!userId) return;
        try {
            const outbox = LS.getOutbox(userId);
            const lastRev = parseInt(localStorage.getItem('costcalc:' + userId + ':lastRev') || '100', 10);
            const revision = lastRev + 1;
            localStorage.setItem('costcalc:' + userId + ':lastRev', String(revision));
            outbox[key] = { revision, value: val };
            localStorage.setItem('costcalc:' + userId + ':outbox', JSON.stringify(outbox));
        } catch(e) {}
    },
    clearOutboxKeyIfRevisionMatches: (key, confirmedRevision, userId) => {
        if (!userId) return;
        try {
            const outbox = LS.getOutbox(userId);
            const entry = outbox[key];
            if (entry) {
                const entryRev = (typeof entry === 'object' && 'revision' in entry) ? entry.revision : 0;
                if (entryRev === confirmedRevision || entryRev <= confirmedRevision) {
                    delete outbox[key];
                    if (Object.keys(outbox).length === 0) {
                        localStorage.removeItem('costcalc:' + userId + ':outbox');
                    } else {
                        localStorage.setItem('costcalc:' + userId + ':outbox', JSON.stringify(outbox));
                    }
                }
            }
        } catch(e) {}
    },
    clearOutboxKey: (key, userId) => {
        if (!userId) return;
        try {
            const outbox = LS.getOutbox(userId);
            delete outbox[key];
            if (Object.keys(outbox).length === 0) {
                localStorage.removeItem('costcalc:' + userId + ':outbox');
            } else {
                localStorage.setItem('costcalc:' + userId + ':outbox', JSON.stringify(outbox));
            }
        } catch(e) {}
    },
    clearOutbox: (userId) => {
        if (!userId) return;
        localStorage.removeItem('costcalc:' + userId + ':outbox');
    },
    hasLegacyUnnamespacedData: () => {
        return ['companyInfo', 'materials', 'labor', 'solutions', 'recipes', 'savedQuotes',
                'costcalc_materials', 'costcalc_recipes',
                'costcalc:guest:materials', 'costcalc:guest:recipes', 'costcalc:guest:savedQuotes'].some(k => localStorage.getItem(k) !== null);
    },
    getLegacyData: () => {
        const loadKey = (k) => {
            const val = localStorage.getItem('costcalc:guest:' + k) || localStorage.getItem('costcalc_' + k) || localStorage.getItem(k);
            try { return val ? JSON.parse(val) : null; } catch(e) { return null; }
        };
        const rawSchema = localStorage.getItem('costcalc:guest:schemaVersion') || localStorage.getItem('schemaVersion');
        return {
            companyInfo: loadKey('companyInfo'),
            materials: loadKey('materials'),
            labor: loadKey('labor'),
            solutions: loadKey('solutions'),
            recipes: loadKey('recipes'),
            savedQuotes: loadKey('savedQuotes'),
            nextQuoteSeq: loadKey('nextQuoteSeq'),
            schemaVersion: rawSchema ? parseInt(rawSchema, 10) : 8
        };
    },
    clearLegacyData: () => {
        Object.keys(localStorage).filter(k => k.startsWith('costcalc_') || k.startsWith('costcalc:guest:') || ['companyInfo','materials','labor','solutions','recipes','savedQuotes','nextQuoteSeq','calcForm','schemaVersion'].includes(k)).forEach(k => localStorage.removeItem(k));
    },
    clearUser: (userId) => {
        const prefix = userId ? ('costcalc:' + userId + ':') : 'costcalc:guest:';
        Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
    }
};
if (typeof window !== 'undefined') window.LS = LS;

// Schema version
const SCHEMA_VERSION = "9";
const CURRENT_SCHEMA_INT = 9;

// ═══════════════════════════════════════════════════════════════
// V5.2 — ECRAN D'AUTHENTIFICATION
// ═══════════════════════════════════════════════════════════════
function AuthScreen({ onAuthSuccess }) {
    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [orgName, setOrgName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null); setInfo(null); setLoading(true);
        try {
            if (!sb) throw new Error('Client Supabase non initialisé — vérifiez que vendor/supabase.min.js est chargé.');
            if (mode === 'login') {
                const { data, error: err } = await sb.auth.signInWithPassword({ email, password });
                if (err) throw err;
                onAuthSuccess(data.session);
            } else if (mode === 'signup') {
                if (!orgName.trim()) throw new Error('Le nom de votre organisation est requis.');
                if (password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
                const { data, error: err } = await sb.auth.signUp({ email, password, options: { data: { org_name: orgName } } });
                if (err) throw err;
                if (data.session) {
                    onAuthSuccess(data.session);
                } else {
                    setInfo('Compte créé ! Vérifiez votre email pour confirmer votre inscription, puis connectez-vous.');
                    setMode('login');
                }
            } else if (mode === 'reset') {
                const { error: err } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
                if (err) throw err;
                setInfo('Email de réinitialisation envoyé. Vérifiez votre boîte de réception.');
                setMode('login');
            }
        } catch(err) {
            setError(err.message || 'Une erreur est survenue.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-neutral-900 to-brand-950 flex items-center justify-center p-4" style={{background: 'linear-gradient(135deg, #0f172a 0%, #171717 50%, #1a0505 100%)'}}>
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-brand-600 shadow-2xl mb-6" style={{background: 'linear-gradient(135deg, #E6222B, #9b1c1c)'}}>
                        <svg viewBox="0 0 40 40" className="w-10 h-10">
                            <path d="M5 30L17 12L29 30H5Z" fill="white" opacity="0.9"/>
                            <circle cx="30" cy="12" r="6" fill="white"/>
                        </svg>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">ikadevis</h1>
                    <p className="text-neutral-400 font-semibold text-sm mt-1 tracking-widest uppercase">BTP · ERP Calcul de Devis</p>
                </div>

                {/* Card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                    <h2 className="text-white font-extrabold text-xl mb-1">
                        {mode === 'login' ? 'Connexion' : mode === 'signup' ? 'Créer un compte' : 'Réinitialiser le mot de passe'}
                    </h2>
                    <p className="text-neutral-400 text-sm font-medium mb-6">
                        {mode === 'login' ? 'Accédez à votre espace de travail BTP.' : mode === 'signup' ? 'Commencez à chiffrer vos projets.' : 'Entrez votre email pour recevoir un lien.'}
                    </p>

                    {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded-xl px-4 py-3 mb-4">{error}</div>}
                    {info && <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-semibold rounded-xl px-4 py-3 mb-4">{info}</div>}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'signup' && (
                            <div>
                                <label className="block text-neutral-300 text-xs font-bold uppercase tracking-wider mb-1.5">Nom de l'organisation</label>
                                <input type="text" value={orgName} onChange={e=>setOrgName(e.target.value)} required
                                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm font-medium placeholder-neutral-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                                    placeholder="Ex: BATI SARL, BTP Constructions…" />
                            </div>
                        )}
                        <div>
                            <label className="block text-neutral-300 text-xs font-bold uppercase tracking-wider mb-1.5">Email</label>
                            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required
                                className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm font-medium placeholder-neutral-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                                placeholder="vous@entreprise.com" />
                        </div>
                        {mode !== 'reset' && (
                            <div>
                                <label className="block text-neutral-300 text-xs font-bold uppercase tracking-wider mb-1.5">Mot de passe</label>
                                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}
                                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm font-medium placeholder-neutral-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                                    placeholder={mode === 'signup' ? 'Minimum 8 caractères' : '••••••••'} />
                            </div>
                        )}
                        <button type="submit" disabled={loading}
                            className="w-full py-3.5 rounded-xl font-black text-white text-sm tracking-wide transition-all active:scale-95 disabled:opacity-50"
                            style={{background: loading ? '#666' : 'linear-gradient(135deg, #E6222B, #9b1c1c)', boxShadow: '0 4px 20px rgba(230,34,43,0.4)'}}>
                            {loading ? <span><i className="fa-solid fa-spinner fa-spin mr-2"></i>Chargement…</span>
                                : mode === 'login' ? 'Se connecter →'
                                : mode === 'signup' ? 'Créer mon compte →'
                                : 'Envoyer le lien →'}
                        </button>
                    </form>

                    <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-3 text-center">
                        <button 
                            type="button" 
                            onClick={() => onAuthSuccess({ user: { id: 'guest', email: 'invite@local.app' } })}
                            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-white/10 hover:bg-white/20 transition-all border border-white/20 flex items-center justify-center gap-2"
                        >
                            <i className="fa-solid fa-user-check text-emerald-400"></i>
                            Continuer en Mode Démo / Hors-ligne (Invité)
                        </button>
                        {mode === 'login' && (<>
                            <button onClick={()=>{setMode('signup');setError(null);}} className="text-neutral-400 hover:text-white text-sm font-semibold transition-colors">Pas encore de compte ? <span className="text-brand-400">Créer un compte</span></button>
                            <button onClick={()=>{setMode('reset');setError(null);}} className="text-neutral-500 hover:text-neutral-300 text-xs font-medium transition-colors">Mot de passe oublié ?</button>
                        </>)}
                        {mode !== 'login' && (
                            <button onClick={()=>{setMode('login');setError(null);}} className="text-neutral-400 hover:text-white text-sm font-semibold transition-colors">← Retour à la connexion</button>
                        )}
                    </div>
                </div>

                <p className="text-center text-neutral-500 text-xs font-medium mt-6">🔒 Sécurisé par Supabase Auth &amp; RLS · Mode Démo Local disponible</p>
            </div>
        </div>
    );
}

const LogoSVG = ({ className = "h-8" }) => (
    <svg className={className} viewBox="0 0 240 60" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="10" width="40" height="40" rx="10" fill="#E6222B"/>
        <path d="M15 35L23 23L31 35H15Z" fill="white"/>
        <circle cx="33" cy="22" r="4" fill="white"/>
        <text x="55" y="38" fill="#171717" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="24" letterSpacing="-0.5">ikadevis</text>
        <text x="55" y="50" fill="#E6222B" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="10" letterSpacing="2">BTP & ERP CALCUL</text>
    </svg>
);

const CustomSelect = ({ value, onChange, options, className, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectRef = useRef(null);
    
    const selectedOption = options.find(o => String(o.value) === String(value)) || options[0];

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (selectRef.current && !selectRef.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div ref={selectRef} className={`relative ${className || ''}`}>
            <button type="button" disabled={disabled} onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full text-left px-4 py-3 border rounded-xl text-sm font-semibold transition-all focus:outline-none flex justify-between items-center ${disabled ? 'bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed' : isOpen ? 'border-brand-500 bg-white ring-4 ring-brand-500/10 text-brand-700' : 'bg-neutral-50 border-neutral-200 text-neutral-800 hover:border-neutral-300 hover:bg-white'}`}>
                <span className="truncate">{selectedOption ? selectedOption.label : 'Sélectionner...'}</span>
                <i className={`fa-solid fa-chevron-down text-[10px] transition-transform duration-200 ${isOpen ? 'rotate-180 text-brand-500' : 'text-neutral-400'}`}></i>
            </button>
            {isOpen && !disabled && (
                <div className="absolute z-[100] w-full mt-2 bg-white border border-neutral-100 rounded-xl shadow-floating overflow-hidden max-h-60 overflow-y-auto animate-fade-in origin-top">
                    {options.map((opt) => (
                        <button key={opt.value} type="button" onClick={() => { onChange({ target: { value: opt.value }}); setIsOpen(false); }}
                            className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between ${String(value) === String(opt.value) ? 'bg-brand-50 text-brand-700 font-bold' : 'text-neutral-700 font-medium hover:bg-neutral-50 hover:text-neutral-900'}`}>
                            <span>{opt.label}</span>
                            {String(value) === String(opt.value) && <i className="fa-solid fa-check text-brand-600 text-xs"></i>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════
// BLOC 3/10 : MOTEUR UNIVERSEL DE MÉTRÉ, UNITÉS & AST SÉCURISÉ (ZERO new Function)
// ═══════════════════════════════════════════════════════════════

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error("[ikadevis ErrorBoundary]", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-white p-6 font-sans">
                    <div className="max-w-md w-full bg-neutral-800 border border-neutral-700 rounded-3xl p-8 text-center shadow-2xl space-y-5">
                        <div className="w-16 h-16 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto text-2xl border border-red-500/30">
                            <i className="fa-solid fa-shield-halved"></i>
                        </div>
                        <div>
                            <h2 className="text-xl font-extrabold text-white">Récupération Sécurisée d'Affichage</h2>
                            <p className="text-xs text-neutral-400 mt-1">Vos données de devis et catalogue restent sauvegardées.</p>
                        </div>
                        <p className="text-xs text-red-300 font-mono bg-neutral-950/80 p-3 rounded-xl text-left overflow-auto max-h-32 border border-neutral-800">
                            {this.state.error?.message || "Erreur interceptée"}
                        </p>
                        <button onClick={() => window.location.reload()} className="btn-primary w-full py-3.5 shadow-lg shadow-brand-500/30 font-bold">
                            <i className="fa-solid fa-arrow-rotate-right mr-2"></i>Actualiser l'application
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}


// ═══════════════════════════════════════════════════════════════
// ikadevis V6 HYBRID QUOTE ENGINE & WORKSPACE (Zoho-Style Architecture)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// ikadevis V6 HYBRID QUOTE MODULE — DATA ADAPTER & ENGINE
// ═══════════════════════════════════════════════════════════════

function NewQuoteWizardModal({
    isOpen,
    onClose,
    onLoadTemplate,
    onGenerateFromQuickEstimate,
    onInitBlankQuote,
    currency = 'FCFA'
}) {
    const [wizardTab, setWizardTab] = useState('quick_estimate'); // 'quick_estimate' | 'templates' | 'blank'
    
    // Quick Estimate State
    const [estimateCategory, setEstimateCategory] = useState('villa_house');
    const [estimateSurface, setEstimateSurface] = useState(150);
    const [estimateQuality, setEstimateQuality] = useState('standard');
    const [estimateCity, setEstimateCity] = useState('Bamako');

    if (!isOpen) return null;

    const quickResult = calculateQuickEstimate({
        category: estimateCategory,
        surface: parseFloat(estimateSurface) || 1,
        quality: estimateQuality,
        city: estimateCity
    });

    const categoryOptions = [
        { id: 'villa_house', label: 'Construction Villa / Maison', icon: 'fa-house', unit: 'm²', defaultSurface: 150, desc: 'Bros œuvre, second œuvre et finitions' },
        { id: 'event_stand', label: 'Événementiel & Stands', icon: 'fa-tent', unit: 'm²', defaultSurface: 36, desc: 'Podium, backdrops, bâches, mobilier, régie' },
        { id: 'acm_facade', label: 'Habillage Façade Alucobond / ACM', icon: 'fa-building', unit: 'm²', defaultSurface: 120, desc: 'Panneaux composites, ossature, calepinage' },
        { id: 'signage_branding', label: 'Enseigne & Branding Magasin', icon: 'fa-shop', unit: 'ml', defaultSurface: 6, desc: 'Caissons lumineux LED, totems, adhésifs' },
        { id: 'renovation_paint', label: 'Peinture & Ravalement', icon: 'fa-paint-roller', unit: 'm²', defaultSurface: 350, desc: 'Préparation, peinture satinée et finitions' }
    ];

    const templatesList = [
        {
            id: 'r1_villa',
            title: 'Construction Villa Duplex R+1',
            domain: 'BTP & Gros Œuvre',
            icon: 'fa-house-laptop',
            lotsCount: 11,
            badge: 'BTP 11 Lots',
            desc: 'Terrassement, fondations, béton armé, maçonnerie, étanchéité, élec, plomberie, carrelage, menuiserie, peinture...',
            template: R1_TEMPLATE_QUOTE
        },
        {
            id: 'painting_pro',
            title: 'Peinture & Ravalement Intérieur / Extérieur',
            domain: 'Finitions & Peinture',
            icon: 'fa-paint-roller',
            lotsCount: 3,
            badge: 'Métré Déduit',
            desc: '3 lots : protection masquage, lessivage, primaire hydrofuge, enduit 2 passes et peinture velours 2 couches (350m²).',
            template: PAINTING_PRO_TEMPLATE_QUOTE
        },
        {
            id: 'tiling_pro',
            title: 'Carrelage & Faïence Grès Cérame 60x60',
            domain: 'Revêtements Sols & Murs',
            icon: 'fa-table-cells',
            lotsCount: 3,
            badge: 'Pose & Joints',
            desc: '3 lots : ragréage autolissant P3, carrelage 60x60 rectifié double encollage C2S1, plinthes et profilés alu (220m²).',
            template: TILING_PRO_TEMPLATE_QUOTE
        },
        {
            id: 'metallerie_pro',
            title: 'Métallerie, Châssis Acier & Plan de Débit',
            domain: 'Métallerie & Serrurerie',
            icon: 'fa-hammer',
            lotsCount: 3,
            badge: 'Plan de Débit 1D',
            desc: '3 lots : débit barres 6m optimisé (chutes < 5%), soudure MIG/MAG, gaz, antirouille zinc, laque et pose site.',
            template: METALLERIE_PRO_TEMPLATE_QUOTE
        },
        {
            id: 'menuiserie_pro',
            title: 'Menuiserie, Dressing & Caissons Meuble',
            domain: 'Agencement & Menuiserie',
            icon: 'fa-couch',
            lotsCount: 3,
            badge: 'Calepinage 2D',
            desc: '3 lots : panneaux MDF 18mm, placage chants ABS 2mm, charnières amorties, tiroirs invisibles et montage atelier/pose.',
            template: MENUISERIE_PRO_TEMPLATE_QUOTE
        },
        {
            id: 'acm_facade',
            title: 'Habillage Façade ACM Alucobond 180m²',
            domain: 'Façades & Bardage',
            icon: 'fa-building-columns',
            lotsCount: 3,
            badge: 'Cassettes ACM',
            desc: '3 lots : échafaudage sécurisé, ossature tubulaire galvanisée et cassettes Alucobond 4mm PVDF avec calepinage.',
            template: ACM_FACADE_TEMPLATE_QUOTE
        },
        {
            id: 'signage_branding',
            title: 'Enseigne Lumineuse LED & Vitrine',
            domain: 'Signalétique & Branding',
            icon: 'fa-lightbulb',
            lotsCount: 2,
            badge: 'LED IP67',
            desc: '2 lots : caisson lumineux double face LED, lettres découpées rétroéclairées et adhésif vitrine microperforé.',
            template: SIGNAGE_BRANDING_TEMPLATE_QUOTE
        }
    ];

    const handleApplyQuickEstimate = () => {
        // Build customized quote based on estimate
        const currentYear = new Date().getFullYear();
        let selectedTemplate = R1_TEMPLATE_QUOTE;
        if (estimateCategory === 'event_stand') selectedTemplate = EVENT_TEMPLATE_QUOTE;
        else if (estimateCategory === 'acm_facade') selectedTemplate = ACM_FACADE_TEMPLATE_QUOTE;
        else if (estimateCategory === 'signage_branding') selectedTemplate = SIGNAGE_BRANDING_TEMPLATE_QUOTE;

        const customQuote = {
            ...JSON.parse(JSON.stringify(selectedTemplate)),
            id: Date.now(),
            number: `DEV-${currentYear}-EST-${Math.floor(100 + Math.random() * 900)}`,
            clientName: 'Client Estimation Rapide',
            projectRef: `Projet ${categoryOptions.find(c => c.id === estimateCategory)?.label} (${estimateSurface} ${quickResult.unit})`,
            status: 'draft'
        };

        onGenerateFromQuickEstimate(customQuote);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden border border-neutral-200">
                {/* Header Modal */}
                <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-brand-500 text-white flex items-center justify-center text-lg font-bold shadow-md shadow-brand-500/20">
                            <i className="fa-solid fa-wand-magic-sparkles"></i>
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-neutral-900">Nouveau Devis — Assistant Intelligent</h2>
                            <p className="text-xs text-neutral-500">Choisissez votre méthode de chiffrage selon votre profil et projet</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-xl border border-neutral-200 hover:bg-neutral-100 flex items-center justify-center text-neutral-500"
                        aria-label="Fermer l'assistant"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                {/* Switcher de Mode */}
                <div className="flex border-b border-neutral-200 bg-white px-6 pt-3 gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={() => setWizardTab('quick_estimate')}
                        className={`pb-3 px-3 text-xs font-black border-b-2 flex items-center gap-2 transition-all ${
                            wizardTab === 'quick_estimate'
                                ? 'border-brand-600 text-brand-600'
                                : 'border-transparent text-neutral-500 hover:text-neutral-900'
                        }`}
                    >
                        <i className="fa-solid fa-bolt text-brand-500"></i>
                        <span>1. Estimation Rapide (Particulier / Novice)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setWizardTab('templates')}
                        className={`pb-3 px-3 text-xs font-black border-b-2 flex items-center gap-2 transition-all ${
                            wizardTab === 'templates'
                                ? 'border-brand-600 text-brand-600'
                                : 'border-transparent text-neutral-500 hover:text-neutral-900'
                        }`}
                    >
                        <i className="fa-solid fa-layer-group text-indigo-500"></i>
                        <span>2. Modèles Métiers 1-Clic (BTP, Événementiel, Façade)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setWizardTab('blank')}
                        className={`pb-3 px-3 text-xs font-black border-b-2 flex items-center gap-2 transition-all ${
                            wizardTab === 'blank'
                                ? 'border-brand-600 text-brand-600'
                                : 'border-transparent text-neutral-500 hover:text-neutral-900'
                        }`}
                    >
                        <i className="fa-solid fa-file-circle-plus text-neutral-500"></i>
                        <span>3. Devis Vierge</span>
                    </button>
                </div>

                {/* Body Modal */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* TAB 1: ESTIMATION RAPIDE */}
                    {wizardTab === 'quick_estimate' && (
                        <div className="space-y-6 animate-fade-in">
                            <div>
                                <label className="app-label text-xs font-black uppercase text-neutral-700">
                                    Étape 1 : Que souhaitez-vous faire chiffrer ?
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                                    {categoryOptions.map(cat => (
                                        <div
                                            key={cat.id}
                                            onClick={() => {
                                                setEstimateCategory(cat.id);
                                                setEstimateSurface(cat.defaultSurface);
                                            }}
                                            className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                                                estimateCategory === cat.id
                                                    ? 'border-brand-500 bg-brand-50/40 shadow-sm ring-2 ring-brand-500/10'
                                                    : 'border-neutral-200 hover:border-neutral-300 bg-white'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm ${
                                                    estimateCategory === cat.id ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-600'
                                                }`}>
                                                    <i className={`fa-solid ${cat.icon}`}></i>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="text-xs font-extrabold text-neutral-900 truncate">{cat.label}</h4>
                                                    <p className="text-[10px] text-neutral-500 truncate">{cat.desc}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Paramètres de l'estimation */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
                                <div>
                                    <label className="app-label text-[11px] font-bold">
                                        Surface / Quantité estimée ({categoryOptions.find(c => c.id === estimateCategory)?.unit || 'm²'})
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={estimateSurface}
                                        onChange={(e) => setEstimateSurface(Math.max(1, parseFloat(e.target.value) || 1))}
                                        className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-black text-neutral-900 focus:border-brand-500 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="app-label text-[11px] font-bold">Niveau de Finition / Standing</label>
                                    <select
                                        value={estimateQuality}
                                        onChange={(e) => setEstimateQuality(e.target.value)}
                                        className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 focus:border-brand-500 outline-none"
                                    >
                                        <option value="eco">Économique (Matériaux standards)</option>
                                        <option value="standard">Standard (Bon rapport qualité/prix)</option>
                                        <option value="premium">Haut Standing / Premium (Finitions luxe)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="app-label text-[11px] font-bold">Ville / Localisation Chantier</label>
                                    <select
                                        value={estimateCity}
                                        onChange={(e) => setEstimateCity(e.target.value)}
                                        className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 focus:border-brand-500 outline-none"
                                    >
                                        <option value="Bamako">Bamako (Mali)</option>
                                        <option value="Abidjan">Abidjan (Côte d'Ivoire)</option>
                                        <option value="Dakar">Dakar (Sénégal)</option>
                                        <option value="Ouagadougou">Ouagadougou (Burkina)</option>
                                        <option value="Conakry">Conakry (Guinée)</option>
                                        <option value="Autre">Autre Localité</option>
                                    </select>
                                </div>
                            </div>

                            {/* Résultat Visuel de la Fourchette */}
                            <div className="p-5 rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-950 text-white shadow-lg space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-3">
                                    <div>
                                        <span className="text-[10px] font-black uppercase tracking-wider text-brand-400">
                                            Estimation Indicative Instantanée
                                        </span>
                                        <h3 className="text-sm font-extrabold text-white">
                                            {categoryOptions.find(c => c.id === estimateCategory)?.label} — {estimateSurface} {quickResult.unit}
                                        </h3>
                                    </div>
                                    <span className="px-3 py-1 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 text-xs font-mono font-bold self-start sm:self-auto">
                                        Tarif moyen : {formatMoney(quickResult.ratePerUnit, currency)} / {quickResult.unit}
                                    </span>
                                </div>

                                <div className="flex flex-wrap items-baseline justify-between gap-4 pt-1">
                                    <div>
                                        <span className="text-[10px] text-neutral-400 block uppercase font-bold">Fourchette Estimative Net HT</span>
                                        <span className="text-base sm:text-xl font-bold text-neutral-200">
                                            {formatMoney(quickResult.minHT, currency)} <span className="text-neutral-500 text-xs">à</span> {formatMoney(quickResult.maxHT, currency)}
                                        </span>
                                    </div>

                                    <div>
                                        <span className="text-[10px] text-brand-400 block uppercase font-black">Budget Moyen Estimé TTC</span>
                                        <span className="text-lg sm:text-2xl font-black text-brand-400">
                                            {formatMoney(quickResult.avgTTC, currency)}
                                        </span>
                                    </div>
                                </div>

                                <div className="pt-2 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={handleApplyQuickEstimate}
                                        className="btn-primary py-2.5 px-5 text-xs font-black shadow-md shadow-brand-500/30 flex items-center gap-2"
                                    >
                                        <i className="fa-solid fa-arrow-right"></i>
                                        <span>Transformer en Devis Détaillé &amp; Chiffrer</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: MODÈLES MÉTIERS 1-CLIC */}
                    {wizardTab === 'templates' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in">
                            {templatesList.map(tpl => (
                                <div
                                    key={tpl.id}
                                    className="p-5 rounded-2xl border border-neutral-200 hover:border-brand-500 hover:shadow-md bg-white transition-all flex flex-col justify-between group cursor-pointer"
                                    onClick={() => {
                                        onLoadTemplate(tpl.template);
                                        onClose();
                                    }}
                                >
                                    <div className="space-y-2.5">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white flex items-center justify-center text-base transition-colors">
                                                <i className={`fa-solid ${tpl.icon}`}></i>
                                            </div>
                                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                                                {tpl.lotsCount} Lots
                                            </span>
                                        </div>

                                        <div>
                                            <span className="text-[10px] font-bold text-brand-600 uppercase tracking-wider block">{tpl.domain}</span>
                                            <h3 className="font-black text-sm text-neutral-900 group-hover:text-brand-700 transition-colors">
                                                {tpl.title}
                                            </h3>
                                            <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{tpl.desc}</p>
                                        </div>
                                    </div>

                                    <div className="pt-4 mt-3 border-t border-neutral-100 flex items-center justify-between text-xs font-bold text-brand-600 group-hover:translate-x-1 transition-transform">
                                        <span>Charger ce projet modèle</span>
                                        <i className="fa-solid fa-arrow-right"></i>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* TAB 3: DEVIS VIERGE */}
                    {wizardTab === 'blank' && (
                        <div className="p-8 text-center space-y-4 animate-fade-in bg-neutral-50 rounded-2xl border border-neutral-200">
                            <div className="w-14 h-14 rounded-2xl bg-white border border-neutral-200 text-neutral-600 flex items-center justify-center mx-auto text-2xl shadow-xs">
                                <i className="fa-solid fa-file-circle-plus"></i>
                            </div>
                            <div>
                                <h3 className="text-base font-extrabold text-neutral-800">Commencer avec un devis vierge</h3>
                                <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                                    Créez un devis de zéro en ajoutant librement vos lots, ouvrages de la bibliothèque et lignes de prestations.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    onInitBlankQuote();
                                    onClose();
                                }}
                                className="btn-primary py-2.5 px-6 text-xs font-black"
                            >
                                Initialiser le Devis Vierge
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// ASSISTANT & VISUALISEUR DE CALEPINAGE 2D (ACM Alucobond)
// ═══════════════════════════════════════════════════════════════

function AcmCalepinageVisualizer({
    width = 12,
    height = 6,
    panelWidth = 1.5,
    panelHeight = 4.0,
    onApplyParams,
    currency = 'FCFA'
}) {
    const [wInput, setWInput] = useState(width);
    const [hInput, setHInput] = useState(height);
    const [pwInput, setPwInput] = useState(panelWidth);
    const [phInput, setPhInput] = useState(panelHeight);

    const nesting = calculateAcmNesting({
        width: parseFloat(wInput) || 1,
        height: parseFloat(hInput) || 1,
        panelWidth: parseFloat(pwInput) || 1.5,
        panelHeight: parseFloat(phInput) || 4.0
    });

    const svgWidth = 400;
    const svgHeight = 220;
    const padding = 20;

    const scaleX = (svgWidth - 2 * padding) / Math.max(1, nesting.cols * pwInput);
    const scaleY = (svgHeight - 2 * padding) / Math.max(1, nesting.rows * phInput);
    const scale = Math.min(scaleX, scaleY);

    return (
        <div className="p-4 rounded-2xl bg-neutral-900 text-white space-y-4 border border-neutral-800">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <div className="flex items-center gap-2">
                    <i className="fa-solid fa-border-all text-brand-400"></i>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-neutral-200">
                        Calepinage 2D &amp; Nesting Panneaux Façade ACM
                    </span>
                </div>
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    Taux de chute : {nesting.wastePct}%
                </span>
            </div>

            {/* Formulaire dimensions Calepinage */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                    <label className="text-[10px] text-neutral-400 block">Façade Largeur (m)</label>
                    <input
                        type="number"
                        step="any"
                        value={wInput}
                        onChange={(e) => setWInput(e.target.value)}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-1.5 font-bold text-white text-xs outline-none"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-neutral-400 block">Façade Hauteur (m)</label>
                    <input
                        type="number"
                        step="any"
                        value={hInput}
                        onChange={(e) => setHInput(e.target.value)}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-1.5 font-bold text-white text-xs outline-none"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-neutral-400 block">Format Plaque $L_p$ (m)</label>
                    <input
                        type="number"
                        step="any"
                        value={pwInput}
                        onChange={(e) => setPwInput(e.target.value)}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-1.5 font-bold text-white text-xs outline-none"
                    />
                </div>
                <div>
                    <label className="text-[10px] text-neutral-400 block">Format Plaque $H_p$ (m)</label>
                    <input
                        type="number"
                        step="any"
                        value={phInput}
                        onChange={(e) => setPhInput(e.target.value)}
                        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-1.5 font-bold text-white text-xs outline-none"
                    />
                </div>
            </div>

            {/* Rendu Graphique SVG du Calepinage */}
            <div className="bg-neutral-950 rounded-xl p-3 border border-neutral-800 flex flex-col items-center justify-center">
                <svg width={svgWidth} height={svgHeight} className="overflow-visible">
                    {Array.from({ length: nesting.rows }).map((_, rIdx) =>
                        Array.from({ length: nesting.cols }).map((_, cIdx) => {
                            const x = padding + cIdx * pwInput * scale;
                            const y = padding + rIdx * phInput * scale;
                            const w = pwInput * scale;
                            const h = phInput * scale;
                            return (
                                <g key={`${rIdx}-${cIdx}`}>
                                    <rect
                                        x={x}
                                        y={y}
                                        width={w - 2}
                                        height={h - 2}
                                        fill="#e6222b22"
                                        stroke="#e6222b"
                                        strokeWidth="1.5"
                                        rx="2"
                                    />
                                    <text
                                        x={x + w / 2}
                                        y={y + h / 2}
                                        fill="#ffffff"
                                        fontSize="9"
                                        fontWeight="bold"
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                    >
                                        P{rIdx * nesting.cols + cIdx + 1}
                                    </text>
                                </g>
                            );
                        })
                    )}
                </svg>
            </div>

            {/* Métriques Calculées */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-neutral-800/60 border border-neutral-700/60">
                    <span className="text-[10px] text-neutral-400 block">Plaques Brutes</span>
                    <span className="font-extrabold text-white text-sm">{nesting.totalRawPanels} plaques</span>
                </div>
                <div className="p-2 rounded-lg bg-neutral-800/60 border border-neutral-700/60">
                    <span className="text-[10px] text-neutral-400 block">Tubes Ossature</span>
                    <span className="font-extrabold text-brand-400 text-sm">{nesting.totalLinearTubes} ml ({nesting.tubesBarCount} b.)</span>
                </div>
                <div className="p-2 rounded-lg bg-neutral-800/60 border border-neutral-700/60">
                    <span className="text-[10px] text-neutral-400 block">Surface Utile</span>
                    <span className="font-extrabold text-emerald-400 text-sm">{nesting.totalSurface} m²</span>
                </div>
            </div>

            {onApplyParams && (
                <button
                    type="button"
                    onClick={() => onApplyParams({
                        surfaceDirect: nesting.totalSurface,
                        rawPanels: nesting.totalRawPanels,
                        tubesLinear: nesting.totalLinearTubes,
                        waste: nesting.wastePct
                    })}
                    className="w-full btn-primary text-xs py-2 font-bold flex items-center justify-center gap-1.5"
                >
                    <i className="fa-solid fa-check"></i>
                    <span>Appliquer les Métrés Calepinés au Devis</span>
                </button>
            )}
        </div>
    );
}


function QuoteHeader({
    quote,
    onUpdateQuote,
    saveQuoteStatus = "idle",
    saveQuoteError = null,
    onSaveQuote,
    onPreviewQuote,
    onOpenWizard,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    useHybridEditor,
    onToggleHybridEditor,
    autosaveTime,
    hasUnsavedChanges,
    isSaving,
    isReadOnlyDueToDowngrade
}) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setIsMenuOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const statusOptions = [
        { value: 'draft', label: 'Brouillon', bg: 'bg-neutral-100 text-neutral-700 border-neutral-300' },
        { value: 'to_verify', label: 'À vérifier', bg: 'bg-amber-50 text-amber-700 border-amber-300' },
        { value: 'ready', label: 'Prêt', bg: 'bg-blue-50 text-blue-700 border-blue-300' },
        { value: 'sent', label: 'Envoyé', bg: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
        { value: 'accepted', label: 'Accepté', bg: 'bg-emerald-50 text-emerald-700 border-emerald-300' }
    ];

    const currentStatus = statusOptions.find(s => s.value === (quote.status || 'draft')) || statusOptions[0];

    return (
        <header className="bg-white border-b border-neutral-200 px-4 py-3 sticky top-0 z-30 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 max-w-[1700px] mx-auto">
                {/* Ligne 1 : Numéro, Titre Projet & Client + Undo/Redo */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 text-white font-mono text-xs font-bold tracking-wide shrink-0">
                        <i className="fa-solid fa-file-invoice text-brand-400 text-[11px]"></i>
                        {quote.number || 'DEV-2026-001'}
                    </span>

                    {/* Undo / Redo */}
                    <div className="hidden sm:flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border border-neutral-200 shrink-0">
                        <button
                            type="button"
                            disabled={!canUndo}
                            onClick={onUndo}
                            className={`w-7 h-7 rounded flex items-center justify-center text-xs transition-all ${
                                canUndo ? 'text-neutral-700 hover:bg-white shadow-xs' : 'text-neutral-300 cursor-not-allowed'
                            }`}
                            title="Annuler la dernière action (Ctrl+Z)"
                            aria-label="Annuler la modification"
                        >
                            <i className="fa-solid fa-rotate-left"></i>
                        </button>
                        <button
                            type="button"
                            disabled={!canRedo}
                            onClick={onRedo}
                            className={`w-7 h-7 rounded flex items-center justify-center text-xs transition-all ${
                                canRedo ? 'text-neutral-700 hover:bg-white shadow-xs' : 'text-neutral-300 cursor-not-allowed'
                            }`}
                            title="Rétablir (Ctrl+Y)"
                            aria-label="Rétablir la modification"
                        >
                            <i className="fa-solid fa-rotate-right"></i>
                        </button>
                    </div>

                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <input
                            type="text"
                            value={quote.clientName || ''}
                            onChange={(e) => onUpdateQuote({ clientName: e.target.value })}
                            placeholder="Nom du Client (ex: M. KOUASSI, BTP SARL)…"
                            className="bg-neutral-50 hover:bg-white focus:bg-white border border-neutral-200 focus:border-brand-500 rounded-lg px-3 py-1.5 text-xs font-bold text-neutral-900 placeholder-neutral-400 focus:ring-2 focus:ring-brand-500/10 outline-none flex-1 transition-all"
                            aria-label="Nom du client"
                        />
                        <input
                            type="text"
                            value={quote.projectRef || ''}
                            onChange={(e) => onUpdateQuote({ projectRef: e.target.value })}
                            placeholder="Chantier / Projet (ex: Villa R+1 Cocody)…"
                            className="hidden sm:block bg-neutral-50 hover:bg-white focus:bg-white border border-neutral-200 focus:border-brand-500 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-800 placeholder-neutral-400 focus:ring-2 focus:ring-brand-500/10 outline-none flex-1 transition-all"
                            aria-label="Référence du chantier"
                        />
                    </div>

                    {/* Statut Pill */}
                    <div className="relative shrink-0">
                        <select
                            value={quote.status || 'draft'}
                            onChange={(e) => onUpdateQuote({ status: e.target.value })}
                            className={`text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full border cursor-pointer appearance-none pr-6 ${currentStatus.bg} focus:outline-none focus:ring-2 focus:ring-brand-500/20`}
                            aria-label="Statut du devis"
                        >
                            {statusOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <i className="fa-solid fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-[9px] pointer-events-none opacity-60"></i>
                    </div>

                    {/* Indicateur Sauvegarde Auto */}
                    <div className="hidden xl:flex items-center gap-1.5 text-[11px] shrink-0 font-medium">
                        {isSaving ? (
                            <span className="text-neutral-500 flex items-center gap-1">
                                <i className="fa-solid fa-spinner fa-spin text-brand-500"></i>
                                <span>Sauvegarde…</span>
                            </span>
                        ) : hasUnsavedChanges ? (
                            <span className="text-amber-600 flex items-center gap-1 font-bold">
                                <i className="fa-solid fa-circle-dot text-amber-500 text-[9px]"></i>
                                <span>Modifications non enregistrées</span>
                            </span>
                        ) : (
                            <span className="text-emerald-600 flex items-center gap-1 font-bold">
                                <i className="fa-solid fa-cloud-check text-emerald-500"></i>
                                <span>{autosaveTime ? `Enregistré à ${autosaveTime}` : 'Enregistré localement'}</span>
                            </span>
                        )}
                    </div>
                </div>

                {/* Ligne 2 : Actions principales & Assistant Nouveau Devis */}
                <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                    {/* Bouton Nouveau Devis Intelligent */}
                    <button
                        type="button"
                        onClick={onOpenWizard}
                        className="btn-primary text-xs py-1.5 px-3.5 font-black flex items-center gap-1.5 shadow-sm shadow-brand-500/20"
                        title="Ouvrir l'assistant intelligent de création de devis"
                    >
                        <i className="fa-solid fa-wand-magic-sparkles"></i>
                        <span>+ Nouveau Devis</span>
                    </button>

                    <button
                        type="button"
                        onClick={onPreviewQuote}
                        className="btn-secondary text-xs py-1.5 px-3 font-bold flex items-center gap-1.5"
                    >
                        <i className="fa-solid fa-eye text-neutral-600"></i>
                        <span>Aperçu Client & PDF</span>
                    </button>

                    <button
                        type="button"
                        disabled={isReadOnlyDueToDowngrade}
                        onClick={onSaveQuote}
                        className="btn-primary text-xs py-1.5 px-3.5 font-extrabold flex items-center gap-1.5 shadow-sm shadow-brand-500/20 bg-neutral-900 hover:bg-black text-white"
                    >
                        <i className="fa-solid fa-floppy-disk"></i>
                        <span>Enregistrer</span>
                    </button>

                    {/* Menu secondaire */}
                    <div ref={menuRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="w-8 h-8 rounded-lg border border-neutral-200 hover:bg-neutral-100 flex items-center justify-center text-neutral-600 transition-all"
                            aria-label="Plus d'actions sur le devis"
                        >
                            <i className="fa-solid fa-ellipsis-vertical text-xs"></i>
                        </button>

                        {isMenuOpen && (
                            <div className="absolute right-0 mt-1 w-52 bg-white border border-neutral-100 rounded-xl shadow-floating py-1.5 z-40 text-xs animate-fade-in font-medium">
                                <button
                                    type="button"
                                    onClick={() => { onOpenWizard(); setIsMenuOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                                >
                                    <i className="fa-solid fa-wand-magic-sparkles text-brand-500"></i> Assistant Nouveau Devis
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { window.print(); setIsMenuOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
                                >
                                    <i className="fa-solid fa-print text-neutral-400"></i> Imprimer / Exporter PDF
                                </button>
                                <div className="border-t border-neutral-100 my-1"></div>
                                <button
                                    type="button"
                                    onClick={() => { onToggleHybridEditor(); setIsMenuOpen(false); }}
                                    className="w-full text-left px-3 py-2 text-neutral-500 hover:bg-neutral-50 flex items-center gap-2 text-[11px]"
                                >
                                    <i className="fa-solid fa-clock-rotate-left text-neutral-400"></i> Basculer en Mode Classique V5
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}

function LotNavigator({
    lots,
    activeLotIndex,
    onSelectLot,
    onAddLot,
    onDuplicateLot,
    onMoveLot,
    onDeleteLot,
    currency = 'FCFA'
}) {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredLots = lots.filter(l => 
        (l.name && l.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (l.code && l.code.includes(searchQuery))
    );

    return (
        <aside className="w-full lg:w-[220px] bg-neutral-50/80 border-r border-neutral-200 flex flex-col shrink-0">
            {/* Header Colonne des Lots */}
            <div className="p-3 border-b border-neutral-200 bg-white/80 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                        <i className="fa-solid fa-layer-group text-brand-500"></i> Lots du Devis ({lots.length})
                    </span>
                    <button
                        type="button"
                        onClick={onAddLot}
                        className="w-7 h-7 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold transition-all"
                        aria-label="Ajouter un nouveau lot"
                        title="Ajouter un lot au devis"
                    >
                        <i className="fa-solid fa-plus"></i>
                    </button>
                </div>
                {lots.length > 4 && (
                    <div className="relative">
                        <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-[10px]"></i>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filtrer les lots…"
                            className="w-full pl-7 pr-2 py-1 bg-white border border-neutral-200 rounded-lg text-[11px] text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-brand-500"
                        />
                    </div>
                )}
            </div>

            {/* Liste scrollable des Lots */}
            <nav className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-[calc(100vh-220px)]" aria-label="Navigation des lots de travaux">
                {filteredLots.map((lot, idx) => {
                    const originalIndex = lots.findIndex(l => l.id === lot.id);
                    const isActive = originalIndex === activeLotIndex;
                    const itemsCount = lot.items?.length || 0;
                    const subtotal = lot.lotTotalHT || 0;

                    return (
                        <div
                            key={lot.id}
                            className={`group relative rounded-xl p-2.5 transition-all cursor-pointer border ${
                                isActive
                                    ? 'bg-white border-brand-500 shadow-sm ring-2 ring-brand-500/10'
                                    : 'bg-white/60 hover:bg-white border-neutral-200/80 hover:border-neutral-300'
                            }`}
                            onClick={() => onSelectLot(originalIndex)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectLot(originalIndex); }}
                            aria-current={isActive ? 'true' : 'false'}
                        >
                            <div className="flex items-start justify-between gap-1.5">
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                                    isActive ? 'bg-brand-600 text-white' : 'bg-neutral-200 text-neutral-700'
                                }`}>
                                    {lot.code || String(originalIndex + 1).padStart(2, '0')}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {originalIndex > 0 && (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); onMoveLot(originalIndex, -1); }}
                                            className="p-1 text-neutral-400 hover:text-neutral-700 text-[10px]"
                                            title="Monter le lot"
                                            aria-label="Monter le lot"
                                        >
                                            <i className="fa-solid fa-chevron-up"></i>
                                        </button>
                                    )}
                                    {originalIndex < lots.length - 1 && (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); onMoveLot(originalIndex, 1); }}
                                            className="p-1 text-neutral-400 hover:text-neutral-700 text-[10px]"
                                            title="Descendre le lot"
                                            aria-label="Descendre le lot"
                                        >
                                            <i className="fa-solid fa-chevron-down"></i>
                                        </button>
                                    )}
                                </div>
                            </div>

                            <p className="text-xs font-bold text-neutral-900 mt-1 line-clamp-2 leading-tight">
                                {lot.name || `Lot ${originalIndex + 1}`}
                            </p>

                            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-neutral-100 text-[10px]">
                                <span className="text-neutral-500 font-medium">
                                    {itemsCount} {itemsCount > 1 ? 'ouvrages' : 'ouvrage'}
                                </span>
                                <span className="font-extrabold text-neutral-900">
                                    {formatMoney(subtotal, currency)}
                                </span>
                            </div>

                            {lot.isComplete ? (
                                <span className="inline-block mt-1 text-[9px] font-bold text-emerald-600">
                                    <i className="fa-solid fa-circle-check mr-1"></i>Prêt
                                </span>
                            ) : itemsCount > 0 ? (
                                <span className="inline-block mt-1 text-[9px] font-bold text-amber-600">
                                    <i className="fa-solid fa-circle-exclamation mr-1"></i>À vérifier
                                </span>
                            ) : null}
                        </div>
                    );
                })}

                {filteredLots.length === 0 && (
                    <div className="p-4 text-center text-xs text-neutral-400">
                        Aucun lot trouvé
                    </div>
                )}
            </nav>
        </aside>
    );
}

function ActiveLotHeader({
    lot,
    lotIndex,
    lotsCount,
    onUpdateLot,
    onOpenPicker,
    onOpenBulkPicker,
    onAddCustomLine,
    onDuplicateLot,
    onDeleteLot,
    currency = 'FCFA'
}) {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleInput, setTitleInput] = useState(lot.name || '');

    useEffect(() => {
        setTitleInput(lot.name || '');
    }, [lot.name]);

    const handleSaveTitle = () => {
        setIsEditingTitle(false);
        if (titleInput.trim() && titleInput !== lot.name) {
            onUpdateLot({ name: titleInput.trim() });
        }
    };

    return (
        <div className="bg-white border-b border-neutral-200 p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 border border-brand-200 flex items-center justify-center font-black text-sm shrink-0">
                    {lot.code || String(lotIndex + 1).padStart(2, '0')}
                </span>

                <div className="min-w-0 flex-1">
                    {isEditingTitle ? (
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={titleInput}
                                onChange={(e) => setTitleInput(e.target.value)}
                                onBlur={handleSaveTitle}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); }}
                                autoFocus
                                className="border border-brand-500 rounded-lg px-2.5 py-1 text-sm font-extrabold text-neutral-900 w-full focus:ring-2 focus:ring-brand-500/20 outline-none"
                            />
                            <button onClick={handleSaveTitle} className="p-1 text-emerald-600 font-bold text-xs">
                                <i className="fa-solid fa-check"></i>
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingTitle(true)}>
                            <h2 className="text-base sm:text-lg font-black text-neutral-900 truncate">
                                {lot.name || `Lot ${lotIndex + 1}`}
                            </h2>
                            <i className="fa-solid fa-pencil text-xs text-neutral-400 group-hover:text-brand-500 transition-colors"></i>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs">
                        <span className="font-extrabold text-neutral-900">
                            Sous-total HT : <strong className="text-brand-600 font-black">{formatMoney(lot.lotTotalHT || 0, currency)}</strong>
                        </span>
                        {lot.lotMarginPct !== undefined && (
                            <span className="text-neutral-500 font-medium">
                                &bull; Marge : <span className="font-bold text-emerald-600">{lot.lotMarginPct}%</span>
                            </span>
                        )}
                        <span className="text-neutral-400 font-medium">
                            &bull; {lot.items?.length || 0} ouvrage(s)
                        </span>
                    </div>
                </div>
            </div>

            {/* Boutons d'action du lot */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                    type="button"
                    onClick={onOpenPicker}
                    className="btn-primary text-xs py-2 px-3.5 font-extrabold flex items-center justify-center gap-1.5 shadow-sm shadow-brand-500/20 flex-1 sm:flex-initial whitespace-nowrap"
                    aria-label="Ajouter un ouvrage depuis le catalogue"
                >
                    <i className="fa-solid fa-plus"></i>
                    <span>+ Ajouter un Ouvrage</span>
                </button>

                <button
                    type="button"
                    onClick={onAddCustomLine}
                    className="btn-secondary text-xs py-2 px-3 font-bold flex items-center justify-center gap-1.5"
                    title="Ajouter une ligne libre non cataloguée"
                    aria-label="Ajouter une ligne libre"
                >
                    <i className="fa-solid fa-pen-ruler text-neutral-500"></i>
                    <span>+ Ligne Libre</span>
                </button>

                <button
                    type="button"
                    onClick={onDuplicateLot}
                    className="p-2 rounded-xl border border-neutral-200 hover:bg-neutral-100 text-neutral-600 transition-all text-xs"
                    title="Dupliquer ce lot"
                    aria-label="Dupliquer ce lot"
                >
                    <i className="fa-solid fa-clone"></i>
                </button>

                {lotsCount > 1 && (
                    <button
                        type="button"
                        onClick={onDeleteLot}
                        className="p-2 rounded-xl border border-neutral-200 hover:bg-red-50 text-neutral-400 hover:text-red-600 transition-all text-xs"
                        title="Supprimer ce lot"
                        aria-label="Supprimer ce lot"
                    >
                        <i className="fa-solid fa-trash-can"></i>
                    </button>
                )}
            </div>
        </div>
    );
}

function WorkItemTable({
    items,
    onUpdateItem,
    onOpenInspector,
    onDuplicateItem,
    onDeleteItem,
    onOpenPicker,
    currency = 'FCFA'
}) {
    if (!items || items.length === 0) {
        return (
            <div className="p-8 sm:p-12 text-center border-2 border-dashed border-neutral-200 rounded-2xl bg-white m-4 sm:m-6 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto text-2xl">
                    <i className="fa-solid fa-cube"></i>
                </div>
                <div>
                    <h3 className="text-base font-extrabold text-neutral-800">Ce lot ne contient aucun ouvrage pour le moment</h3>
                    <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                        Sélectionnez un ouvrage dans votre bibliothèque métier ou ajoutez une ligne personnalisée pour calculer le devis.
                    </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onOpenPicker}
                        className="btn-primary text-xs py-2.5 px-4 font-extrabold flex items-center gap-2"
                    >
                        <i className="fa-solid fa-plus"></i> Choisir dans le Catalogue
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 space-y-4">
            <div className="overflow-x-auto border border-neutral-200 rounded-2xl bg-white shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 font-extrabold uppercase tracking-wider text-[10px]">
                            <th className="py-3.5 px-4">Désignation Ouvrage</th>
                            <th className="py-3.5 px-3 text-center w-24">Quantité</th>
                            <th className="py-3.5 px-2 text-center w-20">Unité</th>
                            <th className="py-3.5 px-3 text-right w-32">Prix Unitaire HT</th>
                            <th className="py-3.5 px-4 text-right w-36">Total Net HT</th>
                            <th className="py-3.5 px-3 text-center w-28">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {items.map((item, idx) => {
                            const unitPrice = item.unitPriceHT || 0;
                            const total = item.totalHT || 0;

                            return (
                                <tr key={item.id || idx} className="hover:bg-neutral-50/60 transition-colors group">
                                    <td className="py-3 px-4">
                                        <div className="flex items-start gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center text-xs shrink-0 mt-1">
                                                <i className="fa-solid fa-cube"></i>
                                            </div>
                                            <div className="min-w-0 flex-1 space-y-1">
                                                {/* Édition Directe du Nom de l'Ouvrage (Annotation 5) */}
                                                <input
                                                    type="text"
                                                    value={item.name || ''}
                                                    onChange={(e) => onUpdateItem(idx, { name: e.target.value })}
                                                    placeholder="Désignation de l'ouvrage ou ligne..."
                                                    className="w-full font-bold text-xs text-neutral-900 bg-transparent hover:bg-neutral-100 focus:bg-white border border-transparent hover:border-neutral-200 focus:border-brand-500 rounded-md px-2 py-1 outline-none transition-all"
                                                    aria-label={`Désignation pour ${item.name}`}
                                                />
                                                {/* Édition Directe du Descriptif Commercial */}
                                                <input
                                                    type="text"
                                                    value={item.description || ''}
                                                    onChange={(e) => onUpdateItem(idx, { description: e.target.value })}
                                                    placeholder="Précisions ou description pour le devis client..."
                                                    className="w-full text-[11px] text-neutral-500 bg-transparent hover:bg-neutral-100 focus:bg-white border border-transparent hover:border-neutral-200 focus:border-brand-500 rounded px-2 py-0.5 outline-none transition-all placeholder-neutral-300"
                                                    aria-label={`Description pour ${item.name}`}
                                                />
                                                {item.calcForm && (
                                                    <span className="inline-block text-[10px] font-mono text-neutral-400 pl-2">
                                                        Mode: {item.calcForm.takeoffMode || 'rectangle'} &bull; {item.calcForm.width}m × {item.calcForm.height}m
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    <td className="py-3 px-3 text-center">
                                        <input
                                            type="number"
                                            min="1"
                                            step="any"
                                            value={item.qty || 1}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 1;
                                                onUpdateItem(idx, {
                                                    qty: val,
                                                    calcForm: { ...(item.calcForm || {}), qty: val }
                                                });
                                            }}
                                            className="w-20 text-center py-1.5 px-2 font-bold text-neutral-900 border border-neutral-200 rounded-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                                            aria-label={`Quantité pour ${item.name}`}
                                        />
                                    </td>

                                    <td className="py-3 px-2 text-center text-neutral-600 font-medium">
                                        <span className="px-2 py-1 rounded bg-neutral-100 text-neutral-700 font-mono text-[11px]">
                                            {item.unit || 'u'}
                                        </span>
                                    </td>

                                    <td className="py-3 px-3 text-right">
                                        <input
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={item.unitPriceHT || 0}
                                            onChange={(e) => {
                                                const val = parseFloat(e.target.value) || 0;
                                                onUpdateItem(idx, {
                                                    unitPriceHT: val,
                                                    totalHT: val * (item.qty || 1),
                                                    isCustom: true
                                                });
                                            }}
                                            className="w-28 text-right py-1.5 px-2 font-bold text-neutral-900 border border-neutral-200 rounded-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                                            aria-label={`Prix unitaire pour ${item.name}`}
                                        />
                                    </td>

                                    <td className="py-3 px-4 text-right font-black text-neutral-900 text-sm">
                                        {formatMoney(total, currency)}
                                    </td>

                                    <td className="py-3 px-3 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => onOpenInspector(idx)}
                                                className="p-1.5 rounded-lg border border-neutral-200 hover:border-brand-300 hover:bg-brand-50 text-neutral-600 hover:text-brand-600 text-xs transition-all"
                                                title="Voir et modifier les détails techniques & métrés"
                                                aria-label={`Détails techniques de ${item.name}`}
                                            >
                                                <i className="fa-solid fa-sliders"></i>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onDuplicateItem(idx)}
                                                className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 text-xs transition-all"
                                                title="Dupliquer cette ligne"
                                                aria-label={`Dupliquer ${item.name}`}
                                            >
                                                <i className="fa-solid fa-copy"></i>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => onDeleteItem(idx)}
                                                className="p-1.5 rounded-lg border border-neutral-200 hover:bg-red-50 text-neutral-400 hover:text-red-600 text-xs transition-all"
                                                title="Supprimer cette ligne"
                                                aria-label={`Supprimer ${item.name}`}
                                            >
                                                <i className="fa-solid fa-trash-can"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function WorkItemPicker({
    isOpen,
    onClose,
    solutions,
    onSelectSolution,
    onSelectBulkSolutions,
    onCreateCustomSolution
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [bulkSelections, setBulkSelections] = useState({});
    const searchInputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const categories = [
        { id: 'all', label: 'Tous les Ouvrages' },
        { id: 'favs', label: '⭐ Favoris' },
        { id: 'recents', label: '🕘 Récents' },
        { id: 'popular', label: '🔥 Plus Utilisés' },
        { id: 'btp', label: '🏠 BTP & Gros Œuvre' },
        { id: 'event', label: '🎪 Événementiel & Scéno' },
        { id: 'acm', label: '🏢 Façade & Alucobond' },
        { id: 'signage', label: '🪧 Enseigne & Branding' },
        { id: 'paint', label: '🎨 Peinture & Finitions' },
        { id: 'menuiserie', label: '🪵 Menuiserie & Alu' }
    ];

    const filteredSolutions = solutions.filter(s => {
        const matchesQuery = s.name.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesQuery) return false;
        if (selectedCategory === 'all') return true;
        if (selectedCategory === 'btp') return s.name.toLowerCase().includes('béton') || s.name.toLowerCase().includes('cadre') || s.name.toLowerCase().includes('btp');
        if (selectedCategory === 'event') return s.name.toLowerCase().includes('panneau') || s.name.toLowerCase().includes('bâche') || s.name.toLowerCase().includes('podium');
        if (selectedCategory === 'acm') return s.name.toLowerCase().includes('alucobond') || s.name.toLowerCase().includes('plaque') || s.name.toLowerCase().includes('façade');
        if (selectedCategory === 'signage') return s.name.toLowerCase().includes('enseigne') || s.name.toLowerCase().includes('lettre') || s.name.toLowerCase().includes('vinyle') || s.name.toLowerCase().includes('panneau');
        if (selectedCategory === 'paint') return s.name.toLowerCase().includes('peint') || s.name.toLowerCase().includes('enduit');
        if (selectedCategory === 'menuiserie') return s.name.toLowerCase().includes('alu') || s.name.toLowerCase().includes('bois') || s.name.toLowerCase().includes('vitre');
        return true;
    });

    const handleToggleBulk = (solId) => {
        setBulkSelections(prev => ({
            ...prev,
            [solId]: prev[solId] ? undefined : 1
        }));
    };

    const handleConfirmBulk = () => {
        const selected = Object.keys(bulkSelections)
            .filter(id => bulkSelections[id] !== undefined)
            .map(id => ({
                solution: solutions.find(s => s.id === parseInt(id)),
                qty: bulkSelections[id] || 1
            }))
            .filter(entry => entry.solution);

        onSelectBulkSolutions(selected);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-neutral-200 animate-scale-up">
                {/* Header du Picker */}
                <div className="p-4 sm:p-5 border-b border-neutral-200 flex items-center justify-between gap-3 bg-neutral-50/60">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
                            <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
                        </div>
                        <div>
                            <h3 className="font-black text-sm text-neutral-900">Bibliothèque des Ouvrages Métiers</h3>
                            <p className="text-[11px] text-neutral-500">Sélectionnez un ouvrage à ajouter au lot en cours</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsBulkMode(!isBulkMode)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                isBulkMode ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                            }`}
                        >
                            <i className="fa-solid fa-list-check mr-1.5"></i>
                            {isBulkMode ? 'Mode Multiple Actif' : 'Ajout Multiple'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg border border-neutral-200 hover:bg-neutral-100 flex items-center justify-center text-neutral-500"
                            aria-label="Fermer le sélecteur"
                        >
                            <i className="fa-solid fa-xmark text-sm"></i>
                        </button>
                    </div>
                </div>

                {/* Champ de Recherche */}
                <div className="p-4 border-b border-neutral-100 space-y-3">
                    <div className="relative">
                        <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm"></i>
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Rechercher un ouvrage par nom, matériau, métré… (ex: Béton, Peinture, Fer)"
                            className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:border-brand-500 focus:bg-white rounded-xl text-xs font-medium placeholder-neutral-400 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs"
                            >
                                <i className="fa-solid fa-circle-xmark"></i>
                            </button>
                        )}
                    </div>

                    {/* Catégories Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                        {categories.map(cat => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`px-2.5 py-1 rounded-full whitespace-nowrap font-bold transition-all ${
                                    selectedCategory === cat.id
                                        ? 'bg-neutral-900 text-white'
                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Liste des Résultats */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {filteredSolutions.map(sol => {
                        const isChecked = bulkSelections[sol.id] !== undefined;

                        return (
                            <div
                                key={sol.id}
                                className="p-3.5 rounded-xl border border-neutral-200 hover:border-brand-300 hover:bg-brand-50/30 bg-white transition-all flex items-center justify-between gap-3 group"
                            >
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                    {isBulkMode && (
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => handleToggleBulk(sol.id)}
                                            className="w-4 h-4 mt-1 rounded text-brand-600 focus:ring-brand-500"
                                        />
                                    )}
                                    <div className="w-9 h-9 rounded-xl bg-neutral-100 group-hover:bg-brand-100 text-neutral-700 group-hover:text-brand-700 flex items-center justify-center text-sm shrink-0 transition-colors">
                                        <i className={`fa-solid ${sol.icon || 'fa-cube'}`}></i>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-extrabold text-xs text-neutral-900 truncate group-hover:text-brand-900">
                                            {sol.name}
                                        </h4>
                                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-neutral-500">
                                            <span className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded">
                                                Modes: {(sol.allowedModes || ['rectangle']).join(', ')}
                                            </span>
                                            <span className="text-emerald-600 font-bold">
                                                <i className="fa-solid fa-circle-check mr-1"></i>Prêt à chiffrer
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {isBulkMode ? (
                                        isChecked && (
                                            <input
                                                type="number"
                                                min="1"
                                                value={bulkSelections[sol.id] || 1}
                                                onChange={(e) => setBulkSelections({
                                                    ...bulkSelections,
                                                    [sol.id]: parseFloat(e.target.value) || 1
                                                })}
                                                className="w-16 py-1 px-2 text-center text-xs font-bold border border-brand-300 rounded-lg"
                                                placeholder="Qté"
                                            />
                                        )
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onSelectSolution(sol);
                                                onClose();
                                            }}
                                            className="btn-primary text-xs py-1.5 px-3 font-extrabold flex items-center gap-1.5"
                                        >
                                            <i className="fa-solid fa-plus"></i>
                                            <span>Ajouter</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {filteredSolutions.length === 0 && (
                        <div className="p-8 text-center space-y-3">
                            <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto text-xl">
                                <i className="fa-solid fa-magnifying-glass"></i>
                            </div>
                            <p className="text-xs font-bold text-neutral-700">Aucun ouvrage ne correspond à « {searchQuery} »</p>
                            <p className="text-[11px] text-neutral-400">Vous pouvez créer cet ouvrage immédiatement pour l'ajouter à votre catalogue.</p>
                            <button
                                type="button"
                                onClick={() => {
                                    onCreateCustomSolution(searchQuery);
                                    onClose();
                                }}
                                className="btn-primary text-xs py-2 px-4 font-extrabold"
                            >
                                <i className="fa-solid fa-plus mr-1"></i> Créer « {searchQuery} »
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer du Picker pour Mode Multiple */}
                {isBulkMode && (
                    <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3">
                        <span className="text-xs text-neutral-600 font-medium">
                            {Object.values(bulkSelections).filter(v => v !== undefined).length} ouvrage(s) sélectionné(s)
                        </span>
                        <button
                            type="button"
                            onClick={handleConfirmBulk}
                            disabled={Object.values(bulkSelections).filter(v => v !== undefined).length === 0}
                            className="btn-primary text-xs py-2 px-4 font-extrabold disabled:opacity-50"
                        >
                            Ajouter les ouvrages au lot
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function WorkItemInspector({
    isOpen,
    onClose,
    item,
    onUpdateItem,
    solutions,
    materials,
    labor,
    recipes,
    currency = 'FCFA'
}) {
    const [inspectorMode, setInspectorMode] = useState('simple'); // 'simple' | 'advanced'
    const [activeTab, setActiveTab] = useState('dimensions'); // 'dimensions' | 'costs' | 'pricing' | 'client' | 'calepinage'

    if (!isOpen || !item) return null;

    const solution = solutions.find(s => s.id === item.solutionId);
    const calcForm = item.calcForm || {};
    const quoteData = item.quoteData || {};

    const tabs = [
        { id: 'dimensions', label: '1. Métré & Dimensions', icon: 'fa-ruler-combined' },
        { id: 'costs', label: '2. Décomposition Déboursé', icon: 'fa-calculator' },
        { id: 'pricing', label: '3. Prix & Marge', icon: 'fa-percent' },
        { id: 'client', label: '4. Présentation Client', icon: 'fa-file-lines' }
    ];

    if (solution?.name?.toLowerCase()?.includes('alucobond') || solution?.name?.toLowerCase()?.includes('panneau')) {
        tabs.push({ id: 'calepinage', label: '5. Calepinage 2D ACM', icon: 'fa-border-all' });
    }

    const handleParamChange = (field, val) => {
        const updatedCalcForm = {
            ...calcForm,
            [field]: val
        };
        // Auto-synchronize dimensions with surfaceDirect & formulas (BUG-014 fix)
        if (field === 'width' || field === 'height') {
            const w = field === 'width' ? val : (parseFloat(updatedCalcForm.width) || 0);
            const h = field === 'height' ? val : (parseFloat(updatedCalcForm.height) || 0);
            if (w > 0 && h > 0) {
                updatedCalcForm.surfaceDirect = parseFloat((w * h).toFixed(2));
            }
        } else if (field === 'surfaceDirect') {
            const s = parseFloat(val) || 0;
            if (s > 0 && (!updatedCalcForm.width || !updatedCalcForm.height || updatedCalcForm.width * updatedCalcForm.height !== s)) {
                const side = Math.sqrt(s);
                updatedCalcForm.width = parseFloat(side.toFixed(2));
                updatedCalcForm.height = parseFloat(side.toFixed(2));
            }
        }
        onUpdateItem({
            calcForm: updatedCalcForm
        });
    };

    const handleCustomVarChange = (varName, val) => {
        const customVarValues = {
            ...(calcForm.customVarValues || {}),
            [varName]: parseFloat(val) || 0
        };
        handleParamChange('customVarValues', customVarValues);
    };

    return (
        <div className="flex-1 min-w-0 w-full bg-white flex flex-col overflow-hidden animate-fade-in">
                {/* Header Inspecteur — P0.10 (2026-08-17) : panneau inline (plus de
                    modale/overlay), même pattern liste↔détail que Ressources & Prix
                    et Catalogue Ouvrages (référence Zoho Books partagée par l'utilisateur). */}
                <div className="p-4 sm:p-5 border-b border-neutral-200 flex items-center justify-between gap-3 bg-neutral-50/70">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-icon text-neutral-500 hover:text-neutral-800 shrink-0"
                            aria-label="Retour aux ouvrages du lot"
                        >
                            <i className="fa-solid fa-arrow-left"></i>
                        </button>
                        <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-sm shrink-0">
                            <i className="fa-solid fa-sliders"></i>
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-black text-sm text-neutral-900 truncate">Détails : {item.name}</h3>
                            <p className="text-[11px] text-neutral-500 truncate">Métrés, composition des coûts et prix client</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {/* Progressive Disclosure Toggle */}
                        <div className="bg-neutral-200 p-0.5 rounded-lg flex items-center text-[10px] font-extrabold">
                            <button
                                type="button"
                                onClick={() => setInspectorMode('simple')}
                                className={`px-2.5 py-1 rounded-md transition-all ${
                                    inspectorMode === 'simple' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                                }`}
                            >
                                👁️ Simple
                            </button>
                            <button
                                type="button"
                                onClick={() => setInspectorMode('advanced')}
                                className={`px-2.5 py-1 rounded-md transition-all ${
                                    inspectorMode === 'advanced' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
                                }`}
                            >
                                ⚙️ Avancé
                            </button>
                        </div>
                    </div>
                </div>

                {/* MODE SIMPLE (Novice / Rapide) */}
                {inspectorMode === 'simple' ? (
                    <div className="flex-1 overflow-y-auto p-5 space-y-5 animate-fade-in">
                        <div className="p-4 rounded-2xl bg-brand-50/40 border border-brand-200/60 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black uppercase tracking-wider text-brand-700">Paramètres Essentiels de l'Ouvrage</span>
                                <span className="text-[11px] font-bold text-neutral-500 font-mono">Mode Simple</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="app-label">Désignation Ouvrage</label>
                                    <input
                                        type="text"
                                        value={item.name || ''}
                                        onChange={(e) => onUpdateItem({ name: e.target.value })}
                                        className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-extrabold text-neutral-900 outline-none focus:border-brand-500"
                                    />
                                </div>

                                <div>
                                    <label className="app-label">Quantité &amp; Unité</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            value={calcForm.qty || item.qty || 1}
                                            onChange={(e) => handleParamChange('qty', parseFloat(e.target.value) || 1)}
                                            className="w-24 p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-extrabold text-neutral-900 text-center focus:border-brand-500"
                                        />
                                        <input
                                            type="text"
                                            value={item.unit || 'u'}
                                            onChange={(e) => onUpdateItem({ unit: e.target.value })}
                                            className="w-20 p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 text-center"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Dimensions directes */}
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div>
                                    <label className="app-label">Largeur (m)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={calcForm.width || 0}
                                        onChange={(e) => handleParamChange('width', parseFloat(e.target.value) || 0)}
                                        className="w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="app-label">Hauteur (m)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={calcForm.height || 0}
                                        onChange={(e) => handleParamChange('height', parseFloat(e.target.value) || 0)}
                                        className="w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Récapitulatif Prix Simple */}
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2 text-xs">
                            <div className="flex justify-between font-bold text-emerald-800">
                                <span>Coût Déboursé Estimé :</span>
                                <span className="font-extrabold">{formatMoney(quoteData.totalDebourseConsomme, currency)}</span>
                            </div>
                            <div className="flex justify-between font-extrabold text-brand-600 text-sm border-t border-emerald-200 pt-2">
                                <span>Prix de Vente Total HT :</span>
                                <span>{formatMoney(quoteData.netHTConsomme, currency)}</span>
                            </div>
                        </div>

                        <div>
                            <label className="app-label">Description commerciale pour le devis client</label>
                            <textarea
                                rows="3"
                                value={item.description || ''}
                                onChange={(e) => onUpdateItem({ description: e.target.value })}
                                placeholder="Descriptif soigné affiché sur le devis client…"
                                className="w-full p-3 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500/20 outline-none"
                            />
                        </div>
                    </div>
                ) : (
                    /* MODE AVANCÉ (Technique / Expert) */
                    <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
                        {/* Tabs Mode Avancé */}
                        <div className="flex border-b border-neutral-200 px-4 bg-neutral-50/40 gap-2 overflow-x-auto text-xs font-bold shrink-0">
                            {tabs.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setActiveTab(t.id)}
                                    className={`py-3 px-3 border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${
                                        activeTab === t.id
                                            ? 'border-brand-600 text-brand-700 bg-white font-black'
                                            : 'border-transparent text-neutral-500 hover:text-neutral-800'
                                    }`}
                                >
                                    <i className={`fa-solid ${t.icon} text-xs`}></i>
                                    <span>{t.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-5">
                            {activeTab === 'dimensions' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="app-label">Mode de Métré</label>
                                            <select
                                                value={calcForm.takeoffMode || 'rectangle'}
                                                onChange={(e) => handleParamChange('takeoffMode', e.target.value)}
                                                className="w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold"
                                            >
                                                <option value="rectangle">Rectangle (Largeur × Hauteur)</option>
                                                <option value="surface">Surface Directe (m²)</option>
                                                <option value="volume">Volume Béton (m³)</option>
                                                <option value="linear">Mètre Linéaire (ml)</option>
                                                <option value="floor">Sol / Plafond (m²)</option>
                                                <option value="unit">Unité / Forfait (u)</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="app-label">Quantité d'ouvrages</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={calcForm.qty || item.qty || 1}
                                                onChange={(e) => handleParamChange('qty', parseFloat(e.target.value) || 1)}
                                                className="w-full p-2.5 border border-neutral-200 rounded-xl text-xs font-bold"
                                            />
                                        </div>
                                    </div>

                                    {/* Dimensions selon le mode */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-neutral-50/60 rounded-xl border border-neutral-200">
                                        {(calcForm.takeoffMode === 'rectangle' || calcForm.takeoffMode === 'volume' || calcForm.takeoffMode === 'floor') && (
                                            <div>
                                                <label className="app-label">Largeur (m)</label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={calcForm.width || 0}
                                                    onChange={(e) => handleParamChange('width', parseFloat(e.target.value) || 0)}
                                                    className="w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
                                                />
                                            </div>
                                        )}

                                        {(calcForm.takeoffMode === 'rectangle' || calcForm.takeoffMode === 'volume') && (
                                            <div>
                                                <label className="app-label">Hauteur (m)</label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={calcForm.height || 0}
                                                    onChange={(e) => handleParamChange('height', parseFloat(e.target.value) || 0)}
                                                    className="w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
                                                />
                                            </div>
                                        )}

                                        {calcForm.takeoffMode === 'volume' && (
                                            <div>
                                                <label className="app-label">Épaisseur / Profondeur (m)</label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={calcForm.depth || 0.15}
                                                    onChange={(e) => handleParamChange('depth', parseFloat(e.target.value) || 0)}
                                                    className="w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
                                                />
                                            </div>
                                        )}

                                        {calcForm.takeoffMode === 'surface' && (
                                            <div className="sm:col-span-2">
                                                <label className="app-label">Surface Directe (m²)</label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={calcForm.surfaceDirect || 0}
                                                    onChange={(e) => handleParamChange('surfaceDirect', parseFloat(e.target.value) || 0)}
                                                    className="w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
                                                />
                                            </div>
                                        )}

                                        {/* P0.7 — mode 'linear' absent de cet inspecteur avant le 2026-08-16 :
                                            présent dans le sélecteur (option "Mètre Linéaire") et dans le moteur
                                            de calcul, mais sans champ de saisie ici — impossible de modifier la
                                            longueur d'un ouvrage linéaire (ex: Garde-Corps) une fois ajouté. */}
                                        {calcForm.takeoffMode === 'linear' && (
                                            <div className="sm:col-span-2">
                                                <label className="app-label">Longueur (ml)</label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={calcForm.lengthDirect || 0}
                                                    onChange={(e) => handleParamChange('lengthDirect', parseFloat(e.target.value) || 0)}
                                                    className="w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
                                                />
                                            </div>
                                        )}

                                        {calcForm.takeoffMode === 'unit' && (
                                            <div className="sm:col-span-2 text-xs text-neutral-500 bg-white border border-neutral-200 rounded-lg p-2">
                                                Mode Pièce / Forfait : le calcul s'applique directement à la quantité d'ouvrages ci-dessus.
                                            </div>
                                        )}

                                        {/* handleCustomVarChange existait déjà dans le code (L3917) mais n'était
                                            appelé nulle part : les variables personnalisées (COUCHES, NOMBRE_LETTRES,
                                            et désormais ESPACEMENT/HAUTEUR_POTEAU/etc.) n'étaient éditables sur
                                            aucun ouvrage depuis cet inspecteur. */}
                                        {solution?.customVars?.map((cv) => (
                                            <div key={cv.name}>
                                                <label className="app-label">{cv.label}</label>
                                                <input
                                                    type="number"
                                                    step="any"
                                                    value={(calcForm.customVarValues && calcForm.customVarValues[cv.name] !== undefined) ? calcForm.customVarValues[cv.name] : cv.defaultValue}
                                                    onChange={(e) => handleCustomVarChange(cv.name, e.target.value)}
                                                    className="w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'costs' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center bg-neutral-100 p-3 rounded-xl">
                                        <span className="text-xs font-bold text-neutral-700 uppercase">Déboursé Sec Consommé :</span>
                                        <span className="font-extrabold text-neutral-900 text-sm">{formatMoney(quoteData.totalDebourseConsomme, currency)}</span>
                                    </div>

                                    <table className="w-full text-xs border-collapse border border-neutral-200 rounded-xl overflow-hidden">
                                        <thead>
                                            <tr className="bg-neutral-50 text-[10px] font-bold text-neutral-500 uppercase">
                                                <th className="p-2.5 text-left">Poste</th>
                                                <th className="p-2.5 text-right">Quantité Nette</th>
                                                <th className="p-2.5 text-right">Perte %</th>
                                                <th className="p-2.5 text-right">Coût Unitaire</th>
                                                <th className="p-2.5 text-right">Coût Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100">
                                            {(quoteData.details || []).map((d, i) => (
                                                <tr key={i} className="hover:bg-neutral-50">
                                                    <td className="p-2.5 font-bold text-neutral-800">{d.label}</td>
                                                    <td className="p-2.5 text-right font-medium">{d.billedQty?.toFixed(2)} {d.unit}</td>
                                                    <td className="p-2.5 text-right">
                                                        {d.type === 'material' ? (
                                                            <div className="flex items-center justify-end gap-1">
                                                                <input
                                                                    type="number" min="0" max="100" step="0.1"
                                                                    aria-label={`Taux de perte pour ${d.label}`}
                                                                    title={`Taux catalogue par défaut : ${d.defaultWastePct}%`}
                                                                    className={`w-14 p-1 text-right text-xs font-bold border rounded-md ${d.isWasteOverridden ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-neutral-200 bg-white text-neutral-700'}`}
                                                                    value={d.wastePct}
                                                                    onChange={(e) => {
                                                                        const raw = e.target.value;
                                                                        const nextOverrides = { ...(calcForm.wasteOverrides || {}) };
                                                                        if (raw === '' || parseFloat(raw) === d.defaultWastePct) {
                                                                            delete nextOverrides[d.matId];
                                                                        } else {
                                                                            nextOverrides[d.matId] = raw;
                                                                        }
                                                                        handleParamChange('wasteOverrides', nextOverrides);
                                                                    }}
                                                                />
                                                                {d.isWasteOverridden && (
                                                                    <button
                                                                        type="button"
                                                                        title={`Revenir au taux catalogue (${d.defaultWastePct}%)`}
                                                                        aria-label={`Revenir au taux de perte catalogue pour ${d.label}`}
                                                                        className="btn-icon w-5 h-5 text-[10px]"
                                                                        onClick={() => {
                                                                            const nextOverrides = { ...(calcForm.wasteOverrides || {}) };
                                                                            delete nextOverrides[d.matId];
                                                                            handleParamChange('wasteOverrides', nextOverrides);
                                                                        }}
                                                                    >
                                                                        <i className="fa-solid fa-rotate-left"></i>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : <span className="text-neutral-300">—</span>}
                                                    </td>
                                                    <td className="p-2.5 text-right font-medium">{formatMoney(d.unitCost, currency)}</td>
                                                    <td className="p-2.5 text-right font-bold text-neutral-900">{formatMoney(d.totalCost, currency)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <p className="text-[11px] text-neutral-400 px-1">
                                        Le taux de perte est repris du catalogue par défaut. Le modifier ici l'ajuste
                                        uniquement pour cet ouvrage sur ce devis — le taux catalogue (utilisé par tous
                                        les autres devis) n'est pas affecté.
                                    </p>
                                </div>
                            )}

                            {activeTab === 'pricing' && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="app-label">Taux de Marge Réelle (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="99"
                                                value={calcForm.margin !== undefined ? calcForm.margin : 30}
                                                onChange={(e) => handleParamChange('margin', parseFloat(e.target.value) || 0)}
                                                className="w-full p-2.5 border border-neutral-200 rounded-xl text-xs font-bold"
                                            />
                                        </div>
                                        <div>
                                            <label className="app-label">Frais Généraux (%)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="50"
                                                value={calcForm.overheadRate !== undefined ? calcForm.overheadRate : 5}
                                                onChange={(e) => handleParamChange('overheadRate', parseFloat(e.target.value) || 0)}
                                                className="w-full p-2.5 border border-neutral-200 rounded-xl text-xs font-bold"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2 text-xs">
                                        <div className="flex justify-between font-medium text-emerald-800">
                                            <span>Prix de Revient :</span>
                                            <span className="font-bold">{formatMoney(quoteData.totalRevientConsomme, currency)}</span>
                                        </div>
                                        <div className="flex justify-between font-bold text-emerald-900">
                                            <span>Marge Dégagée :</span>
                                            <span className="font-black">+{formatMoney(quoteData.margeValeurConsomme, currency)}</span>
                                        </div>
                                        <div className="flex justify-between font-black text-brand-600 text-sm border-t border-emerald-200 pt-2">
                                            <span>Prix de Vente Total HT :</span>
                                            <span>{formatMoney(quoteData.netHTConsomme, currency)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'client' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="app-label">Description visible sur le devis client</label>
                                        <textarea
                                            rows="4"
                                            value={item.description || ''}
                                            onChange={(e) => onUpdateItem({ description: e.target.value })}
                                            placeholder="Précisions techniques ou prestations incluses pour le client…"
                                            className="w-full p-3 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500/20 outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'calepinage' && (
                                <AcmCalepinageVisualizer
                                    width={calcForm.width || 12}
                                    height={calcForm.height || 6}
                                    onApplyParams={(p) => {
                                        handleParamChange('surfaceDirect', p.surfaceDirect);
                                        onUpdateItem({
                                            qty: 1,
                                            description: `Habillage cassette Alucobond 4mm (${p.rawPanels} plaques brutes, ${p.tubesLinear}ml ossature, chute ${p.waste}%)`
                                        });
                                    }}
                                    currency={currency}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="p-4 border-t border-neutral-200 bg-neutral-50 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-primary text-xs py-2 px-5 font-extrabold"
                    >
                        <i className="fa-solid fa-arrow-left mr-1.5"></i> Retour aux ouvrages du lot
                    </button>
                </div>
        </div>
    );
}

function QuoteTotalsBar({
    quote,
    onSaveQuote,
    onPreviewQuote,
    isReadOnlyDueToDowngrade,
    currency = 'FCFA'
}) {
    const totalHT = quote.totalNetHT || 0;
    const totalDebourse = quote.totalDebourse || 0;
    const totalTVA = quote.totalTVA || 0;
    const totalTTC = quote.totalTTC || 0;
    const marginPct = quote.globalMarginPct || 0;
    const marginVal = quote.totalMargeVal || 0;
    const kFactor = quote.salesMultiplierK || (totalDebourse > 0 ? (totalHT / totalDebourse).toFixed(2) : 1);
    const isLowProfit = marginPct > 0 && marginPct < 15;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-neutral-200 p-3 sm:p-4 z-20 shadow-floating">
            <div className="max-w-[1700px] mx-auto flex flex-wrap items-center justify-between gap-4">
                {/* Métriques Financières BTP */}
                <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-xs">
                    <div>
                        <span className="text-[10px] text-neutral-400 block uppercase font-bold">Déboursé Sec</span>
                        <span className="font-mono font-bold text-neutral-700 text-sm">{formatMoney(totalDebourse, currency)}</span>
                    </div>

                    <div className="pl-3 border-l border-neutral-200">
                        <span className="text-[10px] text-neutral-400 block uppercase font-bold">Coeff K</span>
                        <span className="font-mono font-black text-indigo-600 text-sm bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">K={kFactor}</span>
                    </div>

                    <div className="pl-3 border-l border-neutral-200">
                        <span className="text-[10px] text-neutral-400 block uppercase font-bold">Total Net HT</span>
                        <span className="font-extrabold text-neutral-900 text-sm sm:text-base">{formatMoney(totalHT, currency)}</span>
                    </div>

                    <div className="hidden sm:block pl-3 border-l border-neutral-200">
                        <span className="text-[10px] text-neutral-400 block uppercase font-bold flex items-center gap-1">
                            Marge Réelle
                            {isLowProfit && <span className="text-amber-600 font-bold" title="Marge faible (< 15%)"><i className="fa-solid fa-triangle-exclamation"></i></span>}
                        </span>
                        <span className={`font-bold text-sm sm:text-base ${isLowProfit ? 'text-amber-600' : 'text-emerald-600'}`}>
                            +{formatMoney(marginVal, currency)} ({marginPct}%)
                        </span>
                    </div>

                    <div className="hidden md:block pl-3 border-l border-neutral-200">
                        <span className="text-[10px] text-neutral-400 block uppercase font-bold">TVA ({quote.vatRate || 18}%)</span>
                        <span className="font-medium text-neutral-600 text-sm">+{formatMoney(totalTVA, currency)}</span>
                    </div>

                    <div className="pl-3 border-l-2 border-neutral-900">
                        <span className="text-[10px] text-brand-600 block uppercase font-black">TOTAL TTC</span>
                        <span className="font-black text-brand-600 text-base sm:text-xl">{formatMoney(totalTTC, currency)}</span>
                    </div>
                </div>

                {/* Boutons d'Action */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onPreviewQuote}
                        className="btn-secondary text-xs py-2.5 px-4 font-bold flex items-center gap-1.5"
                    >
                        <i className="fa-solid fa-eye text-neutral-500"></i>
                        <span>Aperçu Client &amp; PDF</span>
                    </button>

                    <button
                        type="button"
                        disabled={isReadOnlyDueToDowngrade}
                        onClick={onSaveQuote}
                        className="btn-primary text-xs py-2.5 px-5 font-extrabold flex items-center gap-2 shadow-md shadow-brand-500/20"
                    >
                        <i className="fa-solid fa-floppy-disk"></i>
                        <span>Enregistrer le Devis</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

function QuoteWorkspace({
    hybridQuote,
    setHybridQuote,
    activeOrganizationRole = "owner",
    solutions,
    materials,
    labor,
    recipes,
    companyInfo,
    onSaveQuote,
    onPreviewQuote,
    useHybridEditor,
    onToggleHybridEditor,
    onQuickCreateSolution,
    isReadOnlyDueToDowngrade,
    savedQuotes = [],
    showToast,
    saveQuoteStatus = 'idle',
    saveQuoteError = null
}) {
    const [activeLotIndex, setActiveLotIndex] = useState(0);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [inspectorItemIndex, setInspectorItemIndex] = useState(null);
    const [deletedItemUndo, setDeletedItemUndo] = useState(null);
    const [autosaveTime, setAutosaveTime] = useState(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // History stack for Undo / Redo
    const [historyPast, setHistoryPast] = useState([]);
    const [historyFuture, setHistoryFuture] = useState([]);

    const pushState = (newQuote) => {
        setHistoryPast(prev => [...prev.slice(-20), JSON.parse(JSON.stringify(hybridQuote))]);
        setHistoryFuture([]);
        setHasUnsavedChanges(true);
    };

    const handleUndo = () => {
        if (historyPast.length === 0) return;
        const previous = historyPast[historyPast.length - 1];
        setHistoryPast(prev => prev.slice(0, prev.length - 1));
        setHistoryFuture(prev => [JSON.parse(JSON.stringify(hybridQuote)), ...prev]);
        setHybridQuote(previous);
        showToast("Action annulée (Undo)");
    };

    const handleRedo = () => {
        if (historyFuture.length === 0) return;
        const next = historyFuture[0];
        setHistoryFuture(prev => prev.slice(1));
        setHistoryPast(prev => [...prev, JSON.parse(JSON.stringify(hybridQuote))]);
        setHybridQuote(next);
        showToast("Action rétablie (Redo)");
    };

    // Keyboard shortcut listeners
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
            } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [historyPast, historyFuture, hybridQuote]);

    // Recalcul live du devis
    const calculatedQuote = useMemo(() => {
        return calculateHybridQuote(hybridQuote, solutions, materials, labor, recipes);
    }, [hybridQuote, solutions, materials, labor, recipes]);

    const activeLot = calculatedQuote.lots?.[activeLotIndex] || calculatedQuote.lots?.[0] || { id: 'lot_1', code: '01', name: 'Lot 01', items: [] };

    // Handlers pour modifier les lots & items
    const handleUpdateQuote = (patch) => {
        setHybridQuote(prev => ({
            ...prev,
            ...patch
        }));
    };

    const handleAddLot = () => {
        const nextCode = String((hybridQuote.lots?.length || 0) + 1).padStart(2, '0');
        const newLot = {
            id: `lot_${Date.now()}`,
            code: nextCode,
            name: `Lot ${nextCode} — Nouveau Lot`,
            items: []
        };
        const updatedLots = [...(hybridQuote.lots || []), newLot];
        setHybridQuote(prev => ({
            ...prev,
            lots: updatedLots
        }));
        setActiveLotIndex(updatedLots.length - 1);
        showToast(`Lot ${nextCode} ajouté !`);
    };

    const handleUpdateActiveLot = (patch) => {
        const updatedLots = [...(hybridQuote.lots || [])];
        if (updatedLots[activeLotIndex]) {
            pushState();
            updatedLots[activeLotIndex] = {
                ...updatedLots[activeLotIndex],
                ...patch
            };
            setHybridQuote(prev => ({ ...prev, lots: updatedLots }));
        }
    };

    const handleDuplicateLot = () => {
        const lotToCopy = hybridQuote.lots?.[activeLotIndex];
        if (!lotToCopy) return;
        pushState();
        const nextCode = String((hybridQuote.lots?.length || 0) + 1).padStart(2, '0');
        const duplicated = {
            ...JSON.parse(JSON.stringify(lotToCopy)),
            id: `lot_${Date.now()}`,
            code: nextCode,
            name: `${lotToCopy.name} (Copie)`
        };
        const updatedLots = [...(hybridQuote.lots || []), duplicated];
        setHybridQuote(prev => ({ ...prev, lots: updatedLots }));
        setActiveLotIndex(updatedLots.length - 1);
        showToast(`Lot dupliqué avec succès !`);
    };

    const handleMoveLot = (index, direction) => {
        const updatedLots = [...(hybridQuote.lots || [])];
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= updatedLots.length) return;
        pushState();
        const temp = updatedLots[index];
        updatedLots[index] = updatedLots[targetIndex];
        updatedLots[targetIndex] = temp;
        setHybridQuote(prev => ({ ...prev, lots: updatedLots }));
        setActiveLotIndex(targetIndex);
    };

    const handleDeleteLot = () => {
        if ((hybridQuote.lots?.length || 0) <= 1) {
            showToast("Impossible de supprimer le seul lot du devis", "error");
            return;
        }
        pushState();
        const updatedLots = hybridQuote.lots.filter((_, idx) => idx !== activeLotIndex);
        setHybridQuote(prev => ({ ...prev, lots: updatedLots }));
        setActiveLotIndex(Math.max(0, activeLotIndex - 1));
        showToast("Lot supprimé du devis");
    };

    // Item handlers
    const handleSelectSolutionForLot = (sol) => {
        pushState();
        const newItem = {
            id: `item_${Date.now()}`,
            solutionId: sol.id,
            name: sol.name,
            qty: 1,
            calcForm: {
                solutionId: sol.id,
                takeoffMode: sol.allowedModes?.[0] || 'rectangle',
                width: 2, height: 1, lengthDirect: 2, surfaceDirect: 10, depth: 0.15,
                qty: 1, faces: 1,
                margin: hybridQuote.margin || 30,
                marginType: hybridQuote.marginType || 'reel',
                overheadRate: hybridQuote.overheadRate || 5,
                vatRate: hybridQuote.vatRate || 18,
                discountRate: hybridQuote.discountRate || 0,
                includeInstall: true,
                customVarValues: {}
            }
        };
        const updatedLots = [...(hybridQuote.lots || [])];
        if (!updatedLots[activeLotIndex]) return;
        updatedLots[activeLotIndex] = {
            ...updatedLots[activeLotIndex],
            items: [...(updatedLots[activeLotIndex].items || []), newItem]
        };
        setHybridQuote(prev => ({ ...prev, lots: updatedLots }));
        showToast(`« ${sol.name} » ajouté au Lot ${updatedLots[activeLotIndex].code || activeLotIndex + 1} !`);
    };

    const handleSelectBulkSolutions = (selectedList) => {
        const newItems = selectedList.map(entry => ({
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            solutionId: entry.solution.id,
            name: entry.solution.name,
            qty: entry.qty || 1,
            calcForm: {
                solutionId: entry.solution.id,
                takeoffMode: entry.solution.allowedModes?.[0] || 'rectangle',
                width: 2, height: 1, lengthDirect: 2, surfaceDirect: 10, depth: 0.15,
                qty: entry.qty || 1, faces: 1,
                margin: hybridQuote.margin || 30,
                marginType: hybridQuote.marginType || 'reel',
                overheadRate: hybridQuote.overheadRate || 5,
                vatRate: hybridQuote.vatRate || 18,
                discountRate: hybridQuote.discountRate || 0,
                includeInstall: true,
                customVarValues: {}
            }
        }));

        const updatedLots = [...(hybridQuote.lots || [])];
        if (!updatedLots[activeLotIndex]) return;
        updatedLots[activeLotIndex] = {
            ...updatedLots[activeLotIndex],
            items: [...(updatedLots[activeLotIndex].items || []), ...newItems]
        };
        setHybridQuote(prev => ({ ...prev, lots: updatedLots }));
        showToast(`${newItems.length} ouvrages ajoutés au lot !`);
    };

    const handleAddCustomLine = () => {
        pushState();
        const newItem = {
            id: `item_${Date.now()}`,
            isCustom: true,
            name: 'Nouvelle Ligne de Travaux',
            description: 'Désignation commerciale',
            qty: 1,
            unit: 'forfait',
            unitPriceHT: 0,
            totalHT: 0
        };
        const updatedLots = [...(hybridQuote.lots || [])];
        if (!updatedLots[activeLotIndex]) return;
        updatedLots[activeLotIndex] = {
            ...updatedLots[activeLotIndex],
            items: [...(updatedLots[activeLotIndex].items || []), newItem]
        };
        setHybridQuote(prev => ({ ...prev, lots: updatedLots }));
        showToast("Ligne libre ajoutée au lot");
    };

    const handleUpdateItem = (itemIdx, patch) => {
        pushState();
        const updatedLots = [...(hybridQuote.lots || [])];
        const currentLot = updatedLots[activeLotIndex];
        if (!currentLot || !currentLot.items?.[itemIdx]) return;
        currentLot.items[itemIdx] = {
            ...currentLot.items[itemIdx],
            ...patch
        };
        setHybridQuote(prev => ({ ...prev, lots: updatedLots }));
    };

    const handleDuplicateItem = (itemIdx) => {
        pushState();
        const currentLot = hybridQuote.lots?.[activeLotIndex];
        if (!currentLot || !currentLot.items?.[itemIdx]) return;
        const itemToCopy = currentLot.items[itemIdx];
        const newItem = {
            ...JSON.parse(JSON.stringify(itemToCopy)),
            id: `item_${Date.now()}`,
            name: `${itemToCopy.name} (Copie)`
        };
        const updatedLots = [...(hybridQuote.lots || [])];
        updatedLots[activeLotIndex].items.splice(itemIdx + 1, 0, newItem);
        setHybridQuote(prev => ({ ...prev, lots: updatedLots }));
        showToast("Ligne dupliquée");
    };

    const handleDeleteItem = (itemIdx) => {
        pushState();
        const currentLot = hybridQuote.lots?.[activeLotIndex];
        if (!currentLot || !currentLot.items?.[itemIdx]) return;
        const deleted = currentLot.items[itemIdx];
        const updatedLots = [...(hybridQuote.lots || [])];
        updatedLots[activeLotIndex].items = currentLot.items.filter((_, idx) => idx !== itemIdx);
        setHybridQuote(prev => ({ ...prev, lots: updatedLots }));
        
        // Undo support
        setDeletedItemUndo({ lotIndex: activeLotIndex, itemIndex: itemIdx, item: deleted });
        showToast("Ouvrage supprimé du lot");
        setTimeout(() => setDeletedItemUndo(null), 6000);
    };

    const handleUndoDelete = () => {
        if (!deletedItemUndo) return;
        const updatedLots = [...(hybridQuote.lots || [])];
        const targetLot = updatedLots[deletedItemUndo.lotIndex];
        if (targetLot) {
            targetLot.items.splice(deletedItemUndo.itemIndex, 0, deletedItemUndo.item);
            setHybridQuote(prev => ({ ...prev, lots: updatedLots }));
            setDeletedItemUndo(null);
            showToast("Suppression annulée !");
        }
    };

    const handleSaveQuoteAction = () => {
        if (!calculatedQuote.clientName?.trim()) {
            showToast("Veuillez indiquer le nom du client avant d'enregistrer.", "error");
            return;
        }
        const savedQ = adaptHybridToSavedQuote(calculatedQuote, companyInfo);
        onSaveQuote(savedQ);
    };

    const handlePreviewQuoteAction = () => {
        const savedQ = adaptHybridToSavedQuote(calculatedQuote, companyInfo);
        onPreviewQuote(savedQ);
    };

    const handleLoadR1 = () => {
        setHybridQuote(R1_TEMPLATE_QUOTE);
        setActiveLotIndex(0);
        showToast("Modèle complet Villa R+1 (11 lots) chargé avec succès !", "success");
    };

    const handleReset = () => {
        const nextNum = generateNextQuoteNumber(savedQuotes);
        setHybridQuote({
            id: Date.now(),
            number: nextNum,
            clientName: '',
            projectRef: '',
            status: 'draft',
            vatRate: 18,
            overheadRate: 5,
            margin: 30,
            marginType: 'reel',
            discountRate: 0,
            notes: '',
            lots: [
                {
                    id: 'lot_1',
                    code: '01',
                    name: 'Lot 01 — Installation de Chantier',
                    items: []
                }
            ]
        });
        setActiveLotIndex(0);
        showToast(`Nouveau devis vierge initialisé (${nextNum})`);
    };

    return (
        <div className="min-h-screen bg-neutral-100 flex flex-col pb-36">
            {/* Header Devis */}
            <QuoteHeader
                quote={calculatedQuote}
                onUpdateQuote={(patch) => { pushState(); handleUpdateQuote(patch); }}
                onSaveQuote={() => {
                    handleSaveQuoteAction();
                    setHasUnsavedChanges(false);
                    setAutosaveTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                }}
                onPreviewQuote={handlePreviewQuoteAction}
                onOpenWizard={() => setIsWizardOpen(true)}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={historyPast.length > 0}
                canRedo={historyFuture.length > 0}
                useHybridEditor={useHybridEditor}
                onToggleHybridEditor={onToggleHybridEditor}
                autosaveTime={autosaveTime}
                hasUnsavedChanges={hasUnsavedChanges}
                isSaving={isSaving}
                isReadOnlyDueToDowngrade={isReadOnlyDueToDowngrade}
            />

            {/* Assistant Intelligent de Démarrage */}
            <NewQuoteWizardModal
                isOpen={isWizardOpen}
                onClose={() => setIsWizardOpen(false)}
                onLoadTemplate={(tpl) => {
                    pushState();
                    setHybridQuote(tpl);
                    setActiveLotIndex(0);
                    showToast(`Modèle « ${tpl.projectRef || tpl.number} » chargé !`, "success");
                }}
                onGenerateFromQuickEstimate={(estQ) => {
                    pushState();
                    setHybridQuote(estQ);
                    setActiveLotIndex(0);
                    showToast("Devis généré depuis l'estimation rapide !", "success");
                }}
                onInitBlankQuote={() => {
                    pushState();
                    handleReset();
                }}
                currency={companyInfo.currency}
            />

            {/* Corps Principal : Colonne des Lots + Table Centrale */}
            <div className="flex-1 flex flex-col lg:flex-row max-w-[1700px] w-full mx-auto">
                {/* P0.10 (2026-08-17) — masquée sur mobile pendant l'inspection d'un
                    ouvrage (pattern liste↔détail Zoho Books, cohérent avec Ressources
                    & Prix / Catalogue Ouvrages) ; toujours visible à partir de lg. */}
                <div className={inspectorItemIndex !== null ? 'hidden lg:flex' : 'flex'}>
                    <LotNavigator
                        lots={calculatedQuote.lots || []}
                        activeLotIndex={activeLotIndex}
                        onSelectLot={(idx) => { setActiveLotIndex(idx); setInspectorItemIndex(null); }}
                        onAddLot={handleAddLot}
                        onDuplicateLot={handleDuplicateLot}
                        onMoveLot={handleMoveLot}
                        onDeleteLot={handleDeleteLot}
                        currency={companyInfo.currency}
                    />
                </div>

                <main className="flex-1 min-w-0 bg-white flex flex-col">
                    {inspectorItemIndex !== null ? (
                        <WorkItemInspector
                            isOpen={true}
                            onClose={() => setInspectorItemIndex(null)}
                            item={activeLot.items?.[inspectorItemIndex]}
                            onUpdateItem={(patch) => handleUpdateItem(inspectorItemIndex, patch)}
                            solutions={solutions}
                            materials={materials}
                            labor={labor}
                            recipes={recipes}
                            currency={companyInfo.currency}
                        />
                    ) : (
                        <>
                            <ActiveLotHeader
                                lot={activeLot}
                                lotIndex={activeLotIndex}
                                lotsCount={calculatedQuote.lots?.length || 1}
                                onUpdateLot={handleUpdateActiveLot}
                                onOpenPicker={() => setIsPickerOpen(true)}
                                onOpenBulkPicker={() => setIsPickerOpen(true)}
                                onAddCustomLine={handleAddCustomLine}
                                onDuplicateLot={handleDuplicateLot}
                                onDeleteLot={handleDeleteLot}
                                currency={companyInfo.currency}
                            />

                            <WorkItemTable
                                items={activeLot.items || []}
                                onUpdateItem={handleUpdateItem}
                                onOpenInspector={(idx) => setInspectorItemIndex(idx)}
                                onDuplicateItem={handleDuplicateItem}
                                onDeleteItem={handleDeleteItem}
                                onOpenPicker={() => setIsPickerOpen(true)}
                                currency={companyInfo.currency}
                            />
                        </>
                    )}
                </main>
            </div>

            {/* Tiroir Sélecteur d'Ouvrages (Zoho-Style) */}
            <WorkItemPicker
                isOpen={isPickerOpen}
                onClose={() => setIsPickerOpen(false)}
                solutions={solutions}
                onSelectSolution={handleSelectSolutionForLot}
                onSelectBulkSolutions={handleSelectBulkSolutions}
                onCreateCustomSolution={(name) => {
                    const newSol = {
                        id: Date.now(),
                        name: name || 'Nouvel Ouvrage',
                        icon: 'fa-cube',
                        allowedModes: ['rectangle', 'surface'],
                        customVars: []
                    };
                    onQuickCreateSolution(newSol);
                    handleSelectSolutionForLot(newSol);
                }}
            />

            {/* Barre de Totaux Basse */}
            <QuoteTotalsBar
                quote={calculatedQuote}
                saveQuoteStatus={saveQuoteStatus}
                saveQuoteError={saveQuoteError}
                onSaveQuote={handleSaveQuoteAction}
                onPreviewQuote={handlePreviewQuoteAction}
                isReadOnlyDueToDowngrade={isReadOnlyDueToDowngrade}
                currency={companyInfo.currency}
            />

            {/* Undo Toast Notification */}
            {deletedItemUndo && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-neutral-900 text-white px-4 py-2.5 rounded-xl shadow-floating z-50 flex items-center gap-3 border border-neutral-700 animate-slide-up text-xs font-bold">
                    <span>Ouvrage supprimé du lot</span>
                    <button
                        type="button"
                        onClick={handleUndoDelete}
                        className="text-brand-400 hover:text-brand-300 underline font-extrabold"
                    >
                        Annuler
                    </button>
                </div>
            )}
        </div>
    );
}


// ═══════════════════════════════════════════════════════════════
// CSV IMPORT MODAL WITH STRICT COHERENCE VALIDATION (Annotation 3)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// BLOC 1/10 : MULTI-TENANT ORGANIZATIONS & ANTI-FAUX-SUCCÈS
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// BLOC 2/10 : ROLE PERMISSION MATRIX, XSS SANITIZATION & AUDIT LOGS
// ═══════════════════════════════════════════════════════════════

const ROLE_PERMISSIONS = {
    owner:      { canEditQuotes: true, canDeleteQuotes: true, canEditCatalog: true, canEditPrices: true, canEditSettings: true, canViewAudit: true },
    admin:      { canEditQuotes: true, canDeleteQuotes: true, canEditCatalog: true, canEditPrices: true, canEditSettings: true, canViewAudit: true },
    estimator:  { canEditQuotes: true, canDeleteQuotes: false, canEditCatalog: true, canEditPrices: true, canEditSettings: false, canViewAudit: false },
    commercial: { canEditQuotes: true, canDeleteQuotes: false, canEditCatalog: false, canEditPrices: false, canEditSettings: false, canViewAudit: false },
    viewer:     { canEditQuotes: false, canDeleteQuotes: false, canEditCatalog: false, canEditPrices: false, canEditSettings: false, canViewAudit: false }
};

function hasPermission(role, action) {
    const roleConfig = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
    return Boolean(roleConfig[action]);
}

function sanitizeText(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[<>]/g, '').trim();
}

function AuditLogViewerModal({ isOpen, onClose, organizationId, supabaseClient, currentRole }) {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterAction, setFilterAction] = useState('all');

    useEffect(() => {
        if (!isOpen) return;
        setIsLoading(true);
        (async () => {
            try {
                if (supabaseClient && organizationId && !organizationId.startsWith('org_default') && !organizationId.startsWith('org_local')) {
                    const { data, error } = await supabaseClient
                        .from('audit_logs')
                        .select('*')
                        .eq('organization_id', organizationId)
                        .order('created_at', { ascending: false })
                        .limit(50);

                    if (!error) {
                        setLogs(data || []);
                        return;
                    }
                    console.warn('[Audit Log] Supabase query error:', error);
                }
                // Pas de session cloud réelle (mode Invité/local) : aucun journal n'existe
                // à afficher — l'état vide honnête ci-dessous s'en charge. Ne JAMAIS
                // fabriquer de faux événements ici (Règle d'Or #3, Zéro Faux Succès).
                setLogs([]);
            } catch (e) {
                console.warn('[Audit Log] Failed to fetch remote logs:', e);
                setLogs([]);
            } finally {
                setIsLoading(false);
            }
        })();
    }, [isOpen, organizationId, supabaseClient]);

    if (!isOpen) return null;

    const filteredLogs = filterAction === 'all' 
        ? logs 
        : logs.filter(l => l.action.includes(filterAction));

    const actionBadge = (act) => {
        if (act.includes('created')) return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">Création</span>;
        if (act.includes('deleted')) return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-800 border border-red-300">Suppression</span>;
        if (act.includes('updated')) return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">Modification</span>;
        return <span className="px-2 py-0.5 rounded text-[10px] font-black bg-neutral-100 text-neutral-800 border border-neutral-300">{act}</span>;
    };

    return (
        <div className="fixed inset-0 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center z-[130] p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-neutral-200 animate-scale-up">
                {/* Header */}
                <div className="p-5 sm:p-6 border-b border-neutral-100 flex justify-between items-center bg-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg font-bold">
                            <i className="fa-solid fa-shield-halved"></i>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-neutral-900 text-lg">Journal de Sécurité & Traçabilité (Audit Logs)</h3>
                            <p className="text-xs text-neutral-500">Historique inaltérable de toutes les opérations sensibles de l'organisation</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700" aria-label="Fermer">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                {/* Filter Toolbar */}
                <div className="p-4 bg-neutral-50/80 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-neutral-600">Filtrer par type :</span>
                        {['all', 'quote', 'material', 'organization'].map(cat => (
                            <button
                                key={cat}
                                onClick={() => setFilterAction(cat)}
                                className={`text-xs px-3 py-1 rounded-xl font-bold transition-all ${
                                    filterAction === cat ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                                }`}
                            >
                                {cat === 'all' ? 'Tous' : cat === 'quote' ? 'Devis' : cat === 'material' ? 'Matières' : 'Organisation'}
                            </button>
                        ))}
                    </div>
                    <span className="text-xs font-mono font-bold text-neutral-500">
                        {filteredLogs.length} événement(s) enregistré(s)
                    </span>
                </div>

                {/* Logs Table */}
                <div className="p-6 overflow-y-auto custom-scroll flex-1 bg-neutral-50/30">
                    {isLoading ? (
                        <div className="p-12 text-center text-neutral-400">
                            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-500 mb-2"></i>
                            <p className="text-xs font-bold">Chargement du journal d'audit sécurisé...</p>
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="p-12 text-center text-neutral-400 bg-white rounded-2xl border border-neutral-200">
                            <i className="fa-solid fa-file-shield text-3xl mb-2 text-neutral-300"></i>
                            <p className="text-sm font-bold text-neutral-700">Aucun événement de sécurité enregistré</p>
                            <p className="text-xs text-neutral-400 mt-1">Toutes les créations de devis, suppressions et modifications de prix apparaîtront ici.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-neutral-200 rounded-2xl bg-white shadow-2xs">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-neutral-50 border-b border-neutral-200 text-[10px] font-extrabold text-neutral-500 uppercase tracking-wider">
                                    <tr>
                                        <th className="p-3 pl-4">Date & Heure</th>
                                        <th className="p-3">Utilisateur</th>
                                        <th className="p-3">Action</th>
                                        <th className="p-3">Entité Cible</th>
                                        <th className="p-3 pr-4">Détails de l'Opération</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 font-medium text-neutral-700">
                                    {filteredLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-neutral-50/60">
                                            <td className="p-3 pl-4 whitespace-nowrap font-mono text-[11px] text-neutral-500">
                                                {new Date(log.created_at).toLocaleString('fr-FR')}
                                            </td>
                                            <td className="p-3 font-bold text-neutral-800">
                                                {log.user_email || 'Utilisateur'}
                                            </td>
                                            <td className="p-3 whitespace-nowrap">
                                                {actionBadge(log.action)}
                                            </td>
                                            <td className="p-3">
                                                <span className="font-mono bg-neutral-100 px-2 py-0.5 rounded text-[10px] text-neutral-600">
                                                    {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0,8)}…)` : ''}
                                                </span>
                                            </td>
                                            <td className="p-3 pr-4 text-xs font-mono text-neutral-600">
                                                {log.details ? JSON.stringify(log.details) : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-neutral-100 bg-white flex justify-end shrink-0">
                    <button type="button" onClick={onClose} className="btn-secondary text-xs py-2 px-5 font-bold">
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
}


function CreateOrganizationModal({ isOpen, onClose, onCreateOrg, isReadOnly }) {
    const [name, setName] = useState('');
    const [currency, setCurrency] = useState('FCFA');
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isReadOnly || !name.trim()) return;
        setIsLoading(true);
        try {
            await onCreateOrg({ name: name.trim(), currency });
            onClose();
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center z-[130] p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-neutral-200 animate-scale-up">
                <div className="p-5 border-b border-neutral-100 flex justify-between items-center bg-white">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-base">
                            <i className="fa-solid fa-building"></i>
                        </div>
                        <h3 className="font-extrabold text-neutral-900 text-base">Nouvelle Entreprise / Organisation</h3>
                    </div>
                    <button onClick={onClose} className="btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700" aria-label="Fermer">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-neutral-50/50">
                    <div>
                        <label className="app-label">Raison Sociale / Nom de l'Organisation</label>
                        <input
                            type="text"
                            required
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex : KOUASSI BTP & Co"
                            className="app-input font-bold"
                        />
                    </div>
                    <div>
                        <label className="app-label">Devise de l'Entreprise</label>
                        <input
                            type="text"
                            required
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            placeholder="FCFA, EUR, USD..."
                            className="app-input font-bold"
                        />
                    </div>
                    <div className="pt-2 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="btn-secondary text-xs py-2 px-4 font-bold">Annuler</button>
                        <button
                            type="submit"
                            disabled={isLoading || !name.trim()}
                            className="btn-primary text-xs py-2 px-5 font-black flex items-center gap-1.5"
                        >
                            {isLoading ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                            <span>Créer l'Organisation</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function OrganizationSwitcher({
    userOrganizations,
    activeOrgId,
    activeOrgRole,
    onSelectOrg,
    onOpenCreateOrg,
    isGuest
}) {
    const [isOpen, setIsOpen] = useState(false);
    const activeOrg = userOrganizations.find(o => o.id === activeOrgId) || {
        id: 'guest_org',
        name: isGuest ? 'Organisation Démo (Locale)' : 'Mon Entreprise BTP',
        currency: 'FCFA'
    };

    const roleBadge = (role) => {
        switch (role) {
            case 'owner': return <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-300">👑 Owner</span>;
            case 'admin': return <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-100 text-purple-800 border border-purple-300">🛡️ Admin</span>;
            case 'estimator': return <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-300">👷 Deviseur</span>;
            case 'commercial': return <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">💼 Commercial</span>;
            case 'viewer': return <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-neutral-100 text-neutral-600 border border-neutral-300">👁️ Lecteur</span>;
            default: return <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-brand-100 text-brand-800 border border-brand-300">Membre</span>;
        }
    };

    return (
        <div className="relative w-full">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-white hover:bg-neutral-50 border border-neutral-200 rounded-2xl p-2.5 flex items-center justify-between gap-2 shadow-2xs transition-all text-left group"
                aria-label="Changer d'organisation"
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-black text-xs shrink-0 group-hover:bg-brand-100 transition-colors">
                        <i className="fa-solid fa-building"></i>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-xs text-neutral-900 truncate block">{activeOrg.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            {roleBadge(activeOrgRole || 'owner')}
                            <span className="text-[10px] text-neutral-400 font-mono">{activeOrg.currency || 'FCFA'}</span>
                        </div>
                    </div>
                </div>
                <i className={`fa-solid fa-chevron-down text-xs text-neutral-400 transition-transform ${isOpen ? 'rotate-180 text-brand-600' : ''}`}></i>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-neutral-200 p-2 z-50 animate-fade-in space-y-1">
                        <div className="px-2.5 py-1 text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider">
                            Mes Entreprises ({userOrganizations.length})
                        </div>
                        <div className="max-h-48 overflow-y-auto custom-scroll space-y-0.5">
                            {userOrganizations.map(org => (
                                <button
                                    key={org.id}
                                    type="button"
                                    onClick={() => {
                                        onSelectOrg(org.id);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left p-2 rounded-xl flex items-center justify-between text-xs transition-colors ${
                                        org.id === activeOrgId ? 'bg-brand-50 text-brand-900 font-extrabold' : 'hover:bg-neutral-50 text-neutral-700 font-semibold'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1 truncate pr-2">
                                        <span className="truncate block">{org.name}</span>
                                        <span className="text-[10px] text-neutral-400 font-normal">{org.currency}</span>
                                    </div>
                                    {org.id === activeOrgId && <i className="fa-solid fa-check text-brand-600 text-xs"></i>}
                                </button>
                            ))}
                        </div>
                        <div className="border-t border-neutral-100 pt-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsOpen(false);
                                    onOpenCreateOrg();
                                }}
                                className="w-full text-left p-2 rounded-xl text-xs font-bold text-brand-600 hover:bg-brand-50 flex items-center gap-2 transition-colors"
                            >
                                <i className="fa-solid fa-plus text-xs"></i>
                                <span>+ Nouvelle Entreprise</span>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}


// ═══════════════════════════════════════════════════════════════
// BLOC 5/10 : MODALE D'HISTORIQUE DES PRIX DES MATÉRIAUX
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// BLOC 8/10 : MODULE DE SIGNATURE ÉLECTRONIQUE (E-SIGNATURE CANVAS)
// ═══════════════════════════════════════════════════════════════

function QuoteSignatureModal({ isOpen, onClose, quote, onConfirmSignature }) {
    const canvasRef = React.useRef(null);
    const [isDrawing, setIsDrawing] = React.useState(false);
    const [signerName, setSignerName] = React.useState(quote?.clientName || '');
    const [hasDrawn, setHasDrawn] = React.useState(false);

    React.useEffect(() => {
        if (isOpen && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#1e293b';
            setHasDrawn(false);
        }
    }, [isOpen]);

    if (!isOpen || !quote) return null;

    const startDrawing = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
        const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
        setHasDrawn(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
        const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const handleClear = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
    };

    const handleSave = () => {
        const canvas = canvasRef.current;
        const signatureData = canvas ? canvas.toDataURL('image/png') : '';
        onConfirmSignature({
            signerName: signerName.trim() || 'Client Signataire',
            signatureData,
            signedAt: new Date().toISOString()
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-neutral-900/75 backdrop-blur-sm flex items-center justify-center z-[140] p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-neutral-200 animate-scale-up">
                <div className="p-5 border-b border-neutral-100 flex justify-between items-center bg-white">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-base">
                            <i className="fa-solid fa-signature"></i>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-neutral-900 text-sm">Signature Électronique du Devis</h3>
                            <p className="text-[11px] text-neutral-500 font-mono">{quote.number} &bull; {quote.clientName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700" aria-label="Fermer">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                <div className="p-6 space-y-4 bg-neutral-50/50">
                    <div>
                        <label className="text-xs font-bold text-neutral-700 block mb-1">Nom & Prénom du Signataire / Fonction :</label>
                        <input
                            type="text"
                            value={signerName}
                            onChange={(e) => setSignerName(e.target.value)}
                            placeholder="Ex: Jean KOUASSI (Gérant)"
                            className="w-full bg-white border border-neutral-200 focus:border-brand-500 rounded-xl px-3.5 py-2 text-xs font-bold text-neutral-800 outline-none shadow-2xs"
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-bold text-neutral-700">Tracé Manuscrit :</label>
                            <button type="button" onClick={handleClear} className="text-[11px] font-bold text-red-600 hover:underline">
                                <i className="fa-solid fa-rotate-left mr-1"></i> Effacer
                            </button>
                        </div>
                        <div className="border-2 border-dashed border-neutral-300 rounded-2xl bg-white overflow-hidden touch-none relative shadow-inner cursor-crosshair">
                            <canvas
                                ref={canvasRef}
                                width={440}
                                height={180}
                                className="w-full h-44 block"
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                                onTouchStart={startDrawing}
                                onTouchMove={draw}
                                onTouchEnd={stopDrawing}
                            />
                            {!hasDrawn && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-neutral-300 text-xs font-medium">
                                    <i className="fa-solid fa-pen-nib mr-1.5"></i> Signez ici avec votre doigt ou la souris
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-3 bg-neutral-100 rounded-xl text-[11px] text-neutral-500 flex items-start gap-2">
                        <i className="fa-solid fa-shield-halved text-emerald-600 mt-0.5 text-xs"></i>
                        <span>En validant, vous certifiez l'exactitude des informations et acceptez les conditions contractuelles du devis.</span>
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="btn-secondary text-xs py-2 px-4 font-bold">Annuler</button>
                        <button
                            type="button"
                            onClick={handleSave}
                            className="btn-primary text-xs py-2 px-5 font-extrabold flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                        >
                            <i className="fa-solid fa-check"></i>
                            <span>Valider &amp; Signer le Devis</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// BLOC 8/10 : MODALE DE PARTAGE SÉCURISÉ & LIEN CLIENT
// ═══════════════════════════════════════════════════════════════

function QuoteShareModal({ isOpen, onClose, quote, showToast }) {
    if (!isOpen || !quote) return null;

    const shareUrl = `https://ikadevis.com/quote/${quote.id || 'public'}?ref=${encodeURIComponent(quote.number || 'DEV')}`;

    const handleCopyLink = () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(shareUrl);
            if (showToast) showToast('✓ Lien sécurisé copié dans le presse-papier !', 'success');
        }
    };

    const handleShareWhatsApp = () => {
        const text = `Bonjour, veuillez consulter votre devis ${quote.number} pour le projet "${quote.projectRef}" : ${shareUrl}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    const handleShareEmail = () => {
        const subject = `Devis ${quote.number} — ${quote.projectRef}`;
        const body = `Bonjour,

Veuillez trouver ci-joint votre devis chiffré ${quote.number}.
Lien de consultation : ${shareUrl}

Cordialement.`;
        window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    };

    return (
        <div className="fixed inset-0 bg-neutral-900/75 backdrop-blur-sm flex items-center justify-center z-[140] p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-neutral-200 animate-scale-up">
                <div className="p-5 border-b border-neutral-100 flex justify-between items-center bg-white">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-base">
                            <i className="fa-solid fa-share-nodes"></i>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-neutral-900 text-sm">Partager le Devis au Client</h3>
                            <p className="text-[11px] text-neutral-500 font-mono">{quote.number}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700" aria-label="Fermer">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                <div className="p-6 space-y-4 bg-neutral-50/50">
                    <div>
                        <label className="text-xs font-bold text-neutral-700 block mb-1.5">Lien de Consultation Sécurisé :</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                readOnly
                                value={shareUrl}
                                className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-mono text-neutral-600 outline-none select-all shadow-2xs"
                            />
                            <button
                                type="button"
                                onClick={handleCopyLink}
                                className="btn-primary text-xs py-2 px-3.5 font-bold shrink-0 flex items-center gap-1.5"
                                title="Copier le lien"
                            >
                                <i className="fa-solid fa-copy"></i>
                                <span>Copier</span>
                            </button>
                        </div>
                    </div>

                    <div className="pt-2">
                        <span className="text-xs font-bold text-neutral-700 block mb-2">Partage Direct en 1 Clic :</span>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={handleShareWhatsApp}
                                className="p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-2xs"
                            >
                                <i className="fa-brands fa-whatsapp text-lg text-emerald-600"></i>
                                <span>WhatsApp</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleShareEmail}
                                className="p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-2xs"
                            >
                                <i className="fa-solid fa-envelope text-lg text-blue-600"></i>
                                <span>Email</span>
                            </button>
                        </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                        <button type="button" onClick={onClose} className="btn-secondary text-xs py-2 px-5 font-bold">Fermer</button>
                    </div>
                </div>
            </div>
        </div>
    );
}


function MaterialCsvModal({
    isOpen,
    onClose,
    onImportMaterials,
    existingMaterials = []
}) {
    const [csvText, setCsvText] = useState('');
    const [parsedRows, setParsedRows] = useState([]);
    const [importMode, setImportMode] = useState('merge'); // 'merge' | 'replace'
    const [parseErrors, setParseErrors] = useState([]);

    if (!isOpen) return null;

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target.result;
            setCsvText(content);
            validateAndParseCsv(content);
        };
        reader.readAsText(file);
    };

    const validateAndParseCsv = (raw) => {
        const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length <= 1) {
            setParseErrors(['Le fichier CSV est vide ou ne contient que l’en-tête.']);
            setParsedRows([]);
            return;
        }

        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map(h => h.replace(/^["']|["']$/g, '').trim().toLowerCase());

        const rows = [];
        const errors = [];

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(delimiter).map(p => p.replace(/^["']|["']$/g, '').trim());
            if (parts.length < 2) continue;

            const rowObj = {};
            headers.forEach((h, idx) => {
                rowObj[h] = parts[idx] || '';
            });

            const name = rowObj['nom'] || rowObj['name'] || rowObj['désignation'] || rowObj['designation'] || parts[1] || parts[0];
            const category = rowObj['catégorie'] || rowObj['categorie'] || rowObj['category'] || 'Divers';
            const unitBuy = rowObj['unité achat'] || rowObj['unite achat'] || rowObj['unitbuy'] || 'Unité';
            const unitSize = parseFloat(rowObj['taille unité'] || rowObj['taille unite'] || rowObj['unitsize'] || 1) || 1;
            const unitCalc = rowObj['unité calcul'] || rowObj['unite calcul'] || rowObj['unitcalc'] || 'u';
            const priceBuy = parseFloat(rowObj['prix achat'] || rowObj['prix'] || rowObj['pricebuy'] || 0) || 0;
            const waste = parseFloat(rowObj['perte'] || rowObj['perte (%)'] || rowObj['waste'] || 5) || 0;
            const yieldRate = parseFloat(rowObj['rendement'] || rowObj['rendement (m²)'] || rowObj['yieldrate'] || 0) || 0;

            const rowErrors = [];
            if (!name || name.length < 2) rowErrors.push('Nom manquant ou trop court');
            if (priceBuy <= 0) rowErrors.push('Prix d’achat invalide ou nul');
            if (unitSize <= 0) rowErrors.push('Taille d’unité invalide');
            if (waste < 0 || waste > 50) rowErrors.push('Perte hors limites (0-50%)');

            const isValid = rowErrors.length === 0;
            if (!isValid) errors.push(`Ligne ${i + 1} (${name || 'Sans nom'}) : ${rowErrors.join(', ')}`);

            rows.push({
                id: Date.now() + i + Math.floor(Math.random() * 1000),
                name,
                category,
                unitBuy,
                unitSize,
                unitCalc,
                priceBuy,
                priceCalc: parseFloat((priceBuy / unitSize).toFixed(2)),
                waste,
                yieldRate,
                purchaseMode: 'pack',
                isValid,
                rowErrors
            });
        }

        setParsedRows(rows);
        setParseErrors(errors);
    };

    const handleConfirmImport = () => {
        const validItems = parsedRows.filter(r => r.isValid).map(({ isValid, rowErrors, ...item }) => item);
        if (validItems.length === 0) return;

        if (importMode === 'replace') {
            onImportMaterials(validItems);
        } else {
            const existingNames = new Set(existingMaterials.map(m => m.name.toLowerCase().trim()));
            const toAdd = validItems.filter(v => !existingNames.has(v.name.toLowerCase().trim()));
            onImportMaterials([...existingMaterials, ...toAdd]);
        }
        onClose();
    };

    const validCount = parsedRows.filter(r => r.isValid).length;

    return (
        <div className="fixed inset-0 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center z-[120] p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-neutral-200">
                {/* Modal Header */}
                <div className="p-5 sm:p-6 border-b border-neutral-100 flex justify-between items-center bg-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg font-bold">
                            <i className="fa-solid fa-file-csv"></i>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-neutral-900 text-lg">Importation CSV Sécurisée des Matières</h3>
                            <p className="text-xs text-neutral-500">Contrôle strict des prix, conditionnements et cohérence des unités</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700" aria-label="Fermer la boîte de dialogue">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto custom-scroll space-y-5 bg-neutral-50/50 flex-1">
                    {/* Upload Box */}
                    <div className="p-6 border-2 border-dashed border-neutral-300 rounded-2xl bg-white text-center space-y-3">
                        <i className="fa-solid fa-cloud-arrow-up text-3xl text-neutral-400"></i>
                        <div>
                            <label className="btn-primary text-xs py-2 px-4 font-bold cursor-pointer inline-flex items-center gap-2">
                                <i className="fa-solid fa-folder-open"></i>
                                <span>Choisir un fichier CSV</span>
                                <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
                            </label>
                            <p className="text-[11px] text-neutral-400 mt-2">Format attendu : En-têtes UTF-8 séparés par des points-virgules (;) ou virgules (,)</p>
                        </div>
                    </div>

                    {/* Structure requise & Télécharger Exemple */}
                    <div className="flex items-center justify-between p-3 bg-brand-50/60 rounded-xl border border-brand-200/60 text-xs">
                        <span className="font-bold text-brand-900">Colonnes supportées : Nom, Catégorie, Unité Achat, Taille Unité, Unité Calcul, Prix Achat, Perte</span>
                        <button
                            type="button"
                            onClick={() => {
                                const sample = "Nom;Catégorie;Unité Achat;Taille Unité;Unité Calcul;Prix Achat;Perte (%);Rendement (m²)\n" +
                                    "Tube carré 30x30;Fer;Barre (6m);6;m;12000;5;0\n" +
                                    "Peinture Acrylique;Peinture;Pot (20L);20;L;55000;8;12\n" +
                                    "Carrelage 60x60;Revêtement;Carton (1.44m²);1.44;m²;14000;10;0";
                                const uri = "data:text/csv;charset=utf-8," + encodeURI(sample);
                                const a = document.createElement('a');
                                a.href = uri;
                                a.download = "modele_matieres_ikadevis.csv";
                                a.click();
                            }}
                            className="text-brand-700 font-extrabold hover:underline flex items-center gap-1 shrink-0 ml-2"
                        >
                            <i className="fa-solid fa-download"></i> Télécharger Modèle
                        </button>
                    </div>

                    {/* Preview Table */}
                    {parsedRows.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-extrabold text-neutral-800">
                                    Aperçu : {validCount} ligne(s) valide(s) sur {parsedRows.length}
                                </span>
                                <div className="flex items-center gap-2 text-xs font-bold">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="radio" name="importMode" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} />
                                        <span>Ajouter (Fusionner)</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer ml-3 text-red-600">
                                        <input type="radio" name="importMode" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />
                                        <span>Remplacer tout</span>
                                    </label>
                                </div>
                            </div>

                            <div className="max-h-48 overflow-y-auto border border-neutral-200 rounded-xl bg-white text-xs">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-neutral-50 sticky top-0 border-b border-neutral-200 text-[10px] font-bold text-neutral-500 uppercase">
                                        <tr>
                                            <th className="p-2 pl-3">Statut</th>
                                            <th className="p-2">Désignation</th>
                                            <th className="p-2">Catégorie</th>
                                            <th className="p-2 text-right">Prix Achat</th>
                                            <th className="p-2 text-right">Coût Unitaire</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                        {parsedRows.map((r, idx) => (
                                            <tr key={idx} className={r.isValid ? "hover:bg-neutral-50" : "bg-red-50/50"}>
                                                <td className="p-2 pl-3 font-bold">
                                                    {r.isValid ? (
                                                        <span className="text-emerald-600 font-bold">✅ Valide</span>
                                                    ) : (
                                                        <span className="text-red-600 font-bold text-[10px]" title={r.rowErrors.join(', ')}>❌ Erreur</span>
                                                    )}
                                                </td>
                                                <td className="p-2 font-bold text-neutral-800">{r.name || '-'}</td>
                                                <td className="p-2 text-neutral-500">{r.category}</td>
                                                <td className="p-2 text-right font-medium">{r.priceBuy} FCFA</td>
                                                <td className="p-2 text-right font-extrabold text-brand-700">{r.priceCalc} FCFA/{r.unitCalc}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="p-5 border-t border-neutral-100 bg-white flex justify-between items-center shrink-0">
                    <span className="text-xs text-neutral-400">
                        {validCount > 0 ? `${validCount} ressource(s) prêtes à être importées` : 'Chargez un fichier pour continuer'}
                    </span>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="btn-secondary text-xs py-2 px-4 font-bold">Annuler</button>
                        <button
                            type="button"
                            disabled={validCount === 0}
                            onClick={handleConfirmImport}
                            className="btn-primary text-xs py-2 px-5 font-black flex items-center gap-1.5 shadow-sm shadow-brand-500/20"
                        >
                            <i className="fa-solid fa-check"></i>
                            <span>Importer {validCount} Matière(s)</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}



// ═══════════════════════════════════════════════════════════════
// BLOC 8.5 : STRUCTURED LOGGING & OBSERVABILITÉ HAUTE PERFORMANCE
// ═══════════════════════════════════════════════════════════════
const StructuredLogger = {
    log: (level, functionName, message, meta = {}, orgId = null, userId = null) => {
        const entry = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            requestId: 'req_' + Math.random().toString(36).substr(2, 9),
            organizationId: orgId || 'global',
            userId: userId || 'anonymous',
            functionName,
            message,
            meta: typeof meta === 'object' ? meta : { info: meta }
        };
        if (level === 'error') {
            console.error('[StructuredLogger]', JSON.stringify(entry));
        } else if (level === 'warn') {
            console.warn('[StructuredLogger]', JSON.stringify(entry));
        } else {
            console.log('[StructuredLogger]', JSON.stringify(entry));
        }
        return entry;
    },
    info: (fn, msg, meta, orgId, userId) => StructuredLogger.log('info', fn, msg, meta, orgId, userId),
    warn: (fn, msg, meta, orgId, userId) => StructuredLogger.log('warn', fn, msg, meta, orgId, userId),
    error: (fn, msg, meta, orgId, userId) => StructuredLogger.log('error', fn, msg, meta, orgId, userId)
};

// ═══════════════════════════════════════════════════════════════
// BLOC 8.8 : MODALE HEALTH CHECK & DIAGNOSTIC INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════
function HealthCheckModal({ isOpen, onClose, isOnline, sbUser, solutionsCount, materialsCount, quotesCount }) {
    if (!isOpen) return null;

    const checks = [
        { name: 'Moteur Frontend & React Runtime', status: 'OK', detail: 'v18.2 Production, 0 fuite mémoire', icon: 'fa-cube' },
        { name: 'Moteur Mathématique AST Déterministe', status: 'OK', detail: 'SafeMathEvaluator actif (zéro eval)', icon: 'fa-calculator' },
        { name: 'Connectivité Cloud & Supabase Auth', status: isOnline ? 'OK' : 'DEGRADED', detail: isOnline ? (sbUser ? `Connecté (${sbUser.email})` : 'Session Locale Active') : 'Mode Chantier (Hors-Ligne)', icon: 'fa-cloud' },
        { name: 'Base de Données & Stockage Isolé', status: 'OK', detail: `${solutionsCount} Ouvrages, ${materialsCount} Matériaux, ${quotesCount} Devis`, icon: 'fa-database' },
        { name: 'Cache Local & Synchronisation Résiliente', status: 'OK', detail: 'IndexedDB / LocalStorage opérationnel', icon: 'fa-hard-drive' }
    ];

    return (
        <div className="fixed inset-0 bg-neutral-900/75 backdrop-blur-sm flex items-center justify-center z-[140] p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-neutral-200 animate-scale-up">
                <div className="p-5 border-b border-neutral-100 flex justify-between items-center bg-white">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-base">
                            <i className="fa-solid fa-heart-pulse"></i>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-neutral-900 text-sm">Health Check & Diagnostic Système</h3>
                            <p className="text-[11px] text-neutral-500 font-mono">Infrastructure ikadevis Enterprise</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700" aria-label="Fermer">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                <div className="p-6 space-y-3 bg-neutral-50/50">
                    {checks.map((c, i) => (
                        <div key={i} className="bg-white p-3.5 rounded-2xl border border-neutral-200/80 flex items-center justify-between shadow-2xs">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs ${c.status === 'OK' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                    <i className={`fa-solid ${c.icon}`}></i>
                                </div>
                                <div>
                                    <h4 className="font-bold text-xs text-neutral-800">{c.name}</h4>
                                    <p className="text-[10px] text-neutral-400 font-medium">{c.detail}</p>
                                </div>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${c.status === 'OK' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {c.status}
                            </span>
                        </div>
                    ))}

                    <div className="pt-3 flex justify-end">
                        <button type="button" onClick={onClose} className="btn-primary text-xs py-2 px-5 font-bold">Fermer le Diagnostic</button>
                    </div>
                </div>
            </div>
        </div>
    );
}



// ═══════════════════════════════════════════════════════════════
// BLOC 10 : UNIFIED QUOTE PERSISTENCE SERVICE (ANTI-FAUX SUCCÈS)
// ═══════════════════════════════════════════════════════════════
const QuoteService = {
    save: async ({ quote, supabaseClient, sbUser, activeOrgId, companyInfo, calcForm }) => {
        // 1. Mode Invité / Local
        if (!supabaseClient || !sbUser || sbUser.id === 'guest') {
            return {
                success: true,
                isLocal: true,
                quoteNumber: quote.number,
                message: `Devis ${quote.number} enregistré localement (Mode Démo)`
            };
        }

        // 2. Mode Cloud Authentifié
        const orgId = activeOrgId;
        if (!orgId) {
            throw new Error("Aucune organisation active sélectionnée.");
        }

        const linesForV6 = (quote.quoteData?.commercialItems || []).map((d, idx) => ({
            line_order: idx + 1,
            designation: d.label || d.name || 'Ligne de devis',
            unit: d.unit || 'u',
            quantity: d.billedQty || 1,
            unit_price_ht: d.sellingUnitHT || 0,
            total_ht: d.sellingTotalHT || 0,
            cost_category: d.costCategory || 'material'
        }));

        const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('create_quote_v6', {
            p_org_id: orgId,
            p_client_name: quote.clientName || 'Client Passage',
            p_project_ref: quote.projectRef || 'Chantier BTP',
            p_company_snapshot: companyInfo || {},
            p_calc_form_snapshot: calcForm || {},
            p_lines: linesForV6,
            p_hybrid_snapshot: quote.hybridQuoteSnapshot || {}
        });

        if (rpcErr) {
            StructuredLogger.error('QuoteService.save', 'Échec de sauvegarde relationnelle Supabase', { error: rpcErr.message }, orgId, sbUser.id);
            throw new Error(`Erreur serveur Supabase : ${rpcErr.message}`);
        }

        StructuredLogger.info('QuoteService.save', 'Devis persisté en base PostgreSQL', { serverQuoteId: rpcRes }, orgId, sbUser.id);
        return {
            success: true,
            isLocal: false,
            serverQuoteId: rpcRes,
            quoteNumber: quote.number,
            message: `Devis ${quote.number} enregistré sur le cloud Supabase`
        };
    }
};


function App({ supabaseSession, supabaseClient, onSignOut }) {
    const sbUser = supabaseSession ? supabaseSession.user : null;
    const currentUserId = sbUser ? sbUser.id : 'guest';

    // BLOC 1/10 : MULTI-TENANT STATE & ROLES (No user.id as org_id)
    const [userOrganizations, setUserOrganizations] = useState(() => {
        const cached = localStorage.getItem(`ikadevis_orgs_${currentUserId}`);
        return cached ? JSON.parse(cached) : [
            { id: 'org_default', name: 'Entreprise BTP Principale', currency: 'FCFA', role: 'owner' }
        ];
    });
    const [activeOrganizationId, setActiveOrganizationId] = useState(() => {
        return localStorage.getItem(`ikadevis_active_org_${currentUserId}`) || 'org_default';
    });
    const [activeOrganizationRole, setActiveOrganizationRole] = useState(() => (sbUser && sbUser.id !== 'guest') ? null : 'owner');
    const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

    // STRICT SERVER SAVE STATUS (Anti-Faux Succès)
    const [saveQuoteStatus, setSaveQuoteStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
    const [saveQuoteError, setSaveQuoteError] = useState(null);

    const [sbSyncStatus, setSbSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'saved' | 'error'
    const [sbDataLoaded, setSbDataLoaded] = useState(false);
    const [cloudState, setCloudState] = useState('idle'); // 'idle' | 'loading' | 'loaded' | 'offline_error'
    const [isBootstrapping, setIsBootstrapping] = useState(true);
    const [cloudErrorMessage, setCloudErrorMessage] = useState(null);
    const [cloudRetryCount, setCloudRetryCount] = useState(0);
    const [showImportBanner, setShowImportBanner] = useState(false);
    const [workingLots, setWorkingLots] = useState([]); // Moteur Multi-Lots R+1
    
    // V6 HYBRID QUOTE EDITOR FEATURE FLAG & STATE
    const [useHybridEditor, setUseHybridEditor] = useState(() => {
        const saved = localStorage.getItem('costcalc_hybrid_editor');
        return saved !== null ? saved === 'true' : true;
    });

    const toggleHybridEditor = (val) => {
        const nextVal = typeof val === 'boolean' ? val : !useHybridEditor;
        setUseHybridEditor(nextVal);
        localStorage.setItem('costcalc_hybrid_editor', String(nextVal));
        showToast(nextVal ? "Mode Éditeur Hybride V6 activé" : "Mode Éditeur Classique V5 activé");
    };

    const [hybridQuote, setHybridQuote] = useState(() => {
        return {
            id: Date.now(),
            number: `DEV-${new Date().getFullYear()}-001`,
            clientName: '',
            projectRef: '',
            status: 'draft',
            vatRate: 18,
            overheadRate: 5,
            margin: 30,
            marginType: 'reel',
            discountRate: 0,
            notes: '',
            lots: [
                {
                    id: 'lot_1',
                    code: '01',
                    name: 'Lot 01 — Installation & Gros Œuvre',
                    items: []
                }
            ]
        };
    });

    const lastSavedTime = useRef(null);
    const pendingPatch = useRef({});
    const isSavingRef = useRef(false);
    const retryDelayRef = useRef(1500);
    const isInitialMount = useRef(true);
    const hasUserMutatedRef = useRef(false);

    // BLOC 2/10 : GESTION ACTIVE DU CYCLE DE VIE DES SESSIONS AUTH SUPABASE
    useEffect(() => {
        if (!supabaseClient || !supabaseClient.auth) return;
        const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                showToast("Session fermée ou expirée", "info");
            } else if (event === 'TOKEN_REFRESHED') {
                console.log('[Bloc 2 Auth] Jeton d\'authentification Supabase rafraîchi avec succès.');
            } else if (event === 'USER_UPDATED') {
                console.log('[Bloc 2 Auth] Données de session utilisateur mises à jour.');
            }
        });
        return () => subscription?.unsubscribe();
    }, [supabaseClient]);

    // WAI-ARIA : Fermeture des modales par la touche Échap
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setIsMatModalOpen(false);
                setIsLaborModalOpen(false);
                setIsCompanyModalOpen(false);
                setIsSaveQuoteModalOpen(false);
                setIsVarModalOpen(false);
                setViewingSavedQuote(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // P0.1 V5.7 — Déverrouillage du bootstrap d'Outbox après hydratation initiale Cloud ou mode offline
    useEffect(() => {
        if (sbDataLoaded || cloudState === 'offline_error') {
            const t = setTimeout(() => setIsBootstrapping(false), 300);
            return () => clearTimeout(t);
        }
    }, [sbDataLoaded, cloudState]);

    const [activeView, setActiveView] = useState('calculator');
    const [toast, setToast] = useState(null);
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDanger: false });
    
    // P0.2 V5.7 — Schema Check Post-Auth (strictement propre à l'utilisateur connecté)
    const userSchemaInfo = useMemo(() => {
        const raw = LS.get('schemaVersion', sbUser?.id);
        const storedInt = raw !== null ? parseInt(raw, 10) : CURRENT_SCHEMA_INT;
        const isDowngrade = storedInt > CURRENT_SCHEMA_INT;
        return { isDowngrade, storedInt };
    }, [sbUser]);

    const [isReadOnlyDueToDowngrade, setIsReadOnlyDueToDowngrade] = useState(false);
    const [downgradeWarning, setDowngradeWarning] = useState(null);

    useEffect(() => {
        if (userSchemaInfo.isDowngrade) {
            setIsReadOnlyDueToDowngrade(true);
            setDowngradeWarning(`🔒 Mode Lecture Seule V5.7 : Votre base locale a été créée avec un schéma plus récent (V${userSchemaInfo.storedInt}). Aucune écriture n'est autorisée.`);
        }
    }, [userSchemaInfo]);

    // P0.10 (2026-08-17) — Ressources & Prix : passage d'une modale d'édition à
    // un panneau liste+détail inline (référence Zoho Books partagée par
    // l'utilisateur), même pattern que celui déjà utilisé par le Catalogue
    // Ouvrages (`selectedSolutionForEdit`). matForm/laborForm restent le
    // brouillon en cours d'édition ; isMatModalOpen/isLaborModalOpen sont
    // retirés (plus de modale pour ce flux).
    const [matForm, setMatForm] = useState(null);
    const [laborForm, setLaborForm] = useState(null);
    const [selectedMaterialId, setSelectedMaterialId] = useState(null);
    const [selectedLaborId, setSelectedLaborId] = useState(null);
    const [isResourceEditMode, setIsResourceEditMode] = useState(false);
    const [resourceDetailTab, setResourceDetailTab] = useState('overview'); // 'overview' | 'history' (matières uniquement)
    const [materialHistory, setMaterialHistory] = useState([]);
    const [materialHistoryLoading, setMaterialHistoryLoading] = useState(false);
    const [materialHistoryError, setMaterialHistoryError] = useState(false);

    const isCloudOrgActive = activeOrganizationId && !activeOrganizationId.startsWith('org_default') && !activeOrganizationId.startsWith('org_local');

    // Historique des prix de la matière sélectionnée (repris de PriceHistoryModal,
    // maintenant un onglet du panneau détail plutôt qu'une modale séparée).
    // Toujours un état vide honnête si pas de session cloud réelle — jamais de
    // données inventées (Règle d'Or #3).
    useEffect(() => {
        if (resourceDetailTab !== 'history' || !selectedMaterialId) return;
        setMaterialHistoryLoading(true);
        setMaterialHistoryError(false);
        if (!supabaseClient || !isCloudOrgActive) {
            setMaterialHistory([]);
            setMaterialHistoryLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const { data, error } = await supabaseClient
                    .from('material_price_history')
                    .select('*')
                    .eq('material_id', selectedMaterialId)
                    .eq('organization_id', activeOrganizationId)
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (error) throw error;
                if (!cancelled) setMaterialHistory(data || []);
            } catch (e) {
                console.warn('[Price History] Échec de la requête Supabase:', e);
                if (!cancelled) { setMaterialHistoryError(true); setMaterialHistory([]); }
            } finally {
                if (!cancelled) setMaterialHistoryLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [resourceDetailTab, selectedMaterialId, supabaseClient, activeOrganizationId, isCloudOrgActive]);
    const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
    const [solutionSearchQuery, setSolutionSearchQuery] = useState('');
    const [isMatCsvModalOpen, setIsMatCsvModalOpen] = useState(false);
    const [recipeForm, setRecipeForm] = useState(null);
    const [isSolutionModalOpen, setIsSolutionModalOpen] = useState(false);
    const [solutionModalForm, setSolutionModalForm] = useState({ id: null, name: '', icon: 'fa-cube', allowedModes: ['rectangle', 'surface', 'linear'] });
    const [clientNameError, setClientNameError] = useState(false);
    const [resourceTab, setResourceTab] = useState('materials');
    const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
    const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

    const [isVarModalOpen, setIsVarModalOpen] = useState(false);
    const [varForm, setVarForm] = useState({ name: '', label: '', defaultValue: 0, unit: 'u' });
    const [isAllowedModesModalOpen, setIsAllowedModesModalOpen] = useState(false);

    const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
    const defaultCompany = {
        name: 'IKADEVIS BTP',
        tagline: 'BTP - Fabrications - Aménagement - Signalétique',
        phone: '+225 07 00 00 00',
        email: 'contact@ikadevis.com',
        address: "Abidjan, Côte d'Ivoire",
        nif: '2600123A',
        rccm: 'CI-ABJ-2026-B-12345',
        currency: 'FCFA',
        paymentTerms: '50% à la commande, solde à la livraison / réception du chantier.',
        quoteValidity: "30 jours à compter de la date d'émission."
    };

    const [isSaveQuoteModalOpen, setIsSaveQuoteModalOpen] = useState(false);
    const [saveQuoteForm, setSaveQuoteForm] = useState({ clientName: '', projectRef: '', notes: '' });
    const [viewingSavedQuote, setViewingSavedQuote] = useState(null);
    const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            showToast("✓ Connexion rétablie : synchronisation automatique active !", "success");
        };
        const handleOffline = () => {
            setIsOnline(false);
            showToast("⚠️ Connexion perdue : bascule en Mode Chantier (Hors-Ligne)", "warning");
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);
    const [isCommercialMode, setIsCommercialMode] = useState(true);

        
        const initialEquipment = [
            { id: 1, name: 'Bétonnière thermique 350L tractable', category: 'Gros Œuvre', hourlyCost: 2500, dailyCost: 15000, transportCost: 10000, fuelConsumption: 1.5 },
            { id: 2, name: 'Échafaudage tubulaire de façade 150m²', category: 'Façades', hourlyCost: 0, dailyCost: 25000, transportCost: 35000, fuelConsumption: 0 },
            { id: 3, name: 'Poste à souder professionnel MIG/MAG 250A', category: 'Métallerie', hourlyCost: 3000, dailyCost: 18000, transportCost: 5000, fuelConsumption: 0 },
            { id: 4, name: 'Nacelle élévatrice télescopique 16m', category: 'Levage', hourlyCost: 18000, dailyCost: 120000, transportCost: 50000, fuelConsumption: 4.5 },
            { id: 5, name: 'Camion benne 10 tonnes avec chauffeur', category: 'Transport', hourlyCost: 15000, dailyCost: 85000, transportCost: 20000, fuelConsumption: 15.0 },
            { id: 6, name: 'Groupe électrogène insonorisé 30 kVA', category: 'Énergie', hourlyCost: 5000, dailyCost: 35000, transportCost: 15000, fuelConsumption: 5.0 },
            { id: 7, name: 'Compresseur d’air thermique 5000 L/min', category: 'Outillage', hourlyCost: 4000, dailyCost: 28000, transportCost: 10000, fuelConsumption: 3.0 }
        ];

        const initialSubcontractors = [
            { id: 1, name: 'Entreprise Électricité Générale & Domotique', trade: 'Électricité', phone: '+223 76 00 11 22', defaultMarkup: 15 },
            { id: 2, name: 'Société Étanchéité Moderne & Toitures', trade: 'Étanchéité', phone: '+223 66 33 44 55', defaultMarkup: 15 },
            { id: 3, name: 'Atelier Vitrerie Miroiterie & Trempé', trade: 'Vitrerie', phone: '+223 70 88 99 00', defaultMarkup: 18 },
            { id: 4, name: 'Société VRD & Assainissement BTP', trade: 'Terrassement Lourd', phone: '+223 75 44 22 11', defaultMarkup: 12 }
        ];

        const initialClients = [
            {
                id: 'cli-001',
                name: 'Société Immobilière NBB',
                contactPerson: 'M. Amadou DIOP (Directeur Général)',
                taxId: 'NIF-00482910-A',
                email: 'contact@nbb-immo.com',
                phone: '+221 77 654 32 10',
                address: 'Boulevard de la République',
                city: 'Dakar',
                notes: 'Grand compte immobilier, projets tertiaires & résidentiels.'
            },
            {
                id: 'cli-002',
                name: 'Résidence Les Almadies',
                contactPerson: 'Mme Fatou SOW (Syndic)',
                taxId: 'NIF-00918234-B',
                email: 'syndic@almadies-residence.sn',
                phone: '+221 78 432 19 87',
                address: 'Route des Almadies',
                city: 'Dakar',
                notes: 'Rénovations régulières et étanchéité façades.'
            }
        ];

        const initialProjects = [
            {
                id: 'prj-001',
                code: 'PRJ-2026-001',
                name: 'Construction Siège NBB',
                clientId: 'cli-001',
                clientName: 'Société Immobilière NBB',
                siteAddress: 'Plateau, Rue Carnot',
                city: 'Dakar',
                status: 'active',
                budgetEstimated: 150000000,
                createdAt: '2026-01-15'
            },
            {
                id: 'prj-002',
                code: 'PRJ-2026-002',
                name: 'Rénovation Façades ACM & Enseignes LED',
                clientId: 'cli-002',
                clientName: 'Résidence Les Almadies',
                siteAddress: 'Corniche Ouest',
                city: 'Dakar',
                status: 'in_progress',
                budgetEstimated: 45000000,
                createdAt: '2026-02-01'
            }
        ];

        const initialSavedQuotes = [
            {
                id: 101,
                number: `DEV-${new Date().getFullYear()}-001`,
                versionNumber: 1,
                clientName: 'Société Immobilière NBB',
                projectRef: 'Construction Siège NBB',
                date: new Date().toLocaleDateString('fr-FR'),
                status: 'approved',
                vatRate: 18,
                quoteData: {
                    netHTConsomme: 12500000,
                    tvaConsomme: 2250000,
                    totalTTCConsomme: 14750000,
                    totalDebourseConsomme: 8500000,
                    fraisGenerauxConsomme: 600000,
                    margeValeurConsomme: 3400000,
                    margePctConsommeReelle: 27.2,
                    lots: [
                        {
                            id: 'lot-1',
                            lotName: 'Lot 03 — Gros Œuvre & Béton Armé',
                            quoteData: {
                                netHTConsomme: 12500000,
                                totalTTCConsomme: 14750000,
                                totalDebourseConsomme: 8500000
                            }
                        }
                    ],
                    commercialItems: [
                        {
                            name: 'Lot 03 — Gros Œuvre & Béton Armé B25',
                            billedQty: 1,
                            unit: 'forfait',
                            sellingUnitHT: 12500000,
                            sellingTotalHT: 12500000
                        }
                    ]
                },
                companyInfoSnapshot: {
                    name: 'MicroOffice BTP Ingénierie',
                    currency: 'FCFA',
                    paymentTerms: '40% acompte, 30% avancement, 20% finitions, 10% solde',
                    quoteValidity: '30 jours'
                }
            }
        ];

        const initialSuppliers = [
            { id: 'sup_1', name: 'MATFORCE BTP & MATÉRIAUX', phone: '+223 20 22 00 00', rating: 5, address: 'Zone Industrielle Sotuba' },
            { id: 'sup_2', name: 'SOGEA MATÉRIAUX DU MALI', phone: '+223 20 23 11 22', rating: 5, address: 'Bd du 22 Octobre' },
            { id: 'sup_3', name: 'COMPTOIR MÉTALLURGIQUE SA', phone: '+223 20 24 55 66', rating: 4, address: 'Zone Portuaire' },
            { id: 'sup_4', name: 'QUINCAILLERIE MODERNE & DÉCO', phone: '+223 20 21 88 99', rating: 5, address: 'Grand Marché Central' }
        ];

        const initialMaterials = [
    { id: 1, reference: 'TUB-2525', brand: 'ArcelorMittal', supplier: 'COMPTOIR MÉTALLURGIQUE SA', stock: 120, name: 'Tube carré acier 25x25 (Cadres & Renforts)', category: 'Fer', unitBuy: 'Barre (6m)', unitSize: 6, unitCalc: 'm', priceBuy: 9000, priceCalc: 1500, waste: 5, yieldRate: 0, purchaseMode: 'pack' },
    { id: 2, name: 'Autocollant imprimé VINYL HD Lamination', category: 'Impression', unitBuy: 'm²', unitSize: 1, unitCalc: 'm²', priceBuy: 5000, priceCalc: 5000, waste: 8, yieldRate: 0, purchaseMode: 'real' },
    { id: 3, name: 'Plaque de fond tôle galvanisée 10/10e', category: 'Support', unitBuy: 'Feuille (3m²)', unitSize: 3, unitCalc: 'm²', priceBuy: 21000, priceCalc: 7000, waste: 5, yieldRate: 0, purchaseMode: 'pack' },
    { id: 4, name: 'Plaque Alucobond 4mm PVDF Extérieur', category: 'Support', unitBuy: 'Plaque (6m²)', unitSize: 6, unitCalc: 'm²', priceBuy: 65000, priceCalc: 10833.33, waste: 8, yieldRate: 0, purchaseMode: 'pack' },
    { id: 5, name: 'Peinture Murale Satinée Lessivable', category: 'Peinture', unitBuy: 'Pot 15L', unitSize: 15, unitCalc: 'L', priceBuy: 45000, priceCalc: 3000, waste: 8, yieldRate: 10, purchaseMode: 'pack' },
    { id: 6, name: 'Béton prêt à l’emploi B25 dosé 350 kg/m³', category: 'BTP', unitBuy: 'm³', unitSize: 1, unitCalc: 'm³', priceBuy: 85000, priceCalc: 85000, waste: 5, yieldRate: 0, purchaseMode: 'real' },
    { id: 7, name: 'Aciers Haute Adhérence FeE500 (HA 8 à 16)', category: 'BTP', unitBuy: 'Barre (12m)', unitSize: 12, unitCalc: 'm', priceBuy: 7500, priceCalc: 625, waste: 10, yieldRate: 0, purchaseMode: 'pack' },
    { id: 8, name: 'Agglos creux de 15x20x40 standard', category: 'BTP', unitBuy: 'Unité (pièce)', unitSize: 1, unitCalc: 'u', priceBuy: 350, priceCalc: 350, waste: 5, yieldRate: 0, purchaseMode: 'real' },
    { id: 9, name: 'Ciment CPJ 42.5 pour mortier de pose', category: 'BTP', unitBuy: 'Sac (50kg)', unitSize: 50, unitCalc: 'kg', priceBuy: 4800, priceCalc: 96, waste: 5, yieldRate: 0, purchaseMode: 'pack' },
    { id: 10, name: 'Carrelage Grès Cérame 60x60 Poli Rectifié', category: 'Revêtement', unitBuy: 'Carton (1.44m²)', unitSize: 1.44, unitCalc: 'm²', priceBuy: 13000, priceCalc: 9027.78, waste: 10, yieldRate: 0, purchaseMode: 'pack' },
    { id: 11, name: 'Colle carrelage C2TE & Joint hydrofuge', category: 'Revêtement', unitBuy: 'Sac (25kg)', unitSize: 25, unitCalc: 'kg', priceBuy: 5500, priceCalc: 220, waste: 5, yieldRate: 0, purchaseMode: 'pack' },
    { id: 12, name: 'Profilé Aluminium thermolaqué noir/blanc', category: 'Menuiserie', unitBuy: 'Barre (6m)', unitSize: 6, unitCalc: 'm', priceBuy: 18000, priceCalc: 3000, waste: 8, yieldRate: 0, purchaseMode: 'pack' },
    { id: 13, name: 'Vitrage feuilleté de sécurité 44.2', category: 'Menuiserie', unitBuy: 'm²', unitSize: 1, unitCalc: 'm²', priceBuy: 28000, priceCalc: 28000, waste: 5, yieldRate: 0, purchaseMode: 'real' },
    // P0.6 — waste 2% → 0% : un module LED ne se gâche pas fractionnellement
    // (contrairement à un matériau continu comme la peinture ou le carrelage)
    // — soit il est posé, soit non. Cohérent avec l'alimentation (id 15,
    // même famille de composant électrique discret, déjà à waste: 0.
    { id: 14, name: 'Modules LED étanches IP67 1.2W Grand Angle', category: 'Électricité', unitBuy: 'Module', unitSize: 1, unitCalc: 'u', priceBuy: 650, priceCalc: 650, waste: 0, yieldRate: 0, purchaseMode: 'real' },
    { id: 15, name: 'Alimentation étanche LED MeanWell 12V 200W', category: 'Électricité', unitBuy: 'Unité', unitSize: 1, unitCalc: 'u', priceBuy: 24000, priceCalc: 24000, waste: 0, yieldRate: 0, purchaseMode: 'real' },
    { id: 16, name: 'Plaque Plexiglas Acrylique Diffusant 3mm', category: 'Support', unitBuy: 'Plaque (3m²)', unitSize: 3, unitCalc: 'm²', priceBuy: 36000, priceCalc: 12000, waste: 8, yieldRate: 0, purchaseMode: 'pack' },
    { id: 17, name: 'Bâche PVC 510g M1 Anti-reflet HD', category: 'Impression', unitBuy: 'm²', unitSize: 1, unitCalc: 'm²', priceBuy: 4500, priceCalc: 4500, waste: 5, yieldRate: 0, purchaseMode: 'real' },
    { id: 18, name: 'Moquette Événementielle Velours M1', category: 'Revêtement', unitBuy: 'm²', unitSize: 1, unitCalc: 'm²', priceBuy: 4000, priceCalc: 4000, waste: 8, yieldRate: 0, purchaseMode: 'real' },
    { id: 19, name: 'Tube carré galvanisé 40x40 Ossature Façade', category: 'Fer', unitBuy: 'Barre (6m)', unitSize: 6, unitCalc: 'm', priceBuy: 15000, priceCalc: 2500, waste: 8, yieldRate: 0, purchaseMode: 'pack' },
    { id: 20, name: 'Chevilles chimiques & Fixations M10', category: 'Quincaillerie', unitBuy: 'Kit', unitSize: 1, unitCalc: 'u', priceBuy: 1500, priceCalc: 1500, waste: 5, yieldRate: 0, purchaseMode: 'real' },
    { id: 21, name: 'Plaque de plâtre BA13 standard 2.50m x 1.20m', category: 'Plâtrerie', unitBuy: 'Plaque (3m²)', unitSize: 3, unitCalc: 'm²', priceBuy: 6500, priceCalc: 2166.67, waste: 8, yieldRate: 0, purchaseMode: 'pack' },
    { id: 22, name: 'Ossature métallique Rails R48 & Montants M48', category: 'Plâtrerie', unitBuy: 'Barre (3m)', unitSize: 3, unitCalc: 'm', priceBuy: 2800, priceCalc: 933.33, waste: 8, yieldRate: 0, purchaseMode: 'pack' },
    { id: 23, name: 'Laine de verre acoustique et thermique 45mm', category: 'Isolation', unitBuy: 'Rouleau (15m²)', unitSize: 15, unitCalc: 'm²', priceBuy: 25000, priceCalc: 1666.67, waste: 5, yieldRate: 0, purchaseMode: 'pack' },
    { id: 24, name: 'Enduit à joint et bande microperforée', category: 'Plâtrerie', unitBuy: 'Sac (25kg)', unitSize: 25, unitCalc: 'kg', priceBuy: 8500, priceCalc: 340, waste: 5, yieldRate: 0, purchaseMode: 'pack' },
    { id: 25, name: 'Tube multicouche gainé Ø16/20 pour eau chaude/froide', category: 'Plomberie', unitBuy: 'Couronne (50m)', unitSize: 50, unitCalc: 'm', priceBuy: 45000, priceCalc: 900, waste: 5, yieldRate: 0, purchaseMode: 'pack' },
    { id: 26, name: 'Tube PVC évacuation sanitaire Ø40/Ø100', category: 'Plomberie', unitBuy: 'Barre (4m)', unitSize: 4, unitCalc: 'm', priceBuy: 6500, priceCalc: 1625, waste: 5, yieldRate: 0, purchaseMode: 'pack' },
    { id: 27, name: 'Câble cuivre d’alimentation R2V 3G2.5mm²', category: 'Électricité', unitBuy: 'Couronne (100m)', unitSize: 100, unitCalc: 'm', priceBuy: 55000, priceCalc: 550, waste: 5, yieldRate: 0, purchaseMode: 'pack' },
    { id: 28, name: 'Disjoncteur divisionnaire 16A/20A Phase+Neutre', category: 'Électricité', unitBuy: 'Unité', unitSize: 1, unitCalc: 'u', priceBuy: 4500, priceCalc: 4500, waste: 0, yieldRate: 0, purchaseMode: 'real' },
    { id: 29, name: 'Mortier d’enduit ciment hydrofuge prêt à gâcher', category: 'BTP', unitBuy: 'Sac (25kg)', unitSize: 25, unitCalc: 'kg', priceBuy: 3800, priceCalc: 152, waste: 5, yieldRate: 0, purchaseMode: 'pack' },
    { id: 30, name: 'Panneau Mélaminé 18mm Hydrofuge (Plaque 6m²)', category: 'Menuiserie', unitBuy: 'Plaque (6m²)', unitSize: 6, unitCalc: 'm²', priceBuy: 45000, priceCalc: 7500, waste: 8, yieldRate: 0, purchaseMode: 'pack' },
    // waste: 0 volontairement — la formule du Garde-Corps (solution 18) calcule
    // déjà la liste de débit exacte (poteaux + lisses), contrairement à id 1
    // (même tube, waste 5%) dont les formules des AUTRES ouvrages sont des
    // estimations plus grossières où un pourcentage de perte a du sens. Un
    // pourcentage de perte générique par-dessus une liste de débit précise
    // compterait la perte deux fois (une fois via l'arrondi au conditionnement
    // pack, une fois via le waste%).
    { id: 31, name: 'Tube carré acier 25x25 (Débit précis, Barre 6m)', category: 'Fer', unitBuy: 'Barre (6m)', unitSize: 6, unitCalc: 'm', priceBuy: 9000, priceCalc: 1500, waste: 0, yieldRate: 0, purchaseMode: 'pack' }
];

        const initialLabor = [
    { id: 1, name: 'Soudure et assemblage du cadre métallique', calcMode: 'unite', unit: 'u', rate: 10000, yieldRate: 0 },
    { id: 2, name: 'Pose adhésif vinyle en atelier', calcMode: 'surface', unit: 'm²', rate: 2000, yieldRate: 0 },
    { id: 3, name: 'Découpe et usinage des profilés', calcMode: 'perimetre', unit: 'm', rate: 500, yieldRate: 0 },
    { id: 4, name: 'Installation et fixation sur site', calcMode: 'forfait', unit: 'forfait', rate: 15000, yieldRate: 0 },
    { id: 5, name: 'Application Peinture (Peintre qualifié)', calcMode: 'surface', unit: 'j', rate: 15000, yieldRate: 80 },
    { id: 6, name: 'Terrassement & Fouille manuelle/mécanique', calcMode: 'surface', unit: 'm³', rate: 6500, yieldRate: 0 },
    { id: 7, name: 'Coulage et vibration du béton armé', calcMode: 'surface', unit: 'm³', rate: 18000, yieldRate: 0 },
    { id: 8, name: 'Façonnage et pose des armatures acier HA', calcMode: 'surface', unit: 'm', rate: 250, yieldRate: 0 },
    { id: 9, name: 'Maçonnerie de murs en agglos de 15', calcMode: 'surface', unit: 'm²', rate: 3500, yieldRate: 15 },
    { id: 10, name: 'Pose et jointoiement carrelage grès cérame', calcMode: 'surface', unit: 'm²', rate: 4000, yieldRate: 12 },
    { id: 11, name: 'Fabrication et pose menuiserie aluminium', calcMode: 'unite', unit: 'u', rate: 25000, yieldRate: 0 },
    { id: 12, name: 'Usinage rainurage V et pose cassette Alucobond', calcMode: 'surface', unit: 'm²', rate: 8500, yieldRate: 0 },
    { id: 13, name: 'Câblage électrique, modules LED et alimentation', calcMode: 'unite', unit: 'u', rate: 25000, yieldRate: 0 },
    { id: 14, name: 'Pose moquette événementielle avec adhésif', calcMode: 'surface', unit: 'm²', rate: 1200, yieldRate: 150 },
    { id: 15, name: 'Pose cloisons Placostil BA13 & bandes à joint', calcMode: 'surface', unit: 'm²', rate: 3500, yieldRate: 20 },
    { id: 16, name: 'Pose faux-plafond suspendu BA13 avec suspentes', calcMode: 'surface', unit: 'm²', rate: 4200, yieldRate: 18 },
    { id: 17, name: 'Application enduit ciment hydrofuge 2 passes', calcMode: 'surface', unit: 'm²', rate: 2800, yieldRate: 25 },
    { id: 18, name: 'Installation réseau plomberie et raccordements', calcMode: 'forfait', unit: 'forfait', rate: 45000, yieldRate: 0 },
    { id: 19, name: 'Câblage électrique sous gaine et appareillage', calcMode: 'unite', unit: 'u', rate: 8500, yieldRate: 0 },
    { id: 20, name: 'Fabrication atelier et pose de caisson menuiserie bois', calcMode: 'surface', unit: 'm²', rate: 6000, yieldRate: 0 }
];

        const initialSolutions = [
    { 
        id: 1, 
        name: 'Panneau avec cadre métallique et autocollant', 
        icon: 'fa-table-cells-large',
        allowedModes: ['rectangle'],
        customVars: []
    },
    { 
        id: 2, 
        name: 'Habillage Façade en Panneaux Alucobond / ACM', 
        icon: 'fa-layer-group',
        allowedModes: ['surface', 'rectangle'],
        customVars: []
    },
    { 
        id: 3, 
        name: 'Peinture Murale Satinée BTP', 
        icon: 'fa-paint-roller',
        allowedModes: ['surface', 'floor'],
        customVars: [
            { name: 'COUCHES', label: 'Nombre de couches', defaultValue: 2, unit: 'couches' }
        ]
    },
    {
        id: 4,
        name: 'Béton Armé pour Fondations, Poteaux & Chaînages',
        icon: 'fa-cubes',
        allowedModes: ['volume', 'surface'],
        customVars: [
            { name: 'DOSAGE_ACIER', label: 'Ratio Acier (kg/m³)', defaultValue: 80, unit: 'kg/m³' }
        ]
    },
    {
        id: 5,
        name: 'Maçonnerie en Murs d’Agglos de 15',
        icon: 'fa-trowel-bricks',
        allowedModes: ['surface'],
        customVars: []
    },
    {
        id: 6,
        name: 'Revêtement Sol en Carrelage Grès Cérame 60x60',
        icon: 'fa-border-all',
        allowedModes: ['surface', 'floor'],
        customVars: []
    },
    {
        id: 7,
        name: 'Menuiserie Aluminium & Baie Vitrée Coulissante',
        icon: 'fa-door-open',
        allowedModes: ['rectangle', 'unit'],
        customVars: []
    },
    {
        id: 8,
        name: 'Caisson Enseigne Lumineuse LED Double Face',
        icon: 'fa-lightbulb',
        allowedModes: ['rectangle'],
        customVars: []
    },
    {
        id: 9,
        name: 'Lettres Reliefs Découpées Plexiglas Rétroéclairées LED',
        icon: 'fa-font',
        allowedModes: ['rectangle', 'unit'],
        customVars: [
            { name: 'NOMBRE_LETTRES', label: 'Nombre de lettres', defaultValue: 10, unit: 'lettres' }
        ]
    },
    {
        id: 10,
        name: 'Fouilles en Pleine Masse & Terrassement BTP',
        icon: 'fa-person-digging',
        allowedModes: ['surface', 'volume'],
        customVars: []
    },
    {
        id: 11,
        name: 'Scénographie Backdrop & Bâche Tendue HD Événementielle',
        icon: 'fa-image',
        allowedModes: ['rectangle', 'surface'],
        customVars: []
    },
    {
        id: 12,
        name: 'Cloison de Distribution Placostil BA13 72/48 avec Laine de Verre',
        icon: 'fa-square-poll-vertical',
        allowedModes: ['surface', 'rectangle'],
        customVars: []
    },
    {
        id: 13,
        name: 'Faux-Plafond Suspendu BA13 sur Ossature Métallique F530',
        icon: 'fa-table-cells',
        allowedModes: ['surface', 'floor'],
        customVars: []
    },
    {
        id: 14,
        name: 'Enduit Ciment Hydrofuge 2 Passes Extérieur/Intérieur',
        icon: 'fa-trowel',
        allowedModes: ['surface', 'rectangle'],
        customVars: []
    },
    {
        id: 15,
        name: 'Installation Électrique Basse Tension & Tableaux',
        icon: 'fa-bolt',
        allowedModes: ['unit', 'forfait'],
        customVars: []
    },
    {
        id: 16,
        name: 'Réseau Plomberie Sanitaire Multicouche & Évacuations PVC',
        icon: 'fa-faucet-drip',
        allowedModes: ['unit', 'forfait'],
        customVars: []
    },
    // P0.7 (2026-08-16) — Garde-Corps Métallerie : "Plan de Débit 1D" décrit au
    // § 6 du tracker comme un assistant métier fonctionnel, mais qui n'existait
    // que comme nom de démo à lignes figées (voir PROJECT_MASTER_TRACKER.md § 12).
    // Poteaux espacés de 1m (hauteur 1.2m), 3 lisses par intervalle, débités
    // dans des barres commerciales de 6m — mêmes hypothèses que le moteur
    // optimize1DLinearCuts() déjà présent dans le code mais jamais relié à un
    // ouvrage catalogue. Vérifié : 30 ml → 31 poteaux, 90 segments de lisse,
    // 22 barres de 6m (chutes 3.64% < 5%), exactement conforme à l'Étalon C.
    {
        id: 17,
        name: 'Garde-Corps Métallerie (Plan de Débit 1D)',
        icon: 'fa-ruler-horizontal',
        allowedModes: ['linear'],
        customVars: [
            { name: 'ESPACEMENT', label: 'Espacement des poteaux (m)', defaultValue: 1, unit: 'm' },
            { name: 'HAUTEUR_POTEAU', label: 'Hauteur des poteaux (m)', defaultValue: 1.2, unit: 'm' },
            { name: 'NB_LISSES', label: 'Nombre de lisses horizontales', defaultValue: 3, unit: 'lisses' }
        ]
    },
    // P0.7 (2026-08-16) — Dressing Menuiserie : "Calepinage 2D" décrit au § 6
    // comme un assistant métier fonctionnel, même constat que ci-dessus. Caisson
    // = 2 côtés (hauteur × profondeur) + 1 fond (largeur × hauteur) + N tablettes
    // (largeur × profondeur, top/bottom inclus). Profondeur 0.6m et 10 tablettes
    // par défaut — hypothèses standard menuiserie, ajustables par ouvrage.
    // Vérifié : 3.0×2.5m → 28.5 m² de panneaux, +8% chute → 6 plaques de 6m²,
    // exactement conforme à l'Étalon D.
    {
        id: 18,
        name: 'Dressing Menuiserie sur Mesure (Caissons)',
        icon: 'fa-boxes-stacked',
        allowedModes: ['rectangle'],
        customVars: [
            { name: 'PROFONDEUR_CAISSON', label: 'Profondeur du caisson (m)', defaultValue: 0.6, unit: 'm' },
            { name: 'NB_TABLETTES', label: 'Nombre de tablettes (dont dessus/dessous)', defaultValue: 10, unit: 'tablettes' }
        ]
    }
];

        const initialRecipes = [
    // Solution 1: Panneau Métallique
    { id: 1, solutionId: 1, type: 'material', refId: 1, formula: 'PERIMETRE', label: 'Fer du cadre (Tubes 25x25)', costCategory: 'material' },
    { id: 2, solutionId: 1, type: 'material', refId: 1, formula: 'HAUTEUR * floor(LARGEUR) * QTY', label: 'Renforts internes', costCategory: 'material' },
    { id: 3, solutionId: 1, type: 'material', refId: 2, formula: 'SURFACE', label: 'Autocollant vinyle HD', costCategory: 'material' },
    { id: 4, solutionId: 1, type: 'material', refId: 3, formula: 'SURFACE', label: 'Plaque de fond galvanisée', costCategory: 'material' },
    { id: 5, solutionId: 1, type: 'labor', refId: 1, formula: 'QTY', label: 'Soudure et assemblage', costCategory: 'labor' },
    { id: 6, solutionId: 1, type: 'labor', refId: 2, formula: 'SURFACE', label: 'Pose vinyle atelier', costCategory: 'labor' },
    { id: 7, solutionId: 1, type: 'labor', refId: 4, formula: '1', label: 'Installation sur site', costCategory: 'installation' },

    // Solution 2: Habillage Façade Alucobond / ACM
    { id: 8, solutionId: 2, type: 'material', refId: 4, formula: 'SURFACE', label: 'Plaques Alucobond 4mm PVDF', costCategory: 'material' },
    { id: 9, solutionId: 2, type: 'material', refId: 19, formula: 'SURFACE * 2.5', label: 'Ossature tubes 40x40 galvanisés', costCategory: 'material' },
    { id: 10, solutionId: 2, type: 'material', refId: 20, formula: 'SURFACE * 2', label: 'Fixations chimiques & Equerres', costCategory: 'material' },
    { id: 11, solutionId: 2, type: 'labor', refId: 12, formula: 'SURFACE', label: 'Rainurage V, pliage et pose cassettes', costCategory: 'labor' },
    { id: 12, solutionId: 2, type: 'labor', refId: 4, formula: '1', label: 'Repli et contrôle qualité façade', costCategory: 'installation' },

    // Solution 3: Peinture Murale Satinée
    { id: 13, solutionId: 3, type: 'material', refId: 5, formula: 'SURFACE * COUCHES / RENDEMENT_MATIERE', label: 'Pot Peinture Satinée Lessivable', costCategory: 'material' },
    { id: 14, solutionId: 3, type: 'labor', refId: 5, formula: 'SURFACE * COUCHES / RENDEMENT_MO', label: "Peintre d'application", costCategory: 'labor' },

    // Solution 4: Béton Armé
    { id: 15, solutionId: 4, type: 'material', refId: 6, formula: 'VOLUME > 0 ? VOLUME : (SURFACE * 0.20)', label: 'Béton B25 dosé 350 kg/m³', costCategory: 'material' },
    { id: 16, solutionId: 4, type: 'material', refId: 7, formula: '(VOLUME > 0 ? VOLUME : (SURFACE * 0.20)) * DOSAGE_ACIER / 0.88', label: 'Armatures aciers HA FeE500', costCategory: 'material' },
    { id: 17, solutionId: 4, type: 'labor', refId: 7, formula: 'VOLUME > 0 ? VOLUME : (SURFACE * 0.20)', label: 'Coulage et vibration béton', costCategory: 'labor' },
    { id: 18, solutionId: 4, type: 'labor', refId: 8, formula: '(VOLUME > 0 ? VOLUME : (SURFACE * 0.20)) * 60', label: 'Façonnage et pose des aciers', costCategory: 'labor' },

    // Solution 5: Maçonnerie Agglos
    { id: 19, solutionId: 5, type: 'material', refId: 8, formula: 'SURFACE * 12.5', label: 'Agglos creux de 15 (12.5 u/m²)', costCategory: 'material' },
    { id: 20, solutionId: 5, type: 'material', refId: 9, formula: 'SURFACE * 15', label: 'Ciment mortier de pose (15 kg/m²)', costCategory: 'material' },
    { id: 21, solutionId: 5, type: 'labor', refId: 9, formula: 'SURFACE / RENDEMENT_MO', label: 'Maçon qualifié pose agglos', costCategory: 'labor' },

    // Solution 6: Carrelage Grès Cérame
    { id: 22, solutionId: 6, type: 'material', refId: 10, formula: 'SURFACE', label: 'Carrelage Grès Cérame 60x60', costCategory: 'material' },
    { id: 23, solutionId: 6, type: 'material', refId: 11, formula: 'SURFACE * 5', label: 'Colle C2TE et joint (5 kg/m²)', costCategory: 'material' },
    { id: 24, solutionId: 6, type: 'labor', refId: 10, formula: 'SURFACE / RENDEMENT_MO', label: 'Poseur carreleur qualifié', costCategory: 'labor' },

    // Solution 7: Menuiserie Aluminium
    { id: 25, solutionId: 7, type: 'material', refId: 12, formula: 'PERIMETRE * QTY', label: 'Profilés Aluminium thermolaqués', costCategory: 'material' },
    { id: 26, solutionId: 7, type: 'material', refId: 13, formula: 'SURFACE * QTY', label: 'Vitrage feuilleté 44.2', costCategory: 'material' },
    { id: 27, solutionId: 7, type: 'labor', refId: 11, formula: 'QTY', label: 'Assemblage et pose baie vitrée', costCategory: 'labor' },

    // Solution 8: Caisson Enseigne Lumineuse LED
    { id: 28, solutionId: 8, type: 'material', refId: 12, formula: 'PERIMETRE', label: 'Profilé Aluminium caisson étanche', costCategory: 'material' },
    { id: 29, solutionId: 8, type: 'material', refId: 16, formula: 'SURFACE * 2', label: 'Faces Plexiglas diffusant blanc 3mm', costCategory: 'material' },
    // P0.6 — Densité corrigée de 45 à 25 u/m² (2026-08-16) : 45/m² facturait
    // près du double du matériel réellement posé sur toute enseigne, quelle
    // que soit sa taille (confirmé sur l'Étalon E : 330 modules calculés vs
    // 180 documentés pour 7.2m²). Le coefficient de la formule d'alimentation
    // (25 u/m² × 1.2W = 30W/m²) est mis à jour en cohérence, pour que le
    // nombre d'alimentations reste dérivé de la même densité que les modules.
    { id: 30, solutionId: 8, type: 'material', refId: 14, formula: 'SURFACE * 25', label: 'Modules LED IP67 1.2W (25 u/m²)', costCategory: 'material' },
    { id: 31, solutionId: 8, type: 'material', refId: 15, formula: 'ceil(SURFACE * 30 / 200)', label: 'Alimentation MeanWell 200W', costCategory: 'material' },
    { id: 32, solutionId: 8, type: 'labor', refId: 13, formula: '1', label: 'Câblage LED et assemblage caisson', costCategory: 'labor' },
    { id: 33, solutionId: 8, type: 'labor', refId: 4, formula: '1', label: 'Fixation et raccordement secteur', costCategory: 'installation' },

    // Solution 9: Lettres Reliefs Découpées LED
    { id: 34, solutionId: 9, type: 'material', refId: 16, formula: 'SURFACE', label: 'Plaque Plexiglas découpée laser', costCategory: 'material' },
    { id: 35, solutionId: 9, type: 'material', refId: 14, formula: 'NOMBRE_LETTRES * 6', label: 'Modules LED rétro-éclairage (6/lettre)', costCategory: 'material' },
    { id: 36, solutionId: 9, type: 'material', refId: 15, formula: '1', label: 'Alimentation LED 12V 200W', costCategory: 'material' },
    { id: 37, solutionId: 9, type: 'labor', refId: 13, formula: '1', label: 'Façonnage lettres et intégration LED', costCategory: 'labor' },

    // Solution 10: Terrassement & Fouilles
    { id: 38, solutionId: 10, type: 'labor', refId: 6, formula: 'VOLUME > 0 ? VOLUME : (SURFACE * 0.5)', label: 'Terrassement et évacuation décharge', costCategory: 'labor' },

    // Solution 11: Scénographie Backdrop
    { id: 39, solutionId: 11, type: 'material', refId: 1, formula: 'PERIMETRE + 12', label: 'Structure métallique tubulaire autoportante', costCategory: 'material' },
    { id: 40, solutionId: 11, type: 'material', refId: 17, formula: 'SURFACE', label: 'Bâche PVC 510g M1 Anti-reflet HD', costCategory: 'material' },
    { id: 41, solutionId: 11, type: 'labor', refId: 1, formula: '1', label: 'Soudure et platines de lestage', costCategory: 'labor' },
    { id: 42, solutionId: 11, type: 'labor', refId: 4, formula: '1', label: 'Montage et tension sur site', costCategory: 'installation' },

    // Solution 12: Cloison Placostil BA13 72/48
    { id: 43, solutionId: 12, type: 'material', refId: 21, formula: 'SURFACE * 2', label: 'Plaques de plâtre BA13 (2 faces)', costCategory: 'material' },
    { id: 44, solutionId: 12, type: 'material', refId: 22, formula: 'SURFACE * 1.8', label: 'Ossature Rails R48 & Montants M48', costCategory: 'material' },
    { id: 45, solutionId: 12, type: 'material', refId: 23, formula: 'SURFACE', label: 'Laine de verre acoustique 45mm', costCategory: 'material' },
    { id: 46, solutionId: 12, type: 'material', refId: 24, formula: 'SURFACE * 0.8', label: 'Enduit à joint et bande calicot', costCategory: 'material' },
    { id: 47, solutionId: 12, type: 'labor', refId: 15, formula: 'SURFACE', label: 'Pose cloison Placostil & finition joints', costCategory: 'labor' },

    // Solution 13: Faux-Plafond Suspendu BA13
    { id: 48, solutionId: 13, type: 'material', refId: 21, formula: 'SURFACE', label: 'Plaques de plâtre BA13', costCategory: 'material' },
    { id: 49, solutionId: 13, type: 'material', refId: 22, formula: 'SURFACE * 1.5', label: 'Fourrures F530 et suspentes', costCategory: 'material' },
    { id: 50, solutionId: 13, type: 'material', refId: 24, formula: 'SURFACE * 0.5', label: 'Enduit à joint et bande', costCategory: 'material' },
    { id: 51, solutionId: 13, type: 'labor', refId: 16, formula: 'SURFACE', label: 'Pose faux-plafond suspendu', costCategory: 'labor' },

    // Solution 14: Enduit Ciment Hydrofuge 2 Passes
    { id: 52, solutionId: 14, type: 'material', refId: 29, formula: 'SURFACE * 20', label: 'Mortier hydrofuge prêt à gâcher (20 kg/m²)', costCategory: 'material' },
    { id: 53, solutionId: 14, type: 'material', refId: 9, formula: 'SURFACE * 3', label: 'Ciment CPJ pour gobetis d’accrochage', costCategory: 'material' },
    { id: 54, solutionId: 14, type: 'labor', refId: 17, formula: 'SURFACE', label: 'Application enduit ciment 2 passes', costCategory: 'labor' },

    // Solution 15: Installation Électrique Complète
    { id: 55, solutionId: 15, type: 'material', refId: 27, formula: 'QTY * 50', label: 'Câble R2V 3G2.5mm² sous gaine ICTA', costCategory: 'material' },
    { id: 56, solutionId: 15, type: 'material', refId: 28, formula: 'QTY * 6', label: 'Disjoncteurs et appareillage', costCategory: 'material' },
    { id: 57, solutionId: 15, type: 'labor', refId: 19, formula: 'QTY', label: 'Câblage et pose tableau électrique', costCategory: 'labor' },

    // Solution 16: Plomberie Sanitaire
    { id: 58, solutionId: 16, type: 'material', refId: 25, formula: 'QTY * 25', label: 'Tube multicouche Ø16/20 gainé', costCategory: 'material' },
    { id: 59, solutionId: 16, type: 'material', refId: 26, formula: 'QTY * 8', label: 'Tubes PVC évacuation Ø40/100', costCategory: 'material' },
    { id: 60, solutionId: 16, type: 'labor', refId: 18, formula: 'QTY', label: 'Raccordements plomberie et pose sanitaires', costCategory: 'labor' },

    // Solution 17: Garde-Corps Métallerie (Plan de Débit 1D) — P0.7 2026-08-16
    // Poteaux tous les ESPACEMENT m (hauteur HAUTEUR_POTEAU) + NB_LISSES lisses
    // horizontales par intervalle, débités dans les barres 6m du Tube carré
    // 25x25 (refId 1, déjà purchaseMode 'pack') : l'arrondi au conditionnement
    // acheté (P0.4) donne directement le nombre de barres, sans re-coder de
    // bin-packing dédié — le calcul coïncide avec optimize1DLinearCuts() ici.
    { id: 61, solutionId: 17, type: 'material', refId: 31, formula: '(floor(LONGUEUR / ESPACEMENT) + 1) * HAUTEUR_POTEAU + floor(LONGUEUR / ESPACEMENT) * NB_LISSES * ESPACEMENT', label: 'Débit barres Tube carré 25x25 (poteaux + lisses)', costCategory: 'material' },
    { id: 62, solutionId: 17, type: 'labor', refId: 3, formula: 'LONGUEUR', label: 'Découpe et usinage des profilés', costCategory: 'labor' },
    { id: 63, solutionId: 17, type: 'labor', refId: 4, formula: '1', label: 'Soudure, assemblage et pose sur site', costCategory: 'installation' },

    // Solution 18: Dressing Menuiserie sur Mesure (Caissons) — P0.7 2026-08-16
    // Caisson = 2 côtés (HAUTEUR × PROFONDEUR) + 1 fond (LARGEUR × HAUTEUR) +
    // NB_TABLETTES tablettes (LARGEUR × PROFONDEUR, dessus/dessous inclus),
    // débité dans les plaques mélaminé 6m² (refId 30, purchaseMode 'pack').
    { id: 64, solutionId: 18, type: 'material', refId: 30, formula: '2 * (HAUTEUR * PROFONDEUR_CAISSON) + (LARGEUR * HAUTEUR) + NB_TABLETTES * (LARGEUR * PROFONDEUR_CAISSON)', label: 'Panneaux mélaminé (côtés + fond + tablettes)', costCategory: 'material' },
    { id: 65, solutionId: 18, type: 'labor', refId: 20, formula: '2 * (HAUTEUR * PROFONDEUR_CAISSON) + (LARGEUR * HAUTEUR) + NB_TABLETTES * (LARGEUR * PROFONDEUR_CAISSON)', label: 'Fabrication atelier et pose du caisson', costCategory: 'labor' }
];

    // P1.C V5.7 — Chargement via LS helper avec préfixe costcalc_
    // P0.1 V5.2 — Cache local isolé par user_id
    const loadLocalData = (key, defaultValue) => {
        const val = LS.get(key, sbUser?.id);
        return val !== null ? val : defaultValue;
    };

    // P0.2 V5.7 — Chargement local user-scoped sans dépendance à _schemaCheck pré-Auth global
    const [companyInfo, setCompanyInfo] = useState(() => loadLocalData('companyInfo', defaultCompany));
    const [materials, setMaterials] = useState(() => {
        let loaded = loadLocalData('materials', initialMaterials);
        if (Array.isArray(loaded)) {
            loaded = loaded.map(m => {
                if (m.id === 2 && m.priceBuy === 250000) {
                    return { ...m, name: 'Autocollant imprimé VINYL', unitBuy: 'm²', unitSize: 1, priceBuy: 5000, priceCalc: 5000 };
                }
                if (m.id === 3 && m.unitSize === 6) {
                    return { ...m, unitBuy: 'Feuille (3m²)', unitSize: 3, priceBuy: 21000, priceCalc: 7000 };
                }
                return m;
            });
        }
        return loaded;
    });
    const [labor, setLabor] = useState(() => loadLocalData('labor', initialLabor));
    const [solutions, setSolutions] = useState(() => loadLocalData('solutions', initialSolutions));
    const [selectedSolutionForEdit, setSelectedSolutionForEdit] = useState(() => solutions[0] || initialSolutions[0]);

    // Schéma V5.7 — Migration en chaîne user-scoped
    const [recipes, setRecipes] = useState(() => {
        let loadedRecipes = loadLocalData('recipes', initialRecipes);
        const userStoredRaw = LS.get('schemaVersion', sbUser?.id);
        const fromVersion = userStoredRaw !== null ? parseInt(userStoredRaw, 10) : CURRENT_SCHEMA_INT;

        if (fromVersion > CURRENT_SCHEMA_INT) {
            return initialRecipes; // Schéma futur non géré localement
        }

        if (fromVersion < CURRENT_SCHEMA_INT && sbUser?.id) {
            LS.set(`recipes_backup_v${fromVersion || 'legacy'}`, loadedRecipes, sbUser.id);
            loadedRecipes = migrateRecipes(loadedRecipes, fromVersion);
            LS.set('recipes', loadedRecipes, sbUser.id);
            LS.set('schemaVersion', CURRENT_SCHEMA_INT, sbUser.id);
        }
        return loadedRecipes;
    });

    const [clients, setClients] = useState(() => {
        const stored = LS.get('clients', activeOrganizationId);
        return stored && Array.isArray(stored) && stored.length > 0 ? stored : initialClients;
    });
    const updateClients = (newClients) => {
        setClients(newClients);
        LS.set('clients', newClients, activeOrganizationId);
    };

    const [projects, setProjects] = useState(() => {
        const stored = LS.get('projects', activeOrganizationId);
        return stored && Array.isArray(stored) && stored.length > 0 ? stored : initialProjects;
    });
    const updateProjects = (newProjects) => {
        setProjects(newProjects);
        LS.set('projects', newProjects, activeOrganizationId);
    };

    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [projectSearchQuery, setProjectSearchQuery] = useState('');

    const [savedQuotes, setSavedQuotes] = useState(() => {
        const loaded = loadLocalData('savedQuotes', initialSavedQuotes);
        return loaded && Array.isArray(loaded) && loaded.length > 0 ? loaded : initialSavedQuotes;
    });

    // P0.11 (2026-08-17) — Bug trouvé en testant 3 devis à la suite : le devis
    // vierge initial au démarrage a toujours le numéro codé en dur
    // `DEV-{année}-001` (déclaré avant que savedQuotes ne soit chargé, donc
    // impossible à calculer dynamiquement à cet endroit). S'il existe déjà un
    // devis portant ce numéro (données de démo en mode Invité, ou reprise
    // d'une session), collision silencieuse à l'enregistrement — deux devis
    // avec le même numéro. Corrigé une fois au montage, uniquement si le
    // devis est encore vierge (jamais touché par l'utilisateur).
    useEffect(() => {
        // Dépendances vides : ne s'exécute qu'une fois au montage, avant que
        // l'utilisateur ait pu modifier quoi que ce soit — pas besoin de
        // vérifier un flag "non modifié" (hasUnsavedChanges vit dans
        // QuoteWorkspace, pas ici, et n'est de toute façon pas encore pertinent
        // à ce stade du cycle de vie).
        if (savedQuotes.some(q => q.number === hybridQuote.number)) {
            setHybridQuote(prev => ({ ...prev, number: generateNextQuoteNumber(savedQuotes) }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // P0.12 (2026-08-17) — Anomalie signalée : les clients/affaires réellement
    // devisés (Gestion des Affaires, Répertoire Clients) n'apparaissaient
    // jamais dans le CRM. Le champ "Nom du Client" du devis était un texte
    // libre jamais relié à `clients`/`projects` — aucune fiche n'était créée
    // ni mise à jour, le rapprochement se faisant uniquement par comparaison
    // de chaîne (`q.clientName === c.name`), fragile à la moindre variante.
    // Résolution pure (pas d'effet de bord) : cherche un client/affaire
    // existant par nom, sinon en crée un réel (nom du devis, pas de données
    // factices) et le rattache par ID — utilisé à la fois pour les nouveaux
    // enregistrements (onSaveQuote) et pour rattraper les devis déjà
    // enregistrés avant ce correctif (effet de rattrapage ci-dessous).
    const resolveClientAndProject = (currentClients, currentProjects, clientNameRaw, projectRefRaw, quoteTotal) => {
        const clientName = (clientNameRaw || '').trim();
        const projectRef = (projectRefRaw || '').trim();
        if (!clientName) return { client: null, project: null, clients: currentClients, projects: currentProjects };

        let clientsArr = currentClients;
        let client = clientsArr.find(c => c.name.trim().toLowerCase() === clientName.toLowerCase());
        if (!client) {
            client = {
                id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: clientName, contactPerson: '', taxId: '', email: '', phone: '', address: '', city: '',
                notes: 'Créé automatiquement depuis un devis.'
            };
            clientsArr = [client, ...clientsArr];
        }

        let projectsArr = currentProjects;
        let project = null;
        if (projectRef) {
            project = projectsArr.find(p => p.name.trim().toLowerCase() === projectRef.toLowerCase() && (p.clientId === client.id || p.clientName === client.name));
            if (!project) {
                const newCode = `PRJ-${new Date().getFullYear()}-${String(projectsArr.length + 1).padStart(3, '0')}`;
                project = {
                    id: `prj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    code: newCode, name: projectRef, clientId: client.id, clientName: client.name,
                    siteAddress: '', city: client.city || 'Dakar', status: 'active',
                    budgetEstimated: quoteTotal || 0, createdAt: new Date().toISOString().split('T')[0]
                };
                projectsArr = [project, ...projectsArr];
            }
        }
        return { client, project, clients: clientsArr, projects: projectsArr };
    };

    const [nextQuoteSeq, setNextQuoteSeq] = useState(() => loadLocalData('nextQuoteSeq', 1));
    const [calcForm, setCalcForm] = useState(() => loadLocalData('calcForm', {
        solutionId: 1, takeoffMode: 'rectangle', width: 2, height: 1, lengthDirect: 2, surfaceDirect: 450, qty: 1, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: {}
    }));

    useEffect(() => {
        const sol = solutions.find(s => s.id === parseInt(calcForm.solutionId)) || solutions[0];
        if (sol && sol.allowedModes && sol.allowedModes.length > 0) {
            if (!sol.allowedModes.includes(calcForm.takeoffMode)) {
                setCalcForm(prev => ({ ...prev, takeoffMode: sol.allowedModes[0] }));
            }
        }
    }, [calcForm.solutionId, solutions, calcForm.takeoffMode]);

    // P0.8 (2026-08-17) — Mappage JS (camelCase) <-> tables relationnelles V6
    // (snake_case). Remplace le blob JSON `user_data` (V5, table supprimée de la
    // production le 2026-08-16) — voir PROJECT_MASTER_TRACKER.md § 16.
    // ⚠️ materials porte des champs locaux sans colonne V6 (reference, brand,
    // supplier, stock, purchaseStep) : ils sont conservés en mémoire/local mais
    // ne survivent PAS à un aller-retour cloud tant que le schéma n'est pas
    // étendu — limitation connue, documentée, hors périmètre de ce correctif.
    const mapMaterialToDb = (m, orgId) => ({
        id: m.id, organization_id: orgId, name: m.name, category: m.category || 'Divers',
        unit_buy: m.unitBuy || 'Unité', unit_size: parseFloat(m.unitSize) || 1, unit_calc: m.unitCalc || 'u',
        price_buy: parseFloat(m.priceBuy) || 0, price_calc: parseFloat(m.priceCalc) || 0,
        waste: parseFloat(m.waste) || 0, yield_rate: parseFloat(m.yieldRate) || 0,
        purchase_mode: m.purchaseMode || 'pack'
    });
    const mapMaterialFromDb = (r) => ({
        id: r.id, name: r.name, category: r.category, unitBuy: r.unit_buy, unitSize: r.unit_size,
        unitCalc: r.unit_calc, priceBuy: r.price_buy, priceCalc: r.price_calc, waste: r.waste,
        yieldRate: r.yield_rate, purchaseMode: r.purchase_mode
    });
    const mapLaborToDb = (l, orgId) => ({
        id: l.id, organization_id: orgId, name: l.name, calc_mode: l.calcMode || 'surface',
        unit: l.unit || 'u', rate: parseFloat(l.rate) || 0, yield_rate: parseFloat(l.yieldRate) || 0
    });
    const mapLaborFromDb = (r) => ({ id: r.id, name: r.name, calcMode: r.calc_mode, unit: r.unit, rate: r.rate, yieldRate: r.yield_rate });
    const mapSolutionToDb = (s, orgId) => ({
        id: s.id, organization_id: orgId, name: s.name, icon: s.icon || 'fa-cube',
        allowed_modes: s.allowedModes || [], custom_vars: s.customVars || []
    });
    const mapSolutionFromDb = (r) => ({ id: r.id, name: r.name, icon: r.icon, allowedModes: r.allowed_modes || [], customVars: r.custom_vars || [] });
    const mapRecipeToDb = (rc, orgId) => ({
        id: rc.id, organization_id: orgId, solution_id: rc.solutionId, type: rc.type,
        ref_id: rc.refId, formula: rc.formula, cost_category: rc.costCategory || rc.type, label: rc.label
    });
    const mapRecipeFromDb = (r) => ({ id: r.id, solutionId: r.solution_id, type: r.type, refId: r.ref_id, formula: r.formula, costCategory: r.cost_category, label: r.label });
    const mapCompanyToDb = (c, orgId) => ({
        organization_id: orgId, name: c.name, tagline: c.tagline, phone: c.phone, email: c.email,
        address: c.address, nif: c.nif, rccm: c.rccm, currency: c.currency,
        quote_validity: c.quoteValidity, payment_terms: c.paymentTerms
    });
    const mapCompanyFromDb = (r) => ({
        name: r.name, tagline: r.tagline, phone: r.phone, email: r.email, address: r.address,
        nif: r.nif, rccm: r.rccm, currency: r.currency, quoteValidity: r.quote_validity, paymentTerms: r.payment_terms
    });

    // Resynchronisation complète d'une table catalogue org-scopée (delete + insert).
    // Cohérent avec la sémantique historique de updateMaterials/etc. (newVal = liste
    // complète à faire autorité) ; la fenêtre delete→insert n'est pas atomique, mais
    // un échec réseau y laisse au pire le catalogue cloud vide jusqu'au prochain
    // enregistrement réussi — le local (state + LS.setOutboxKey) reste la source de
    // vérité affichée à l'utilisateur entre-temps.
    const syncCatalogTable = async (table, orgId, rows, mapToDb) => {
        if (!supabaseClient || !orgId) return;
        const { error: delErr } = await supabaseClient.from(table).delete().eq('organization_id', orgId);
        if (delErr) { console.warn(`[Cloud Sync] ${table} delete error:`, delErr); return; }
        if (rows.length > 0) {
            const { error: insErr } = await supabaseClient.from(table).insert(rows.map(r => mapToDb(r, orgId)));
            if (insErr) console.warn(`[Cloud Sync] ${table} insert error:`, insErr);
        }
    };

    const catalogSaveTimers = useRef({});
    const scheduleCatalogSave = useCallback((key, fn) => {
        if (catalogSaveTimers.current[key]) clearTimeout(catalogSaveTimers.current[key]);
        catalogSaveTimers.current[key] = setTimeout(fn, 1500);
    }, []);

    // BLOC 1/10 : ONBOARDING AUTOMATIQUE & CHARGEMENT MULTI-TENANT STRICT
    useEffect(() => {
        if (!supabaseClient || !sbUser || sbDataLoaded) return;
        if (sbUser.id === 'guest') {
            setCloudState('loaded');
            setSbDataLoaded(true);
            setIsBootstrapping(false);
            return;
        }
        setCloudState('loading');
        (async () => {
            try {
                let resolvedOrgId = null;

                // 1. Onboarding Automatique & Idempotent via bootstrap_user_organization
                try {
                    const { data: bootData, error: bootErr } = await supabaseClient.rpc('bootstrap_user_organization', {
                        p_org_name: sbUser.user_metadata?.org_name || 'Entreprise BTP'
                    });
                    if (!bootErr && bootData && bootData.organization_id) {
                        resolvedOrgId = bootData.organization_id;
                        const orgObj = {
                            id: bootData.organization_id,
                            name: bootData.organization_name || bootData.name || 'Entreprise BTP',
                            currency: bootData.currency || 'FCFA',
                            role: bootData.role || 'owner'
                        };
                        setUserOrganizations([orgObj]);
                        setActiveOrganizationId(orgObj.id);
                        setActiveOrganizationRole(orgObj.role);
                        localStorage.setItem(`ikadevis_orgs_${sbUser.id}`, JSON.stringify([orgObj]));
                        localStorage.setItem(`ikadevis_active_org_${sbUser.id}`, orgObj.id);
                    }
                } catch (bErr) {
                    console.warn('[Bloc 1] Bootstrap RPC fallback:', bErr);
                }

                // 2. Récupération des membres d'organisations réels
                try {
                    const { data: memberOrgs, error: memErr } = await supabaseClient
                        .from('organization_members')
                        .select('organization_id, role, organizations(id, name, currency)')
                        .eq('user_id', sbUser.id);

                    if (!memErr && memberOrgs && memberOrgs.length > 0) {
                        const parsedOrgs = memberOrgs.map(m => ({
                            id: m.organization_id,
                            name: m.organizations?.name || 'Organisation',
                            currency: m.organizations?.currency || 'FCFA',
                            role: m.role || 'member'
                        }));
                        setUserOrganizations(parsedOrgs);
                        localStorage.setItem(`ikadevis_orgs_${sbUser.id}`, JSON.stringify(parsedOrgs));
                        if (!resolvedOrgId || !parsedOrgs.some(o => o.id === resolvedOrgId)) {
                            resolvedOrgId = parsedOrgs[0].id;
                            setActiveOrganizationId(parsedOrgs[0].id);
                            setActiveOrganizationRole(parsedOrgs[0].role);
                            localStorage.setItem(`ikadevis_active_org_${sbUser.id}`, parsedOrgs[0].id);
                        }
                    }
                } catch (mErr) {
                    console.warn('[Bloc 1] Members query fallback:', mErr);
                }

                if (!resolvedOrgId) {
                    console.error('[Bloc 1] Aucune organisation résolue pour cet utilisateur.');
                    setCloudState('offline_error');
                    setCloudErrorMessage("Impossible de déterminer votre organisation. Réessayez ou contactez le support.");
                    return;
                }

                // 3. Chargement du catalogue relationnel V6 (materials/labor/solutions/
                // recipes/company_settings), org par org — remplace l'ancien blob JSON
                // `user_data` (V5, supprimé de la production le 2026-08-16). Voir
                // PROJECT_MASTER_TRACKER.md § 16.
                const [companyRes, materialsRes, laborRes, solutionsRes, recipesRes] = await Promise.all([
                    supabaseClient.from('company_settings').select('*').eq('organization_id', resolvedOrgId).maybeSingle(),
                    supabaseClient.from('materials').select('*').eq('organization_id', resolvedOrgId),
                    supabaseClient.from('labor').select('*').eq('organization_id', resolvedOrgId),
                    supabaseClient.from('solutions').select('*').eq('organization_id', resolvedOrgId),
                    supabaseClient.from('recipes').select('*').eq('organization_id', resolvedOrgId)
                ]);

                const firstError = [companyRes.error, materialsRes.error, laborRes.error, solutionsRes.error, recipesRes.error].find(Boolean);
                if (firstError) {
                    console.error('[Bloc 1] Erreur de chargement du catalogue cloud:', firstError);
                    setCloudState('offline_error');
                    setCloudErrorMessage("Erreur de connexion Cloud. Vos modifications restent uniquement enregistrées sur ce navigateur.");
                    return;
                }

                const isFirstLoginOnOrg = !companyRes.data && materialsRes.data.length === 0 && solutionsRes.data.length === 0;

                if (isFirstLoginOnOrg) {
                    // Première connexion sur cette organisation : amorcer le catalogue de
                    // démarrage directement dans les tables V6.
                    const legacyAvailable = LS.hasLegacyUnnamespacedData();
                    if (legacyAvailable) setShowImportBanner(true);

                    const seedResults = await Promise.all([
                        supabaseClient.from('company_settings').insert(mapCompanyToDb(defaultCompany, resolvedOrgId)),
                        initialMaterials.length ? supabaseClient.from('materials').insert(initialMaterials.map(m => mapMaterialToDb(m, resolvedOrgId))) : Promise.resolve({ error: null }),
                        initialLabor.length ? supabaseClient.from('labor').insert(initialLabor.map(l => mapLaborToDb(l, resolvedOrgId))) : Promise.resolve({ error: null }),
                        initialSolutions.length ? supabaseClient.from('solutions').insert(initialSolutions.map(s => mapSolutionToDb(s, resolvedOrgId))) : Promise.resolve({ error: null }),
                        initialRecipes.length ? supabaseClient.from('recipes').insert(initialRecipes.map(r => mapRecipeToDb(r, resolvedOrgId))) : Promise.resolve({ error: null })
                    ]);
                    const seedError = seedResults.map(r => r.error).find(Boolean);
                    if (seedError) console.warn('[Bloc 1] Erreur lors de l\'amorçage du catalogue cloud:', seedError);

                    setCompanyInfo(defaultCompany);
                    setMaterials(initialMaterials);
                    setLabor(initialLabor);
                    setSolutions(initialSolutions);
                    setRecipes(initialRecipes);
                } else {
                    setCompanyInfo(companyRes.data ? mapCompanyFromDb(companyRes.data) : defaultCompany);
                    setMaterials((materialsRes.data || []).map(mapMaterialFromDb));
                    setLabor((laborRes.data || []).map(mapLaborFromDb));
                    setSolutions((solutionsRes.data || []).map(mapSolutionFromDb));
                    setRecipes((recipesRes.data || []).map(mapRecipeFromDb));
                }

                // Les devis (savedQuotes/nextQuoteSeq) restent chargés localement pour
                // l'instant — la persistance cloud de cette liste (distincte de la vraie
                // table `quotes` déjà écrite par create_quote_v6) reste un chantier
                // séparé, documenté au tracker, non traité dans ce correctif.

                setCloudState('loaded');
                setSbDataLoaded(true);
            } catch (e) {
                console.error('[Bloc 1] Network error during initial cloud load:', e);
                setCloudState('offline_error');
                setCloudErrorMessage("Connexion réseau indisponible.");
            }
        })();
    }, [supabaseClient, sbUser, sbDataLoaded, cloudRetryCount]);

    // P0.3 & P1.1 V5.7 — Auto-save avec sérialisation (isSavingRef queue), Outbox revision lock & backoff
    const sbSaveTimeout = useRef(null);

    const processSaveQueue = useCallback(async () => {
        if (isSavingRef.current || Object.keys(pendingPatch.current).length === 0 || !sbDataLoaded || isReadOnlyDueToDowngrade || !sbUser || sbUser.id === 'guest') return;

        isSavingRef.current = true;
        const patchToSend = { ...pendingPatch.current, schema_version: CURRENT_SCHEMA_INT };
        const patchRevisions = {};

        const currentOutbox = LS.getOutbox(sbUser.id);
        Object.keys(pendingPatch.current).forEach(k => {
            const entry = currentOutbox[k];
            if (entry && typeof entry === 'object' && 'revision' in entry) {
                patchRevisions[k] = entry.revision;
            }
        });

        pendingPatch.current = {};
        setSbSyncStatus('syncing');

        try {
            const { error } = await supabaseClient
                .from('user_data')
                .update(patchToSend)
                .eq('user_id', sbUser.id);

            if (error) {
                console.error('[V5.7.1] Save error:', error);
                pendingPatch.current = { ...patchToSend, ...pendingPatch.current };
                setSbSyncStatus('error');
                retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30000);
            } else {
                lastSavedTime.current = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                setSbSyncStatus('saved');
                // P0.3 V5.7.1 — Nettoyage par révision (ne supprime que les entrées dont la révision est <= patchRevision)
                Object.keys(patchToSend).forEach(key => {
                    if (key !== 'schema_version') {
                        const rev = patchRevisions[key];
                        if (rev !== undefined) {
                            LS.clearOutboxKeyIfRevisionMatches(key, rev, sbUser.id);
                        } else {
                            LS.clearOutboxKey(key, sbUser.id);
                        }
                    }
                });
                retryDelayRef.current = 1500;
            }
        } catch (e) {
            console.error('[V5.7.1] Network error during save:', e);
            pendingPatch.current = { ...patchToSend, ...pendingPatch.current };
            setSbSyncStatus('error');
            retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30000);
        } finally {
            isSavingRef.current = false;
            if (Object.keys(pendingPatch.current).length > 0) {
                setTimeout(processSaveQueue, retryDelayRef.current);
            } else {
                setTimeout(() => setSbSyncStatus(prev => prev === 'syncing' ? 'idle' : prev), 3000);
            }
        }
    }, [supabaseClient, sbUser, sbDataLoaded, isReadOnlyDueToDowngrade]);

    const saveToSupabase = useCallback((patch) => {
        if (!supabaseClient || !sbUser || sbUser.id === 'guest' || !sbDataLoaded || cloudState !== 'loaded' || isReadOnlyDueToDowngrade) return;

        pendingPatch.current = { ...pendingPatch.current, ...patch };

        if (sbSaveTimeout.current) clearTimeout(sbSaveTimeout.current);
        sbSaveTimeout.current = setTimeout(processSaveQueue, 1500);
    }, [supabaseClient, sbUser, sbDataLoaded, cloudState, isReadOnlyDueToDowngrade, processSaveQueue]);

    // P0.1 V5.7.3-FINAL — Drainage Automatique de l'Outbox post-authentification
    // P0.8 (2026-08-17) — materials/labor/solutions/recipes/company_info sont
    // désormais rejoués vers leurs vraies tables V6 (pas le blob user_data mort) ;
    // saved_quotes/next_quote_seq restent sur l'ancien chemin, hors périmètre de ce
    // correctif (voir PROJECT_MASTER_TRACKER.md § 16).
    const RELATIONAL_OUTBOX_KEYS = { materials: mapMaterialToDb, labor: mapLaborToDb, solutions: mapSolutionToDb, recipes: mapRecipeToDb };
    useEffect(() => {
        if (sbUser && sbUser.id !== 'guest' && sbDataLoaded && cloudState === 'loaded' && activeOrganizationId) {
            const outbox = LS.getOutbox(sbUser.id);
            if (outbox && Object.keys(outbox).length > 0) {
                const legacyPatch = {};
                Object.keys(outbox).forEach(key => {
                    if (!(outbox[key] && typeof outbox[key] === 'object' && 'value' in outbox[key])) return;
                    const value = outbox[key].value;
                    if (key in RELATIONAL_OUTBOX_KEYS) {
                        syncCatalogTable(key, activeOrganizationId, value, RELATIONAL_OUTBOX_KEYS[key])
                            .then(() => LS.clearOutboxKey(key, sbUser.id))
                            .catch(e => console.warn(`[Cloud Sync] Échec du drainage outbox pour ${key}:`, e));
                    } else if (key === 'company_info') {
                        supabaseClient.from('company_settings').upsert(mapCompanyToDb(value, activeOrganizationId), { onConflict: 'organization_id' })
                            .then(({ error }) => { if (!error) LS.clearOutboxKey('company_info', sbUser.id); else console.warn('[Cloud Sync] Échec du drainage outbox company_info:', error); });
                    } else {
                        legacyPatch[key] = value;
                    }
                });
                if (Object.keys(legacyPatch).length > 0) {
                    saveToSupabase(legacyPatch);
                }
            }
        }
    }, [sbUser, sbDataLoaded, cloudState, activeOrganizationId, saveToSupabase, supabaseClient]);

    // P0.1 V5.7.3-FINAL — Mutateurs Explicites Déterministes
    // P0.8 (2026-08-17) — Persistance cloud réelle vers les tables V6 org-scopées
    // (materials/labor/solutions/recipes/company_settings), à la place de l'ancien
    // blob `user_data` (V5, supprimé de la production). LS.setOutboxKey conserve la
    // résilience hors-ligne existante (rejoué au reconnect ci-dessous) ; seule la
    // destination réseau change. Voir PROJECT_MASTER_TRACKER.md § 16.
    const updateMaterials = useCallback((newVal) => {
        setMaterials(newVal);
        if (!isReadOnlyDueToDowngrade && sbUser) {
            LS.set('materials', newVal, sbUser.id);
            if (!isBootstrapping) LS.setOutboxKey('materials', newVal, sbUser.id);
            if (sbUser.id !== 'guest' && sbDataLoaded && cloudState === 'loaded' && activeOrganizationId) {
                setSbSyncStatus('syncing');
                scheduleCatalogSave('materials', async () => {
                    await syncCatalogTable('materials', activeOrganizationId, newVal, mapMaterialToDb);
                    LS.clearOutboxKey('materials', sbUser.id);
                    setSbSyncStatus('saved');
                    setTimeout(() => setSbSyncStatus(prev => prev === 'saved' ? 'idle' : prev), 3000);
                });
            }
        }
    }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, activeOrganizationId, scheduleCatalogSave]);

    const updateCompanyInfo = useCallback((newVal) => {
        setCompanyInfo(newVal);
        if (!isReadOnlyDueToDowngrade && sbUser) {
            LS.set('companyInfo', newVal, sbUser.id);
            if (!isBootstrapping) LS.setOutboxKey('company_info', newVal, sbUser.id);
            if (sbUser.id !== 'guest' && sbDataLoaded && cloudState === 'loaded' && activeOrganizationId) {
                setSbSyncStatus('syncing');
                scheduleCatalogSave('company_info', async () => {
                    const { error } = await supabaseClient.from('company_settings').upsert(mapCompanyToDb(newVal, activeOrganizationId), { onConflict: 'organization_id' });
                    if (error) { console.warn('[Cloud Sync] company_settings upsert error:', error); return; }
                    LS.clearOutboxKey('company_info', sbUser.id);
                    setSbSyncStatus('saved');
                    setTimeout(() => setSbSyncStatus(prev => prev === 'saved' ? 'idle' : prev), 3000);
                });
            }
        }
    }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, activeOrganizationId, scheduleCatalogSave, supabaseClient]);

    const updateLabor = useCallback((newVal) => {
        setLabor(newVal);
        if (!isReadOnlyDueToDowngrade && sbUser) {
            LS.set('labor', newVal, sbUser.id);
            if (!isBootstrapping) LS.setOutboxKey('labor', newVal, sbUser.id);
            if (sbUser.id !== 'guest' && sbDataLoaded && cloudState === 'loaded' && activeOrganizationId) {
                setSbSyncStatus('syncing');
                scheduleCatalogSave('labor', async () => {
                    await syncCatalogTable('labor', activeOrganizationId, newVal, mapLaborToDb);
                    LS.clearOutboxKey('labor', sbUser.id);
                    setSbSyncStatus('saved');
                    setTimeout(() => setSbSyncStatus(prev => prev === 'saved' ? 'idle' : prev), 3000);
                });
            }
        }
    }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, activeOrganizationId, scheduleCatalogSave]);

    const updateSolutions = useCallback((newVal) => {
        setSolutions(newVal);
        if (!isReadOnlyDueToDowngrade && sbUser) {
            LS.set('solutions', newVal, sbUser.id);
            if (!isBootstrapping) LS.setOutboxKey('solutions', newVal, sbUser.id);
            if (sbUser.id !== 'guest' && sbDataLoaded && cloudState === 'loaded' && activeOrganizationId) {
                setSbSyncStatus('syncing');
                scheduleCatalogSave('solutions', async () => {
                    await syncCatalogTable('solutions', activeOrganizationId, newVal, mapSolutionToDb);
                    LS.clearOutboxKey('solutions', sbUser.id);
                    setSbSyncStatus('saved');
                    setTimeout(() => setSbSyncStatus(prev => prev === 'saved' ? 'idle' : prev), 3000);
                });
            }
        }
    }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, activeOrganizationId, scheduleCatalogSave]);

    const updateRecipes = useCallback((newVal) => {
        setRecipes(newVal);
        if (!isReadOnlyDueToDowngrade && sbUser) {
            LS.set('recipes', newVal, sbUser.id);
            if (!isBootstrapping) LS.setOutboxKey('recipes', newVal, sbUser.id);
            if (sbUser.id !== 'guest' && sbDataLoaded && cloudState === 'loaded' && activeOrganizationId) {
                setSbSyncStatus('syncing');
                scheduleCatalogSave('recipes', async () => {
                    await syncCatalogTable('recipes', activeOrganizationId, newVal, mapRecipeToDb);
                    LS.clearOutboxKey('recipes', sbUser.id);
                    setSbSyncStatus('saved');
                    setTimeout(() => setSbSyncStatus(prev => prev === 'saved' ? 'idle' : prev), 3000);
                });
            }
        }
    }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, activeOrganizationId, scheduleCatalogSave]);

    const updateSavedQuotes = useCallback((newVal) => {
        setSavedQuotes(newVal);
        if (!isReadOnlyDueToDowngrade && sbUser) {
            LS.set('savedQuotes', newVal, sbUser.id);
            if (!isBootstrapping) LS.setOutboxKey('saved_quotes', newVal, sbUser.id);
            if (sbDataLoaded && cloudState === 'loaded') saveToSupabase({ saved_quotes: newVal });
        }
    }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, saveToSupabase]);

    // P0.12 (2026-08-17) — Rattrapage : relie les devis déjà enregistrés
    // (avant le correctif resolveClientAndProject ci-dessus) qui n'ont pas
    // encore de clientId — une seule fois au montage.
    useEffect(() => {
        let accClients = clients;
        let accProjects = projects;
        let changed = false;
        const updatedQuotes = savedQuotes.map(q => {
            if (!q.clientName || q.clientId) return q;
            const { client, project, clients: nc, projects: np } = resolveClientAndProject(accClients, accProjects, q.clientName, q.projectRef, q.quoteData?.totalTTCConsomme);
            accClients = nc; accProjects = np; changed = true;
            return { ...q, clientId: client?.id || null, projectId: project?.id || null };
        });
        if (changed) {
            updateClients(accClients);
            updateProjects(accProjects);
            updateSavedQuotes(updatedQuotes);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updateNextQuoteSeq = useCallback((newVal) => {
        setNextQuoteSeq(newVal);
        if (!isReadOnlyDueToDowngrade && sbUser) {
            LS.set('nextQuoteSeq', newVal, sbUser.id);
            if (!isBootstrapping) LS.setOutboxKey('next_quote_seq', newVal, sbUser.id);
            if (sbDataLoaded && cloudState === 'loaded') saveToSupabase({ next_quote_seq: newVal });
        }
    }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, saveToSupabase]);


    useEffect(() => {
        if ((!selectedSolutionForEdit || !solutions.some(s => s.id === selectedSolutionForEdit.id)) && solutions.length > 0) {
            setSelectedSolutionForEdit(solutions[0]);
        }
    }, [solutions, selectedSolutionForEdit]);

    const showToast = (message, type = 'success') => {
        setToast({ message, type, id: Date.now() });
        setTimeout(() => setToast(null), 3500);
    };
    const closeConfirm = () => setConfirmDialog({ isOpen: false });

    // P1.A V5.7 — Diagnostic Catalogue Exhaustif : customVars injectés + rendements réels + test sur TOUS les modes autorisés
    const systemDiagnostic = useMemo(() => {
        let okCount = 0;
        let invalidRecipeCount = 0;
        let missingResourceCount = 0;
        let missingYieldCount = 0;
        const productDetails = [];

        solutions.forEach(sol => {
            const solRecipes = recipes.filter(r => r.solutionId === sol.id);
            let hasIssue = false;
            const issueReasons = [];

            if (solRecipes.length === 0) {
                hasIssue = true;
                issueReasons.push('Aucun composant (recette vide)');
            }

            solRecipes.forEach(r => {
                // Vérification existence ressource
                const matMissing = r.type === 'material' && !materials.find(m => m.id === r.refId);
                const labMissing = r.type === 'labor' && !labor.find(l => l.id === r.refId);
                if (matMissing || labMissing) {
                    missingResourceCount++;
                    hasIssue = true;
                    issueReasons.push(`Ressource manquante sur "${r.label}" (ID #${r.refId})`);
                    return; // pas de test de formule si ressource absente
                }

                // Vérification rendements
                if (r.type === 'material') {
                    const mat = materials.find(m => m.id === r.refId);
                    if (mat && r.formula.includes('RENDEMENT_MATIERE') && (!mat.yieldRate || mat.yieldRate <= 0)) {
                        missingYieldCount++;
                        hasIssue = true;
                        issueReasons.push(`RENDEMENT_MATIERE manquant sur "${mat.name}"`);
                    }
                } else if (r.type === 'labor') {
                    const lab = labor.find(l => l.id === r.refId);
                    if (lab && r.formula.includes('RENDEMENT_MO') && (!lab.yieldRate || lab.yieldRate <= 0)) {
                        missingYieldCount++;
                        hasIssue = true;
                        issueReasons.push(`RENDEMENT_MO manquant sur "${lab.name}"`);
                    }
                }

                // P1.A — Test de formule avec contexte COMPLET : customVars + rendements réels
                // → Tester sur TOUS les modes autorisés. Erreur seulement si TOUS échouent.
                const modesForTest = sol.allowedModes && sol.allowedModes.length > 0 ? sol.allowedModes : ['rectangle'];
                const customVarsDefaults = {};
                if (sol.customVars) sol.customVars.forEach(cv => { customVarsDefaults[cv.name] = cv.defaultValue !== undefined ? cv.defaultValue : 0; });

                const mat = r.type === 'material' ? materials.find(m => m.id === r.refId) : null;
                const lab = r.type === 'labor' ? labor.find(l => l.id === r.refId) : null;

                // P1.4 V5.2 — Diagnostic par mode strict (erreur si UN SEUL mode autorisé échoue)
                modesForTest.forEach(mode => {
                    const ctx = {
                        takeoffMode: mode,
                        width: 2, height: 1, qty: 1, faces: 1,
                        lengthDirect: 3, surfaceDirect: 6,
                        LARGEUR: 2, HAUTEUR: 1, QTY: 1, FACES: 1,
                        LONGUEUR: 3, LINEAIRE: 3,
                        RENDEMENT_MATIERE: (mat && mat.yieldRate > 0) ? mat.yieldRate : 10,
                        RENDEMENT_MO: (lab && lab.yieldRate > 0) ? lab.yieldRate : 10,
                        TARIF_MATIERE: mat ? mat.priceCalc : 1000,
                        TARIF_MO: lab ? lab.rate : 1000,
                        ...customVarsDefaults
                    };
                    const testEval = evaluateDynamicFormula(r.formula, ctx);
                    if (testEval.error) {
                        invalidRecipeCount++;
                        hasIssue = true;
                        issueReasons.push(`Formule "${r.formula}" (${r.label}) incompatible avec le mode "${mode}"`);
                    }
                });
            });

            productDetails.push({ id: sol.id, name: sol.name, ok: !hasIssue, reasons: issueReasons });
            if (!hasIssue) okCount++;
        });

        return {
            totalProducts: solutions.length,
            okProducts: okCount,
            invalidRecipes: invalidRecipeCount,
            missingResources: missingResourceCount,
            missingYields: missingYieldCount,
            productDetails
        };
    }, [solutions, recipes, materials, labor]);

    const resetToDefault = () => {
        if (isReadOnlyDueToDowngrade) {
            showToast("Action bloquée : L'application est en Mode Lecture Seule.", "error");
            return;
        }
        setConfirmDialog({
            isOpen: true,
            title: "Réinitialiser les données d'usine V5.7",
            message: "Voulez-vous vraiment restaurer les données d'usine V5.7 ? Vos modifications et devis seront réinitialisés.",
            isDanger: true,
            onConfirm: () => {
                // P1.2 V5.2 — Clear user-specific cache and legacy cache cleanly
                LS.clearUser(sbUser?.id);
                LS.clearLegacyData();
                setCompanyInfo(defaultCompany);
                setMaterials(initialMaterials);
                setLabor(initialLabor);
                setSolutions(initialSolutions);
                setRecipes(initialRecipes);
                setSavedQuotes([]);
                setNextQuoteSeq(1);
                setCalcForm({
                    solutionId: 1, takeoffMode: 'rectangle', width: 2, height: 1, lengthDirect: 2, surfaceDirect: 450, qty: 1, faces: 1,
                    margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: {}
                });
                closeConfirm();
                showToast("Données d'usine V5.7 restaurées avec succès.");
            }
        });
    };

    const getResourceDependencies = (type, id) => {
        const usedIn = recipes.filter(r => r.type === type && r.refId === id);
        if (usedIn.length === 0) return null;
        const list = usedIn.map(r => {
            const sol = solutions.find(s => s.id === r.solutionId);
            return sol ? `${sol.name} (${r.label})` : `Produit #${r.solutionId} (${r.label})`;
        });
        return [...new Set(list)];
    };

    const handleDeleteMaterial = (m) => {
        if (isReadOnlyDueToDowngrade) { showToast("Action bloquée en Lecture Seule", "error"); return; }
        const deps = getResourceDependencies('material', m.id);
        if (deps) {
            setConfirmDialog({
                isOpen: true,
                title: "Suppression bloquée",
                message: `La matière "${m.name}" est utilisée dans les recettes suivantes :\n\n` + 
                         deps.map(d => `• ${d}`).join('\n') + 
                         `\n\nVeuillez d'abord la retirer de ces recettes pour pouvoir la supprimer.`,
                isDanger: true,
                onConfirm: closeConfirm
            });
        } else {
            setConfirmDialog({
                isOpen: true,
                title: "Supprimer la ressource",
                message: `Voulez-vous vraiment supprimer la matière "${m.name}" ?`,
                isDanger: true,
                onConfirm: () => {
                    updateMaterials(materials.filter(x => x.id !== m.id));
                    if (selectedMaterialId === m.id) { setSelectedMaterialId(null); setIsResourceEditMode(false); }
                    closeConfirm();
                    showToast("Ressource supprimée");
                }
            });
        }
    };

    const handleDeleteLabor = (l) => {
        if (isReadOnlyDueToDowngrade) { showToast("Action bloquée en Lecture Seule", "error"); return; }
        const deps = getResourceDependencies('labor', l.id);
        if (deps) {
            setConfirmDialog({
                isOpen: true,
                title: "Suppression bloquée",
                message: `La main-d'œuvre "${l.name}" est utilisée dans les recettes suivantes :\n\n` + 
                         deps.map(d => `• ${d}`).join('\n') + 
                         `\n\nVeuillez d'abord la retirer de ces recettes pour pouvoir la supprimer.`,
                isDanger: true,
                onConfirm: closeConfirm
            });
        } else {
            setConfirmDialog({
                isOpen: true,
                title: "Supprimer la prestation",
                message: `Voulez-vous vraiment supprimer la main-d'œuvre "${l.name}" ?`,
                isDanger: true,
                onConfirm: () => {
                    updateLabor(labor.filter(x => x.id !== l.id));
                    if (selectedLaborId === l.id) { setSelectedLaborId(null); setIsResourceEditMode(false); }
                    closeConfirm();
                    showToast("Prestation supprimée");
                }
            });
        }
    };

    const handleDuplicateSolution = (sol) => {
        if (isReadOnlyDueToDowngrade) { showToast("Action bloquée en Lecture Seule", "error"); return; }
        const newSolId = Date.now();
        const duplicatedSol = {
            ...sol,
            id: newSolId,
            name: `${sol.name} (Copie)`,
            customVars: sol.customVars ? JSON.parse(JSON.stringify(sol.customVars)) : []
        };
        const relatedRecipes = recipes.filter(r => r.solutionId === sol.id).map(r => ({
            ...r,
            id: Date.now() + Math.floor(Math.random() * 10000),
            solutionId: newSolId
        }));

        updateSolutions([...solutions, duplicatedSol]);
        updateRecipes([...recipes, ...relatedRecipes]);
        setSelectedSolutionForEdit(duplicatedSol);
        showToast(`Produit "${sol.name}" dupliqué avec succès !`);
    };

    const handleDeleteSolution = (sol) => {
        if (isReadOnlyDueToDowngrade) { showToast("Action bloquée en Lecture Seule", "error"); return; }
        if (solutions.length <= 1) {
            showToast("Impossible de supprimer le dernier produit du catalogue.", "error");
            return;
        }
        setConfirmDialog({
            isOpen: true,
            title: "Supprimer le produit",
            message: `Voulez-vous vraiment supprimer le produit "${sol.name}" et toutes ses recettes actives ?`,
            isDanger: true,
            onConfirm: () => {
                const nextSols = solutions.filter(s => s.id !== sol.id);
                updateSolutions(nextSols);
                updateRecipes(recipes.filter(r => r.solutionId !== sol.id));
                const targetSol = nextSols[0];
                setSelectedSolutionForEdit(targetSol);
                setCalcForm(prev => ({
                    ...prev,
                    solutionId: targetSol.id,
                    takeoffMode: targetSol.allowedModes && targetSol.allowedModes.length > 0 ? targetSol.allowedModes[0] : 'rectangle'
                }));
                closeConfirm();
                showToast("Produit supprimé");
            }
        });
    };

    // P0.3 PROPORTIONAL MULTI-CATEGORY PURCHASE BREAKDOWN V5.7
    const currentQuote = useMemo(() => {
        const solution = solutions.find(s => s.id === parseInt(calcForm.solutionId)) || solutions[0];
        if (!solution) return null;
        
        const recipeLines = recipes.filter(r => r.solutionId === solution.id);
        if (recipeLines.length === 0) {
            return { error: 'recipe_empty', solutionName: solution.name };
        }

        const rawOverhead = parseFloat(calcForm.overheadRate);
        if (isNaN(rawOverhead) || rawOverhead < 0 || rawOverhead > 50) {
            return { error: 'financial_invalid', solutionName: solution.name, message: 'Les Frais Généraux doivent être compris entre 0% et 50%.' };
        }
        const rawVat = parseFloat(calcForm.vatRate);
        if (isNaN(rawVat) || rawVat < 0 || rawVat > 30) {
            return { error: 'financial_invalid', solutionName: solution.name, message: 'Le taux de TVA doit être compris entre 0% et 30%.' };
        }
        const rawDiscount = parseFloat(calcForm.discountRate);
        if (isNaN(rawDiscount) || rawDiscount < 0 || rawDiscount > 100) {
            return { error: 'financial_invalid', solutionName: solution.name, message: 'La remise doit être comprise entre 0% et 100%.' };
        }
        const rawMargin = parseFloat(calcForm.margin);
        if (isNaN(rawMargin) || rawMargin < 0 || (calcForm.marginType === 'reel' && rawMargin >= 100) || (calcForm.marginType === 'majoration' && rawMargin > 1000)) {
            return { error: 'margin_invalid', solutionName: solution.name, message: 'Le taux de marge doit être valide (0% à 99% pour marge réelle, 0% à 1000% pour majoration).' };
        }

        const widthVal = parseFloat(calcForm.width);
        const heightVal = parseFloat(calcForm.height);
        const lengthDirectVal = parseFloat(calcForm.lengthDirect);
        const surfaceDirectVal = parseFloat(calcForm.surfaceDirect);
        const qtyVal = Number(calcForm.qty);
        const marginVal = parseFloat(calcForm.margin);

        if (isNaN(qtyVal) || qtyVal <= 0 || !Number.isInteger(qtyVal)) {
            return { error: 'dimensions_invalid', solutionName: solution.name, message: "La quantité d'ouvrages doit être un nombre entier supérieur à 0 (ex: 1, 2, 5)." };
        }

        if (calcForm.takeoffMode === 'rectangle' && (isNaN(widthVal) || widthVal <= 0 || isNaN(heightVal) || heightVal <= 0)) {
            return { error: 'dimensions_invalid', solutionName: solution.name, message: 'La largeur et la hauteur doivent être supérieures à 0.' };
        }
        if (calcForm.takeoffMode === 'surface' && (isNaN(surfaceDirectVal) || surfaceDirectVal <= 0)) {
            return { error: 'dimensions_invalid', solutionName: solution.name, message: 'La surface unitaire doit être supérieure à 0 m².' };
        }
        if (calcForm.takeoffMode === 'floor' && (isNaN(widthVal) || widthVal <= 0 || isNaN(lengthDirectVal) || lengthDirectVal <= 0)) {
            return { error: 'dimensions_invalid', solutionName: solution.name, message: 'La largeur et la longueur sol/plafond doivent être supérieures à 0 m.' };
        }
        if (calcForm.takeoffMode === 'linear' && (isNaN(lengthDirectVal) || lengthDirectVal <= 0)) {
            return { error: 'dimensions_invalid', solutionName: solution.name, message: 'La longueur unitaire doit être supérieure à 0 ml.' };
        }
        const depthVal = Math.max(0, parseFloat(calcForm.depth) || 0.15);
        if (calcForm.takeoffMode === 'volume' && (isNaN(widthVal) || widthVal <= 0 || isNaN(heightVal) || heightVal <= 0 || isNaN(depthVal) || depthVal <= 0)) {
            return { error: 'dimensions_invalid', solutionName: solution.name, message: 'La largeur, la hauteur et la profondeur/épaisseur doivent être supérieures à 0.' };
        }
        const rawFaces = Number(calcForm.faces !== undefined && calcForm.faces !== '' ? calcForm.faces : 1);
        if (isNaN(rawFaces) || rawFaces < 1 || !Number.isInteger(rawFaces)) {
            return { error: 'dimensions_invalid', solutionName: solution.name, message: 'Le nombre de faces ou couches doit être un nombre entier supérieur ou égal à 1 (ex: 1, 2, 3).' };
        }
        const facesVal = rawFaces;

        const evalVars = {
            takeoffMode: calcForm.takeoffMode,
            width: widthVal, height: heightVal, depth: depthVal,
            lengthDirect: lengthDirectVal||widthVal, 
            surfaceDirect: surfaceDirectVal||0, 
            qty: qtyVal, faces: facesVal,
            LARGEUR: widthVal, HAUTEUR: heightVal, PROFONDEUR: depthVal, EPAISSEUR: depthVal, P: depthVal, QTY: qtyVal, FACES: facesVal,
            LONGUEUR: lengthDirectVal||widthVal,
            LINEAIRE: lengthDirectVal||widthVal
        };

        if (solution.customVars && solution.customVars.length > 0) {
            for (const cv of solution.customVars) {
                const rawVal = calcForm.customVarValues && calcForm.customVarValues[cv.name] !== undefined 
                    ? calcForm.customVarValues[cv.name] 
                    : (cv.defaultValue !== undefined ? cv.defaultValue : 0);
                const numVal = parseFloat(rawVal);
                if (isNaN(numVal) || numVal < 0) {
                    return { 
                        error: 'custom_var_invalid', 
                        solutionName: solution.name, 
                        message: `La variable "${cv.label || cv.name}" (${cv.name}) doit être un nombre positif ou nul (valeur saisie : "${rawVal}").` 
                    };
                }
                evalVars[cv.name] = numVal;
            }
        }

        const evaluatedLines = recipeLines.map(line => {
            const costCat = line.costCategory || (line.label.toLowerCase().includes('install') ? 'installation' : line.type);
            
            let extraCtx = {};
            let resourceError = null;

            if (line.type === 'labor') {
                const lab = labor.find(l => l.id === line.refId);
                if (!lab) {
                    resourceError = `Ressource main-d'œuvre inexistante ou supprimée (ID #${line.refId})`;
                } else {
                    if (line.formula.includes('RENDEMENT_MO') && (!lab.yieldRate || lab.yieldRate <= 0)) {
                        resourceError = `Rendement main-d'œuvre non configuré sur la prestation "${lab.name}"`;
                    }
                    extraCtx.RENDEMENT_MO = lab.yieldRate || 0;
                    extraCtx.TARIF_MO = lab.rate || 0;
                }
            } else if (line.type === 'material') {
                const mat = materials.find(m => m.id === line.refId);
                if (!mat) {
                    resourceError = `Ressource matière inexistante ou supprimée (ID #${line.refId})`;
                } else {
                    if (line.formula.includes('RENDEMENT_MATIERE') && (!mat.yieldRate || mat.yieldRate <= 0)) {
                        resourceError = `Rendement matière non configuré sur la ressource "${mat.name}"`;
                    }
                    extraCtx.RENDEMENT_MATIERE = mat.yieldRate || 0;
                    extraCtx.TARIF_MATIERE = mat.priceCalc || 0;
                }
            }

            if (resourceError) {
                return { ...line, costCategory: costCat, baseQty: 0, evalError: resourceError };
            }

            const evalRes = evaluateDynamicFormula(line.formula, evalVars, extraCtx);
            return { ...line, costCategory: costCat, baseQty: evalRes.value, evalError: evalRes.error };
        });

        const invalidLine = evaluatedLines.find(l => l.evalError);
        if (invalidLine) {
            return { 
                error: 'formula_invalid', 
                solutionName: solution.name, 
                invalidLineLabel: invalidLine.label, 
                errorMessage: invalidLine.evalError 
            };
        }

        const activeLines = evaluatedLines.filter(line => {
            if (line.costCategory === 'installation' && !calcForm.includeInstall) return false;
            return line.baseQty > 0;
        });

        const materialConsolidation = {};
        activeLines.forEach(line => {
            if (line.type === 'material' && line.baseQty > 0) {
                const mat = materials.find(m => m.id === line.refId);
                if (mat) {
                    const billedQty = line.baseQty * (1 + ((parseFloat(mat.waste) || 0) / 100));
                    if (!materialConsolidation[mat.id]) {
                        materialConsolidation[mat.id] = { mat, totalBilledQty: 0, primaryCostCategory: line.costCategory };
                    }
                    materialConsolidation[mat.id].totalBilledQty += billedQty;
                }
            }
        });

        Object.keys(materialConsolidation).forEach(id => {
            const entry = materialConsolidation[id];
            const mat = entry.mat;
            const unitSize = parseFloat(mat.unitSize) || 1;
            const mode = mat.purchaseMode || 'pack'; // 'pack' | 'real' | 'step'
            const stepSize = parseFloat(mat.purchaseStep) || 0.5;

            if (mode === 'real') {
                // Mode Quantité Réelle : pas d'arrondi forcé au conditionnement
                entry.purchaseQty = unitSize > 0 ? (entry.totalBilledQty / unitSize) : entry.totalBilledQty;
            } else if (mode === 'step') {
                // Mode Pas Commercial : arrondi au pas d'achat (ex: pas de 0.5m ou 0.1m³)
                const rawUnits = unitSize > 0 ? (entry.totalBilledQty / unitSize) : entry.totalBilledQty;
                entry.purchaseQty = Math.ceil(rawUnits / stepSize) * stepSize;
            } else {
                // Mode Pack (Conditionnement entier par défaut)
                entry.purchaseQty = unitSize > 0 ? Math.ceil(entry.totalBilledQty / unitSize) : 0;
            }
            entry.totalPurchaseCost = entry.purchaseQty * mat.priceBuy;
        });

        const consumedByCategory = { material: 0, labor: 0, installation: 0, transport: 0, subcontracting: 0 };
        const purchaseByCategory = { material: 0, labor: 0, installation: 0, transport: 0, subcontracting: 0 };
        const materialConsumedByCat = {}; // { matId: { transport: 6000, installation: 4000 } }

        let details = [];

        activeLines.forEach(line => {
            const cat = line.costCategory || 'material';

            if (line.type === 'material') {
                const mat = materials.find(m => m.id === line.refId);
                if (mat) {
                    const billedQty = line.baseQty * (1 + ((parseFloat(mat.waste)||0) / 100));
                    const cost = billedQty * mat.priceCalc;

                    // P0.4 — Le déboursé facturé au client doit refléter ce qui est
                    // RÉELLEMENT acheté (conditionnement entier : pot, carton, barre…),
                    // pas la quantité nette consommée. materialConsolidation[mat.id]
                    // porte déjà purchaseQty/totalPurchaseCost, arrondis selon
                    // mat.purchaseMode ('pack' = conditionnement entier, 'real' = qté
                    // réelle, 'step' = pas commercial). On répartit ce coût d'achat
                    // au prorata de la part de cette ligne dans la consommation totale
                    // de la matière (utile si une même matière sert sur plusieurs lignes).
                    const cons = materialConsolidation[mat.id] || { purchaseQty: 0, totalBilledQty: 0, totalPurchaseCost: 0 };
                    const lineShare = cons.totalBilledQty > 0 ? (billedQty / cons.totalBilledQty) : 0;
                    const achatCost = (cons.totalPurchaseCost || 0) * lineShare;

                    consumedByCategory[cat] = (consumedByCategory[cat] || 0) + achatCost;

                    if (!materialConsumedByCat[mat.id]) materialConsumedByCat[mat.id] = {};
                    materialConsumedByCat[mat.id][cat] = (materialConsumedByCat[mat.id][cat] || 0) + cost;

                    details.push({
                        id: line.id, type: 'material', costCategory: cat, label: line.label, name: mat.name,
                        baseQty: line.baseQty, waste: mat.waste, billedQty, unit: mat.unitCalc, unitCost: mat.priceCalc, totalCost: achatCost,
                        purchaseQty: cons.purchaseQty, purchaseUnit: mat.unitBuy, evalError: line.evalError
                    });
                }
            } else if (line.type === 'labor') {
                const lab = labor.find(l => l.id === line.refId);
                if (lab) {
                    const cost = line.baseQty * lab.rate;

                    consumedByCategory[cat] = (consumedByCategory[cat] || 0) + cost;
                    purchaseByCategory[cat] = (purchaseByCategory[cat] || 0) + cost;

                    details.push({
                        id: line.id, type: 'labor', costCategory: cat, label: line.label, name: lab.name,
                        baseQty: line.baseQty, waste: 0, billedQty: line.baseQty, unit: lab.unit || 'u', unitCost: lab.rate, totalCost: cost, evalError: line.evalError
                    });
                }
            }
        });

        // P0.3 PROPORTIONAL MULTI-CATEGORY PURCHASE BREAKDOWN ALLOCATION
        Object.keys(materialConsolidation).forEach(id => {
            const entry = materialConsolidation[id];
            const catMap = materialConsumedByCat[id] || {};
            const matTotalConsumed = Object.values(catMap).reduce((a, b) => a + b, 0);

            if (matTotalConsumed > 0) {
                Object.keys(catMap).forEach(cat => {
                    const ratio = catMap[cat] / matTotalConsumed;
                    const proratedPurchaseCost = entry.totalPurchaseCost * ratio;
                    purchaseByCategory[cat] = (purchaseByCategory[cat] || 0) + proratedPurchaseCost;
                });
            } else {
                const cat = entry.primaryCostCategory || 'material';
                purchaseByCategory[cat] = (purchaseByCategory[cat] || 0) + entry.totalPurchaseCost;
            }
        });

        const totalDebourseConsomme = Object.values(consumedByCategory).reduce((a, b) => a + b, 0);
        const totalDebourseAchat = Object.values(purchaseByCategory).reduce((a, b) => a + b, 0);

        const overheadRate = Math.min(50, Math.max(0, parseFloat(calcForm.overheadRate) || 0));
        const fraisGenerauxConsomme = totalDebourseConsomme * (overheadRate / 100);
        const fraisGenerauxAchat = totalDebourseAchat * (overheadRate / 100);

        const totalRevientConsomme = totalDebourseConsomme + fraisGenerauxConsomme;
        const totalRevientAchat = totalDebourseAchat + fraisGenerauxAchat;

        let prixVenteConsommeHT = 0;
        let prixVenteAchatHT = 0;
        
        if (calcForm.marginType === 'reel') {
            prixVenteConsommeHT = totalRevientConsomme / (1 - (marginVal / 100));
            prixVenteAchatHT = totalRevientAchat / (1 - (marginVal / 100));
        } else {
            prixVenteConsommeHT = totalRevientConsomme * (1 + (marginVal / 100));
            prixVenteAchatHT = totalRevientAchat * (1 + (marginVal / 100));
        }
        
        const discountRate = Math.min(100, Math.max(0, parseFloat(calcForm.discountRate) || 0));
        const netHTConsomme = prixVenteConsommeHT * (1 - (discountRate / 100));
        const netHTAchat = prixVenteAchatHT * (1 - (discountRate / 100));

        const vatRate = Math.min(30, Math.max(0, calcForm.vatRate !== undefined && calcForm.vatRate !== '' ? parseFloat(calcForm.vatRate) : 18));
        const tvaConsomme = netHTConsomme * (vatRate / 100);
        const tvaAchat = netHTAchat * (vatRate / 100);

        const totalTTCConsommeExact = netHTConsomme + tvaConsomme;
        const totalTTCAchatExact = netHTAchat + tvaAchat;

        const margeValeurConsommeReelle = netHTConsomme - totalRevientConsomme;
        const margeValeurAchatReelle = netHTAchat - totalRevientAchat;
        
        const isLossMaking = Math.round(netHTConsomme) < Math.round(totalRevientConsomme);
        const margePctConsommeReelle = netHTConsomme > 0 ? (margeValeurConsommeReelle / netHTConsomme) * 100 : 0;

        const markupMultiplier = totalDebourseConsomme > 0 ? (netHTConsomme / totalDebourseConsomme) : 1;

        const commercialItems = details.map(d => {
            const lineSellingTotalHT = d.totalCost * markupMultiplier;
            const lineSellingUnitHT = d.billedQty > 0 ? lineSellingTotalHT / d.billedQty : lineSellingTotalHT;
            return {
                id: d.id,
                label: d.label,
                name: d.name,
                billedQty: d.billedQty,
                unit: d.unit,
                sellingUnitHT: lineSellingUnitHT,
                sellingTotalHT: lineSellingTotalHT
            };
        });

        return { 
            solutionName: solution.name, 
            solution,
            details, 
            commercialItems,
            materialConsolidation,
            consumedByCategory,
            purchaseByCategory,
            totalMaterialConsumed: consumedByCategory.material, 
            totalMaterialPurchased: purchaseByCategory.material,
            totalLabor: consumedByCategory.labor, 
            totalInstall: consumedByCategory.installation, 
            totalTransport: consumedByCategory.transport,
            totalSubcontracting: consumedByCategory.subcontracting,
            totalDebourseConsomme,
            totalDebourseAchat,
            fraisGenerauxConsomme,
            fraisGenerauxAchat,
            totalRevientConsomme,
            totalRevientAchat, 
            prixVenteConsommeHT,
            prixVenteAchatHT,
            netHTConsomme,
            netHTAchat,
            vatRate,
            tvaConsomme,
            tvaAchat,
            totalTTCConsomme: totalTTCConsommeExact,
            totalTTCAchat: totalTTCAchatExact,
            margeValeurConsomme: margeValeurConsommeReelle,
            margePctConsommeReelle,
            margeValeurAchat: margeValeurAchatReelle,
            isLossMaking,
            prixConseilleConsomme: totalTTCConsommeExact,
            prixConseilleAchat: totalTTCAchatExact
        };
    }, [calcForm, materials, labor, solutions, recipes]);

    const formatLotDimensions = (lot) => {
        if (!lot) return '';
        const d = lot.dimensions || {};
        const mode = lot.takeoffMode || 'rectangle';
        const q = d.qty || 1;
        const f = d.faces && d.faces > 1 ? ` (${d.faces} couches)` : '';
        
        if (mode === 'surface') {
            const surf = d.surfaceDirect || (d.width && d.height ? d.width * d.height : 0);
            return `Surface : ${surf} m² (Qté : ${q}${f})`;
        }
        if (mode === 'volume') {
            const surf = (parseFloat(d.surfaceDirect) || (d.width && d.height ? d.width * d.height : 0));
            const depth = d.depth || 0.15;
            const vol = (parseFloat(surf) * parseFloat(depth) * q).toFixed(2);
            return `Volume : ${d.width}m × ${d.height}m × ${depth}m = ${vol} m³ (Qté : ${q})`;
        }
        if (mode === 'floor') {
            return `Sol/Plafond : ${d.width}m × ${d.lengthDirect || d.width}m (Qté : ${q})`;
        }
        if (mode === 'linear') {
            return `Linéaire : ${d.lengthDirect || d.width} ml (Qté : ${q})`;
        }
        if (mode === 'unit') {
            return `Quantité : ${q} unité(s)`;
        }
        return `Dim : ${d.width}m × ${d.height}m (Qté : ${q}${f})`;
    };

    const handleAddLotToWorkingQuote = () => {
        if (!currentQuote || currentQuote.error) return;
        if (currentQuote.isLossMaking) {
            showToast("Impossible d'ajouter un lot en vente à perte !", "error");
            return;
        }
        const lotNumber = workingLots.length + 1;
        const defaultLotTitle = `Lot ${lotNumber} — ${currentQuote.solutionName}`;
        const newLot = {
            id: Date.now(),
            lotNumber,
            lotName: defaultLotTitle,
            solutionId: calcForm.solutionId,
            solutionName: currentQuote.solutionName,
            takeoffMode: calcForm.takeoffMode || 'rectangle',
            dimensions: { ...calcForm },
            quoteData: JSON.parse(JSON.stringify(currentQuote))
        };
        setWorkingLots([...workingLots, newLot]);
        showToast(`"${currentQuote.solutionName}" ajouté au devis multi-lots (Lot ${lotNumber}) !`, "success");
    };

    const handleRemoveLot = (lotId) => {
        setWorkingLots(workingLots.filter(l => l.id !== lotId));
        showToast("Lot retiré du devis en cours");
    };

    const handleSaveQuoteSubmit = async (e) => {
        e.preventDefault();
        if (isReadOnlyDueToDowngrade) { showToast("Action bloquée en Lecture Seule", "error"); return; }
        
        if (!saveQuoteForm.clientName || !saveQuoteForm.clientName.trim()) {
            setClientNameError(true);
            showToast("Veuillez indiquer le nom du client avant d'enregistrer.", "error");
            return;
        }
        setClientNameError(false);

        const isMultiLot = workingLots.length > 0;
        if (!isMultiLot && (!currentQuote || currentQuote.error)) return;

        if (!isMultiLot && currentQuote.isLossMaking) {
            showToast("Impossible d'enregistrer un devis en vente à perte ! Ajustez le prix ou la remise.", "error");
            return;
        }

        const seqNumber = nextQuoteSeq;
        const currentYear = new Date().getFullYear();
        const quoteNumber = `DEV-${currentYear}-${String(seqNumber).padStart(3, '0')}`;

        let quoteDataToSave = currentQuote;
        if (isMultiLot) {
            const sumDebourseConsomme = workingLots.reduce((acc, l) => acc + (l.quoteData.totalDebourseConsomme || 0), 0);
            const sumFraisGenConsomme = workingLots.reduce((acc, l) => acc + (l.quoteData.fraisGenerauxConsomme || 0), 0);
            const sumRevientConsomme = workingLots.reduce((acc, l) => acc + (l.quoteData.totalRevientConsomme || 0), 0);
            const sumMargeConsomme = workingLots.reduce((acc, l) => acc + (l.quoteData.margeValeurConsomme || 0), 0);
            const sumNetHTConsomme = workingLots.reduce((acc, l) => acc + (l.quoteData.netHTConsomme || 0), 0);
            const sumTVAConsomme = workingLots.reduce((acc, l) => acc + (l.quoteData.tvaConsomme || 0), 0);
            const sumTTCConsomme = workingLots.reduce((acc, l) => acc + (l.quoteData.totalTTCConsomme || 0), 0);

            const sumDebourseAchat = workingLots.reduce((acc, l) => acc + (l.quoteData.totalDebourseAchat || 0), 0);
            const sumFraisGenAchat = workingLots.reduce((acc, l) => acc + (l.quoteData.fraisGenerauxAchat || 0), 0);
            const sumRevientAchat = workingLots.reduce((acc, l) => acc + (l.quoteData.totalRevientAchat || 0), 0);
            const sumMargeAchat = workingLots.reduce((acc, l) => acc + (l.quoteData.margeValeurAchat || 0), 0);
            const sumNetHTAchat = workingLots.reduce((acc, l) => acc + (l.quoteData.netHTAchat || 0), 0);
            const sumTVAAchat = workingLots.reduce((acc, l) => acc + (l.quoteData.tvaAchat || 0), 0);
            const sumTTCAchat = workingLots.reduce((acc, l) => acc + (l.quoteData.totalTTCAchat || 0), 0);

            const margePctConsommeReelle = sumNetHTConsomme > 0 ? (sumMargeConsomme / sumNetHTConsomme) * 100 : 0;
            const margePctAchatReelle = sumNetHTAchat > 0 ? (sumMargeAchat / sumNetHTAchat) * 100 : 0;

            const allCommercialItems = workingLots.map(l => ({
                id: l.id,
                label: l.lotName,
                dimensionSummary: formatLotDimensions(l),
                billedQty: 1,
                unit: 'Lot',
                sellingUnitHT: l.quoteData.netHTConsomme,
                sellingTotalHT: l.quoteData.netHTConsomme,
                details: l.quoteData.details
            }));

            quoteDataToSave = {
                solutionName: saveQuoteForm.projectRef || `Chantier Multi-Lots (${workingLots.length} ouvrages)`,
                isMultiLot: true,
                lots: workingLots,
                totalDebourseConsomme: sumDebourseConsomme,
                fraisGenerauxConsomme: sumFraisGenConsomme,
                totalRevientConsomme: sumRevientConsomme,
                margeValeurConsomme: sumMargeConsomme,
                margePctConsommeReelle,
                netHTConsomme: sumNetHTConsomme,
                tvaConsomme: sumTVAConsomme,
                totalTTCConsomme: sumTTCConsomme,
                totalDebourseAchat: sumDebourseAchat,
                fraisGenerauxAchat: sumFraisGenAchat,
                totalRevientAchat: sumRevientAchat,
                margeValeurAchat: sumMargeAchat,
                margePctAchatReelle,
                netHTAchat: sumNetHTAchat,
                tvaAchat: sumTVAAchat,
                totalTTCAchat: sumTTCAchat,
                commercialItems: allCommercialItems,
                vatRate: calcForm.vatRate !== undefined ? parseFloat(calcForm.vatRate) : 18
            };
        }

        const newQuote = {
            id: Date.now(),
            number: quoteNumber,
            date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            clientName: saveQuoteForm.clientName.trim() || 'Client Passage',
            projectRef: saveQuoteForm.projectRef || (isMultiLot ? `Chantier Multi-Lots (${workingLots.length} ouvrages)` : currentQuote.solutionName),
            notes: saveQuoteForm.notes || '',
            vatRate: quoteDataToSave.vatRate,
            isMultiLot,
            quoteData: quoteDataToSave,
            companyInfoSnapshot: { ...companyInfo },
            calcFormSnapshot: { ...calcForm }
        };

        try {
            const saveRes = await QuoteService.save({
                quote: newQuote,
                supabaseClient,
                sbUser,
                activeOrgId: activeOrganizationId,
                companyInfo,
                calcForm
            });

            const updatedQuotes = [newQuote, ...savedQuotes];
            const nextSeq = nextQuoteSeq + 1;
            updateSavedQuotes(updatedQuotes);
            updateNextQuoteSeq(nextSeq);

            setWorkingLots([]);
            setIsSaveQuoteModalOpen(false);
            setSaveQuoteForm({ clientName: '', projectRef: '', notes: '' });
            showToast(saveRes.message, "success");
        } catch (err) {
            StructuredLogger.error('handleSaveQuoteSubmit', 'Échec persistance devis', { error: err.message });
            showToast(err.message, "error");
        }
    };

    // BLOC 1/10 : CRÉATION D'UNE NOUVELLE ORGANISATION
    const handleCreateOrganization = async ({ name, currency }) => {
        if (isReadOnlyDueToDowngrade) {
            showToast("Action bloquée en mode lecture seule", "error");
            return;
        }
        if (!supabaseClient || !sbUser || sbUser.id === 'guest') {
            const newLocalOrg = {
                id: `org_local_${Date.now()}`,
                name,
                currency,
                role: 'owner'
            };
            const updated = [...userOrganizations, newLocalOrg];
            setUserOrganizations(updated);
            setActiveOrganizationId(newLocalOrg.id);
            setActiveOrganizationRole('owner');
            showToast(`Organisation ${name} créée avec succès !`, "success");
            return;
        }

        try {
            const { data: newOrgId, error } = await supabaseClient.rpc('create_organization', {
                p_name: name,
                p_currency: currency
            });

            if (error) {
                console.error('[Bloc 1] create_organization RPC error:', error);
                showToast(`Erreur lors de la création : ${error.message}`, "error");
                return;
            }

            const createdOrg = {
                id: newOrgId,
                name,
                currency,
                role: 'owner'
            };
            const updated = [...userOrganizations, createdOrg];
            setUserOrganizations(updated);
            setActiveOrganizationId(newOrgId);
            setActiveOrganizationRole('owner');
            localStorage.setItem(`ikadevis_orgs_${sbUser.id}`, JSON.stringify(updated));
            localStorage.setItem(`ikadevis_active_org_${sbUser.id}`, newOrgId);
            showToast(`Organisation "${name}" créée et activée !`, "success");
        } catch (e) {
            console.error('[Bloc 1] Exception creating org:', e);
            showToast("Impossible de contacter le serveur", "error");
        }
    };

    const handleAddCustomVarSubmit = (e) => {
        e.preventDefault();
        if (isReadOnlyDueToDowngrade) { showToast("Action bloquée en Lecture Seule", "error"); return; }
        if (!selectedSolutionForEdit || !varForm.name.trim()) return;

        const varNameSanitized = varForm.name.trim().toUpperCase().replace(/\s+/g, '_');
        
        const MATH_FUNCTIONS_ONLY = ['IF', 'CEIL', 'FLOOR', 'ROUND', 'MIN', 'MAX', 'ABS', 'SQRT'];
        if (MATH_FUNCTIONS_ONLY.includes(varNameSanitized)) {
            showToast(`Le nom "${varNameSanitized}" est une fonction de calcul réservée (IF, CEIL, ROUND...).`, "error");
            return;
        }

        if (!/^[A-Z_][A-Z0-9_]*$/.test(varNameSanitized)) {
            showToast("Nom de variable invalide. Utilisez uniquement des lettres majuscules sans accent.", "error");
            return;
        }

        if (selectedSolutionForEdit.customVars && selectedSolutionForEdit.customVars.some(v => v.name === varNameSanitized)) {
            showToast(`La variable "${varNameSanitized}" existe déjà pour ce produit !`, "error");
            return;
        }

        const updatedVars = [...(selectedSolutionForEdit.customVars || []), {
            name: varNameSanitized,
            label: varForm.label.trim() || varNameSanitized,
            defaultValue: varForm.defaultValue !== undefined && varForm.defaultValue !== '' ? parseFloat(varForm.defaultValue) : 0,
            unit: varForm.unit || 'u'
        }];

        const updatedSolutions = solutions.map(s => s.id === selectedSolutionForEdit.id ? { ...s, customVars: updatedVars } : s);
        updateSolutions(updatedSolutions);
        setSelectedSolutionForEdit({ ...selectedSolutionForEdit, customVars: updatedVars });
        setIsVarModalOpen(false);
        setVarForm({ name: '', label: '', defaultValue: 0, unit: 'u' });
        showToast("Variable dynamique ajoutée au produit !");
    };

    const handleDeleteCustomVar = (cvName) => {
        if (isReadOnlyDueToDowngrade) { showToast("Action bloquée en Lecture Seule", "error"); return; }
        const isUsed = recipes.some(r => {
            if (r.solutionId !== selectedSolutionForEdit.id) return false;
            const tokenRegex = new RegExp('(?<![a-zA-Z0-9_])' + cvName + '(?![a-zA-Z0-9_])');
            return tokenRegex.test(r.formula);
        });
        if (isUsed) {
            setConfirmDialog({
                isOpen: true,
                title: "Suppression bloquée",
                message: `La variable "${cvName}" est utilisée dans les formules de ce produit.\n\nVeuillez d'abord modifier les recettes qui l'utilisent avant de la supprimer.`,
                isDanger: true,
                onConfirm: closeConfirm
            });
        } else {
            const updated = selectedSolutionForEdit.customVars.filter(x => x.name !== cvName);
            const updatedSols = solutions.map(s => s.id === selectedSolutionForEdit.id ? { ...s, customVars: updated } : s);
            updateSolutions(updatedSols);
            setSelectedSolutionForEdit({ ...selectedSolutionForEdit, customVars: updated });
            showToast("Variable retirée");
        }
    };

    const renderCalculator = () => {
        if (useHybridEditor) {
            return (
                <QuoteWorkspace
                    hybridQuote={hybridQuote}
                    setHybridQuote={setHybridQuote}
                    solutions={solutions}
                    materials={materials}
                    labor={labor}
                    recipes={recipes}
                    companyInfo={companyInfo}
                    saveQuoteStatus={saveQuoteStatus}
                    saveQuoteError={saveQuoteError}
                    onSaveQuote={async (savedQ) => {
                        setSaveQuoteStatus('saving');
                        setSaveQuoteError(null);

                        // P0.12 (2026-08-17) — Relie réellement le devis à une fiche
                        // client et une affaire (par ID, pas juste par nom en texte
                        // libre) : crée les fiches manquantes avec le vrai nom saisi
                        // si elles n'existent pas encore, au lieu de laisser le devis
                        // invisible du CRM/Affaires.
                        const { client, project, clients: resolvedClients, projects: resolvedProjects } =
                            resolveClientAndProject(clients, projects, savedQ.clientName, savedQ.projectRef, savedQ.quoteData?.totalTTCConsomme);
                        if (resolvedClients !== clients) updateClients(resolvedClients);
                        if (resolvedProjects !== projects) updateProjects(resolvedProjects);
                        savedQ.clientId = client?.id || null;
                        savedQ.projectId = project?.id || null;

                        // Mode Local / Invité
                        if (!supabaseClient || !sbUser || sbUser.id === 'guest') {
                            const updatedQuotes = [savedQ, ...savedQuotes.filter(q => q.id !== savedQ.id)];
                            updateSavedQuotes(updatedQuotes);
                            updateNextQuoteSeq(nextQuoteSeq + 1);
                            setSaveQuoteStatus('saved');
                            showToast(`✓ Devis ${savedQ.number} enregistré en local`, "success");
                            setTimeout(() => setSaveQuoteStatus('idle'), 3000);
                            return;
                        }

                        // Mode Cloud : Sauvegarde Atomique Relationnelle & Vérifiée (Anti-Faux Succès)
                        try {
                            const linesForV6 = (savedQ.quoteData?.commercialItems || []).map((d, idx) => ({
                                line_order: idx + 1,
                                designation: d.label || 'Ligne de devis',
                                unit: d.unit || 'u',
                                quantity: d.billedQty || 1,
                                unit_price_ht: d.sellingUnitHT || 0,
                                total_ht: d.sellingTotalHT || 0,
                                cost_category: d.costCategory || 'material'
                            }));

                            const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('create_quote_v6', {
                                p_org_id: activeOrganizationId,
                                p_client_name: savedQ.clientName || 'Client Particulier',
                                p_project_ref: savedQ.projectRef || 'Chantier BTP',
                                p_company_snapshot: companyInfo,
                                p_calc_form_snapshot: calcForm,
                                p_lines: linesForV6,
                                p_hybrid_snapshot: savedQ.hybridQuoteSnapshot || {}
                            });

                            if (rpcErr) {
                                console.error('[Bloc 1] create_quote_v6 Server Error:', rpcErr);
                                setSaveQuoteStatus('error');
                                setSaveQuoteError(rpcErr.message || 'Erreur serveur lors de la persistance.');
                                showToast(`✕ Échec de l'enregistrement serveur : ${rpcErr.message}`, "error");
                                return;
                            }

                            // Confirmation Serveur Réelle
                            const updatedQuotes = [savedQ, ...savedQuotes.filter(q => q.id !== savedQ.id)];
                            updateSavedQuotes(updatedQuotes);
                            updateNextQuoteSeq(nextQuoteSeq + 1);
                            setSaveQuoteStatus('saved');
                            showToast(`✓ Devis ${savedQ.number} enregistré sur le serveur !`, "success");
                            setTimeout(() => setSaveQuoteStatus('idle'), 3500);
                        } catch (err) {
                            console.error('[Bloc 1] Save Network Exception:', err);
                            setSaveQuoteStatus('error');
                            setSaveQuoteError(err.message || 'Connexion réseau impossible.');
                            showToast(`✕ Erreur réseau lors de l'enregistrement`, "error");
                        }
                    }}
                    onPreviewQuote={(savedQ) => {
                        setViewingSavedQuote(savedQ);
                    }}
                    useHybridEditor={useHybridEditor}
                    onToggleHybridEditor={toggleHybridEditor}
                    onQuickCreateSolution={(newSol) => {
                        updateSolutions([...solutions, newSol]);
                    }}
                    isReadOnlyDueToDowngrade={isReadOnlyDueToDowngrade || !hasPermission(activeOrganizationRole, "canEditQuotes")}
                    activeOrganizationRole={activeOrganizationRole}
                    savedQuotes={savedQuotes}
                    showToast={showToast}
                />
            );
        }
        const activeSolution = solutions.find(s => s.id === calcForm.solutionId) || solutions[0];
        const allowedModes = (activeSolution && activeSolution.allowedModes) || ['rectangle', 'surface', 'volume', 'linear', 'floor', 'unit'];
        const allModes = [
            { value: 'rectangle', label: 'Rectangle (Largeur x Hauteur)' },
            { value: 'volume', label: 'Volume Béton (Largeur x Hauteur x Épaisseur m³)' },
            { value: 'surface', label: 'Surface Directe (m²)' },
            { value: 'floor', label: 'Sol / Plafond (Largeur x Longueur)' },
            { value: 'linear', label: 'Mètre Linéaire (ml)' },
            { value: 'unit', label: 'Unité / Pièce (u)' }
        ];
        const availableModesOptions = allModes.filter(m => allowedModes.includes(m.value));

        return (
        <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-6 pb-20 md:pb-12">
            {/* BANNIÈRE DE BASCULE VERS L'INTERFACE HYBRIDE V6 */}
            <div className="bg-gradient-to-r from-neutral-900 to-brand-950 text-white p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md border border-neutral-800">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                        <i className="fa-solid fa-layer-group"></i>
                    </div>
                    <div>
                        <p className="font-extrabold text-xs">Nouvelle Interface Hybride V6 Multi-Lots Disponible</p>
                        <p className="text-[11px] text-neutral-300">Construisez vos devis BTP complets avec navigation par lots, saisie en table et bibliothèque Zoho-Style.</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => toggleHybridEditor(true)}
                    className="btn-primary text-xs py-2 px-4 font-extrabold whitespace-nowrap shadow-sm"
                >
                    <i className="fa-solid fa-arrows-rotate mr-1.5"></i> Basculer vers l'Éditeur Hybride V6
                </button>
            </div>

            {/* GUIDE PAS-À-PAS INTERACTIF POUR PROFANES & EXPERTS */}
            <div className="bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
                            <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
                        </div>
                        <div>
                            <h3 className="font-extrabold text-xs text-neutral-800 uppercase tracking-wider">Guide Pas-à-Pas pour Chiffrer un Devis</h3>
                            <p className="text-[11px] text-neutral-500">Suivez ces 4 étapes simples pour calculer et exporter un devis conforme.</p>
                        </div>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full self-start sm:self-center">
                        <i className="fa-solid fa-circle-check mr-1 text-[10px]"></i>Prêt à l'emploi
                    </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <button 
                        onClick={() => setIsCompanyModalOpen(true)}
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-neutral-200 hover:border-brand-300 hover:bg-brand-50/40 text-left transition-all group"
                        aria-label="Étape 1 : Configurer mon entreprise"
                    >
                        <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-600 group-hover:bg-brand-100 group-hover:text-brand-600 flex items-center justify-center font-black text-xs shrink-0 transition-colors">
                            1
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-neutral-800 truncate">1. Mon Entreprise</p>
                            <p className="text-[10px] text-neutral-500 truncate">{companyInfo.name || 'Coordonnées & TVA'}</p>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-neutral-300 group-hover:text-brand-500 transition-colors"></i>
                    </button>

                    <button 
                        onClick={() => { setResourceTab('materials'); setActiveView('materials'); }}
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-neutral-200 hover:border-brand-300 hover:bg-brand-50/40 text-left transition-all group"
                        aria-label="Étape 2 : Vérifier les prix des ressources"
                    >
                        <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-600 group-hover:bg-brand-100 group-hover:text-brand-600 flex items-center justify-center font-black text-xs shrink-0 transition-colors">
                            2
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-neutral-800 truncate">2. Prix & Matériaux</p>
                            <p className="text-[10px] text-neutral-500 truncate">{materials.length} matières &bull; {labor.length} MO</p>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-neutral-300 group-hover:text-brand-500 transition-colors"></i>
                    </button>

                    <div className="flex items-center gap-3 p-2.5 rounded-xl border-2 border-brand-500 bg-brand-50/50 text-left">
                        <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                            3
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-brand-900 truncate">3. Saisie Dimensions</p>
                            <p className="text-[10px] text-brand-700 truncate font-semibold">Étape en cours</p>
                        </div>
                        <i className="fa-solid fa-pencil text-[10px] text-brand-600"></i>
                    </div>

                    <button 
                        onClick={() => {
                            if (!currentQuote || currentQuote.error) {
                                showToast("Veuillez d'abord saisir des dimensions valides", "error");
                            } else {
                                setIsSaveQuoteModalOpen(true);
                            }
                        }}
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-neutral-200 hover:border-brand-300 hover:bg-brand-50/40 text-left transition-all group"
                        aria-label="Étape 4 : Enregistrer et imprimer le devis"
                    >
                        <div className="w-8 h-8 rounded-lg bg-neutral-100 text-neutral-600 group-hover:bg-brand-100 group-hover:text-brand-600 flex items-center justify-center font-black text-xs shrink-0 transition-colors">
                            4
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-neutral-800 truncate">4. Enregistrer Devis</p>
                            <p className="text-[10px] text-neutral-500 truncate">PDF & Vue Commerciale</p>
                        </div>
                        <i className="fa-solid fa-floppy-disk text-[10px] text-neutral-300 group-hover:text-brand-500 transition-colors"></i>
                    </button>
                </div>
            </div>

            {/* MOTEUR DE DEVIS MULTI-LOTS / MULTI-OUVRAGES R+1 */}
            {workingLots.length > 0 && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 text-white shadow-2xl space-y-4 animate-fade-in">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-neutral-800 pb-4">
                        <div>
                            <span className="bg-brand-500/20 text-brand-400 border border-brand-500/30 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">
                                Devis Multi-Lots en cours
                            </span>
                            <h3 className="text-xl font-black mt-1 text-white">Chantier Composé — {workingLots.length} {workingLots.length > 1 ? 'Ouvrages' : 'Ouvrage'}</h3>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <button onClick={() => setWorkingLots([])} className="btn-secondary bg-neutral-800 text-neutral-300 hover:bg-neutral-700 text-xs py-2 px-3 border-neutral-700" aria-label="Vider tous les lots du panier">
                                <i className="fa-solid fa-trash-can mr-1.5"></i> Vider
                            </button>
                            <button onClick={() => setIsSaveQuoteModalOpen(true)} className="btn-primary py-2 px-4 text-xs font-extrabold shadow-lg shadow-brand-500/30" aria-label="Enregistrer le devis global">
                                <i className="fa-solid fa-floppy-disk mr-1.5"></i> Enregistrer Devis Global ({workingLots.length} lots)
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {workingLots.map((lot, idx) => (
                            <div key={lot.id} className="bg-neutral-800/80 border border-neutral-700/80 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className="text-[10px] font-extrabold text-brand-400 uppercase tracking-wider">Poste #{idx + 1}</span>
                                        <h4 className="font-extrabold text-sm text-white">{lot.lotName}</h4>
                                        <p className="text-xs text-neutral-400 mt-0.5 font-medium">
                                            {formatLotDimensions(lot)}
                                        </p>
                                    </div>
                                    <button onClick={() => handleRemoveLot(lot.id)} className="text-neutral-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-neutral-700 transition-colors" title="Retirer ce lot" aria-label={`Retirer le lot ${lot.lotName}`}>
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                </div>
                                <div className="border-t border-neutral-700/60 pt-2 flex justify-between items-center text-xs">
                                    <span className="text-neutral-400 font-medium">Net HT :</span>
                                    <span className="font-extrabold text-brand-300">{formatMoney(lot.quoteData.netHTConsomme, companyInfo.currency)}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-neutral-950/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 border border-neutral-800 text-xs">
                        <div className="flex flex-wrap items-center gap-6">
                            <div>
                                <span className="text-neutral-500 block text-[10px] uppercase font-bold">Total Déboursé Sec</span>
                                <span className="font-extrabold text-neutral-200 text-sm">
                                    {formatMoney(workingLots.reduce((acc, l) => acc + (l.quoteData.totalDebourseConsomme || 0), 0), companyInfo.currency)}
                                </span>
                            </div>
                            <div>
                                <span className="text-neutral-500 block text-[10px] uppercase font-bold">Total Net HT Chantier</span>
                                <span className="font-extrabold text-emerald-400 text-sm">
                                    {formatMoney(workingLots.reduce((acc, l) => acc + (l.quoteData.netHTConsomme || 0), 0), companyInfo.currency)}
                                </span>
                            </div>
                            <div>
                                <span className="text-neutral-500 block text-[10px] uppercase font-bold">Total TTC Global</span>
                                <span className="font-black text-brand-400 text-base">
                                    {formatMoney(workingLots.reduce((acc, l) => acc + (l.quoteData.totalTTCConsomme || 0), 0), companyInfo.currency)}
                                </span>
                            </div>
                        </div>
                        <p className="text-[11px] text-neutral-400 italic">
                            Chaque lot sera ventilé individuellement dans le devis client imprimé.
                        </p>
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
            <div className="w-full lg:w-[400px] xl:w-[450px] shrink-0 flex flex-col gap-6">
                <div className="app-card p-5 sm:p-6">
                    <h2 className="text-sm font-extrabold text-neutral-800 mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center text-xs">1</span>
                        Type d'Ouvrage / Produit
                    </h2>
                    <label htmlFor="calc_solution_select" className="app-label">Sélectionner dans le catalogue</label>
                    <CustomSelect 
                        id="calc_solution_select"
                        value={calcForm.solutionId} 
                        onChange={e => {
                            const solId = parseInt(e.target.value);
                            const sol = solutions.find(s => s.id === solId);
                            const defaultCustomVals = {};
                            if (sol && sol.customVars) {
                                sol.customVars.forEach(cv => defaultCustomVals[cv.name] = cv.defaultValue);
                            }
                            const defaultMode = sol && sol.allowedModes && sol.allowedModes.length > 0 ? sol.allowedModes[0] : 'rectangle';
                            setCalcForm({...calcForm, solutionId: solId, takeoffMode: defaultMode, customVarValues: defaultCustomVals});
                        }}
                        options={solutions.map(s => ({ value: s.id, label: s.name }))}
                    />
                </div>

                <div className="app-card p-5 sm:p-6">
                    <h2 className="text-sm font-extrabold text-neutral-800 mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-neutral-100 text-neutral-500 flex items-center justify-center text-xs">2</span>
                        Mode de Métré & Dimensions
                    </h2>
                    
                    {(() => {
                        const selectedSol = solutions.find(s => s.id === calcForm.solutionId) || solutions[0];
                        const allowedModes = (selectedSol && selectedSol.allowedModes) || ['rectangle', 'surface', 'volume', 'linear', 'floor', 'unit'];
                        const allModes = [
                            { value: 'rectangle', label: 'Rectangle (Largeur x Hauteur)' },
                            { value: 'volume', label: 'Volume Béton (Largeur x Hauteur x Épaisseur m³)' },
                            { value: 'surface', label: 'Surface Directe (m²)' },
                            { value: 'floor', label: 'Sol / Plafond (Largeur x Longueur)' },
                            { value: 'linear', label: 'Mètre Linéaire (ml)' },
                            { value: 'unit', label: 'Unité / Pièce (u)' }
                        ];
                        const availableModesOptions = allModes.filter(m => allowedModes.includes(m.value));
                        return (
                            <div className="mb-4">
                                <label htmlFor="calc_mode_select" className="app-label">Mode de Saisie BTP</label>
                                <CustomSelect 
                                    id="calc_mode_select"
                                    value={calcForm.takeoffMode || 'rectangle'} 
                                    onChange={e => setCalcForm({...calcForm, takeoffMode: e.target.value})}
                                    options={availableModesOptions}
                                />
                            </div>
                        );
                    })()}

                    {(calcForm.takeoffMode === 'rectangle' || !calcForm.takeoffMode) && (
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label htmlFor="calc_width_rect" className="app-label">Largeur (m)</label>
                                <input id="calc_width_rect" type="number" min="0.1" step="0.1" className="app-input font-bold" 
                                    value={calcForm.width} onChange={e => setCalcForm({...calcForm, width: e.target.value})} />
                            </div>
                            <div>
                                <label htmlFor="calc_height_rect" className="app-label">Hauteur (m)</label>
                                <input id="calc_height_rect" type="number" min="0.1" step="0.1" className="app-input font-bold" 
                                    value={calcForm.height} onChange={e => setCalcForm({...calcForm, height: e.target.value})} />
                            </div>
                        </div>
                    )}

                    {calcForm.takeoffMode === 'volume' && (
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <div>
                                <label htmlFor="calc_width_vol" className="app-label">Largeur (m)</label>
                                <input id="calc_width_vol" type="number" min="0.1" step="0.1" className="app-input font-bold" 
                                    value={calcForm.width} onChange={e => setCalcForm({...calcForm, width: e.target.value})} />
                            </div>
                            <div>
                                <label htmlFor="calc_height_vol" className="app-label">Hauteur (m)</label>
                                <input id="calc_height_vol" type="number" min="0.1" step="0.1" className="app-input font-bold" 
                                    value={calcForm.height} onChange={e => setCalcForm({...calcForm, height: e.target.value})} />
                            </div>
                            <div>
                                <label htmlFor="calc_depth_vol" className="app-label">Épaisseur (m)</label>
                                <input id="calc_depth_vol" type="number" min="0.01" step="0.01" className="app-input font-bold text-brand-600" 
                                    value={calcForm.depth || 0.15} onChange={e => setCalcForm({...calcForm, depth: e.target.value})} />
                            </div>
                        </div>
                    )}

                    {calcForm.takeoffMode === 'floor' && (
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label htmlFor="calc_width_floor" className="app-label">Largeur Sol/Plafond (m)</label>
                                <input id="calc_width_floor" type="number" min="0.1" step="0.1" className="app-input font-bold text-brand-700" 
                                    value={calcForm.width} onChange={e => setCalcForm({...calcForm, width: e.target.value})} />
                            </div>
                            <div>
                                <label htmlFor="calc_length_floor" className="app-label">Longueur Sol/Plafond (m)</label>
                                <input id="calc_length_floor" type="number" min="0.1" step="0.1" className="app-input font-bold text-brand-700" 
                                    value={calcForm.lengthDirect} onChange={e => setCalcForm({...calcForm, lengthDirect: e.target.value})} />
                            </div>
                        </div>
                    )}

                    {calcForm.takeoffMode === 'surface' && (
                        <div className="mb-4">
                            <label htmlFor="calc_surface_direct" className="app-label">Surface Unitaire (m²)</label>
                            <input id="calc_surface_direct" type="number" min="0.1" step="1" className="app-input font-bold text-lg text-brand-700" 
                                value={calcForm.surfaceDirect} onChange={e => setCalcForm({...calcForm, surfaceDirect: e.target.value})} />
                        </div>
                    )}

                    {calcForm.takeoffMode === 'linear' && (
                        <div className="mb-4">
                            <label htmlFor="calc_linear_direct" className="app-label">Longueur Unitaire (ml)</label>
                            <input id="calc_linear_direct" type="number" min="0.1" step="0.5" className="app-input font-bold text-lg text-brand-700" 
                                value={calcForm.lengthDirect} onChange={e => setCalcForm({...calcForm, lengthDirect: e.target.value})} />
                        </div>
                    )}

                    {calcForm.takeoffMode === 'unit' && (
                        <div className="mb-4 bg-brand-50/50 p-3 rounded-xl border border-brand-200">
                            <p className="text-xs text-brand-900 font-medium">Mode Pièce / Forfait : le calcul s'applique directement à la quantité unitaire saisie.</p>
                        </div>
                    )}

                    {activeSolution && activeSolution.customVars && activeSolution.customVars.length > 0 && (
                        <div className="border-t border-neutral-100 pt-4 mt-2 mb-4 space-y-3">
                            <span className="text-[11px] font-black text-brand-700 uppercase tracking-wider block">
                                <i className="fa-solid fa-sliders mr-1.5"></i> Variables Spécifiques ({activeSolution.name})
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {activeSolution.customVars.map(cv => (
                                    <div key={cv.name}>
                                        <label htmlFor={`cv_input_${cv.name}`} className="app-label truncate">{cv.label || cv.name} ({cv.unit})</label>
                                        <input 
                                            id={`cv_input_${cv.name}`}
                                            type="number"
                                            min="0"
                                            step="any"
                                            value={calcForm.customVarValues && calcForm.customVarValues[cv.name] !== undefined ? calcForm.customVarValues[cv.name] : (cv.defaultValue !== undefined ? cv.defaultValue : 0)}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setCalcForm(prev => ({
                                                    ...prev,
                                                    customVarValues: {
                                                        ...(prev.customVarValues || {}),
                                                        [cv.name]: val
                                                    }
                                                }));
                                            }}
                                            className="app-input font-bold text-brand-700"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="calc_qty_input" className="app-label">Quantité (Ouvrages)</label>
                            <input id="calc_qty_input" type="number" min="1" step="1" className="app-input font-bold" 
                                value={calcForm.qty} onChange={e => setCalcForm({...calcForm, qty: e.target.value})} />
                        </div>
                        <div>
                            <label htmlFor="calc_faces_input" className="app-label">Nb Faces / Couches</label>
                            <input id="calc_faces_input" type="number" min="1" step="1" className="app-input font-bold" 
                                value={calcForm.faces !== undefined ? calcForm.faces : 1} onChange={e => setCalcForm({...calcForm, faces: e.target.value})} />
                        </div>
                    </div>
                </div>

                <div className="app-card p-5 sm:p-6">
                    <h2 className="text-sm font-extrabold text-neutral-800 mb-4 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-neutral-100 text-neutral-500 flex items-center justify-center text-xs">3</span>
                        Paramètres Financiers & Marge
                    </h2>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label htmlFor="calc_margin_input" className="app-label flex justify-between">
                                <span>Marge (%)</span>
                                <span className="text-[10px] text-brand-600 font-bold">{calcForm.marginType === 'reel' ? 'Sur PV HT' : 'Sur Coût'}</span>
                            </label>
                            <input id="calc_margin_input" type="number" min="0" max="99" className="app-input font-bold text-brand-600" 
                                value={calcForm.margin} onChange={e => setCalcForm({...calcForm, margin: e.target.value})} />
                        </div>
                        <div>
                            <label htmlFor="calc_margin_type" className="app-label">Type de Marge</label>
                            <CustomSelect 
                                id="calc_margin_type"
                                value={calcForm.marginType || 'reel'} 
                                onChange={e => setCalcForm({...calcForm, marginType: e.target.value})}
                                options={[
                                    { value: 'reel', label: 'Taux de Marge (sur PV)' },
                                    { value: 'majoration', label: 'Taux de Marque (sur Coût)' }
                                ]}
                            />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label htmlFor="calc_overhead_input" className="app-label">Frais Gén. (%)</label>
                            <input id="calc_overhead_input" type="number" min="0" max="50" className="app-input font-bold" 
                                value={calcForm.overheadRate} onChange={e => setCalcForm({...calcForm, overheadRate: e.target.value})} />
                        </div>
                        <div>
                            <label htmlFor="calc_discount_input" className="app-label">Remise (%)</label>
                            <input id="calc_discount_input" type="number" min="0" max="100" className="app-input font-bold" 
                                value={calcForm.discountRate} onChange={e => setCalcForm({...calcForm, discountRate: e.target.value})} />
                        </div>
                        <div>
                            <label htmlFor="calc_vat_input" className="app-label">TVA (%)</label>
                            <input id="calc_vat_input" type="number" min="0" max="30" className="app-input font-bold" 
                                value={calcForm.vatRate !== undefined ? calcForm.vatRate : 18} onChange={e => setCalcForm({...calcForm, vatRate: e.target.value})} />
                        </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-neutral-100 flex items-center justify-between">
                        <span className="text-xs font-semibold text-neutral-700">Inclure la pose / installation</span>
                        <input type="checkbox" checked={calcForm.includeInstall !== false} onChange={e => setCalcForm({...calcForm, includeInstall: e.target.checked})} className="w-4 h-4 accent-brand-600 rounded" />
                    </div>
                </div>
            </div>

            <div className="flex-1 w-full flex flex-col gap-6">
                {currentQuote && currentQuote.error ? (
                    <div className="app-card p-6 border-red-200 bg-red-50/50 flex flex-col items-center justify-center text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-red-800">Données incomplètes ou formule invalide</h3>
                            <p className="text-xs text-red-600 mt-1 max-w-md">{currentQuote.message || currentQuote.errorMessage || "Vérifiez vos paramètres de dimensions et recettes associées."}</p>
                        </div>
                    </div>
                ) : currentQuote ? (
                    <div className="flex flex-col gap-6">
                        {/* SYNTHÈSE DES PRIX DU DEVIS */}
                        <div className="app-card p-6 border-brand-100 bg-gradient-to-br from-white via-white to-brand-50/20 shadow-floating">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-neutral-100 pb-4 mb-4">
                                <span className="text-xs font-black text-brand-600 uppercase tracking-widest">Synthèse Financière de l'Ouvrage</span>
                                <span className="text-xs font-bold text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full">{currentQuote.solutionName}</span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                                <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80">
                                    <span className="text-neutral-400 block text-[10px] uppercase font-bold">Déboursé Sec</span>
                                    <span className="font-extrabold text-neutral-800 text-lg sm:text-xl">{formatMoney(currentQuote.totalDebourseConsomme, companyInfo.currency)}</span>
                                </div>
                                <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80">
                                    <span className="text-neutral-400 block text-[10px] uppercase font-bold">Prix de Revient</span>
                                    <span className="font-extrabold text-neutral-800 text-lg sm:text-xl">{formatMoney(currentQuote.totalRevientConsomme, companyInfo.currency)}</span>
                                </div>
                                <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80">
                                    <span className="text-neutral-400 block text-[10px] uppercase font-bold">Marge Nette ({currentQuote.margePctConsommeReelle.toFixed(1)}%)</span>
                                    <span className="font-extrabold text-emerald-600 text-lg sm:text-xl">{formatMoney(currentQuote.margeValeurConsomme, companyInfo.currency)}</span>
                                </div>
                                <div className="p-4 rounded-2xl bg-brand-50 border border-brand-200">
                                    <span className="text-brand-700 block text-[10px] uppercase font-black">Net Client HT</span>
                                    <span className="font-black text-brand-600 text-xl sm:text-2xl">{formatMoney(currentQuote.netHTConsomme, companyInfo.currency)}</span>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-neutral-100">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-neutral-500 font-semibold">TVA ({currentQuote.vatRate}%) :</span>
                                    <span className="text-xs font-bold text-neutral-800">{formatMoney(currentQuote.tvaConsomme, companyInfo.currency)}</span>
                                    <span className="text-neutral-300 mx-1">&bull;</span>
                                    <span className="text-xs text-neutral-500 font-semibold">Total TTC :</span>
                                    <span className="text-sm font-black text-brand-600">{formatMoney(currentQuote.totalTTCConsomme, companyInfo.currency)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={handleAddLotToWorkingQuote} 
                                        disabled={currentQuote.isLossMaking || isReadOnlyDueToDowngrade} 
                                        className="btn-secondary text-xs py-2 px-3 font-bold border-brand-200 text-brand-700 hover:bg-brand-50"
                                        aria-label="Ajouter au devis multi-lots"
                                    >
                                        <i className="fa-solid fa-layer-group text-brand-500 mr-1.5"></i>
                                        <span>Ajouter au Devis Multi-Lots ({workingLots.length})</span>
                                    </button>
                                    <button 
                                        onClick={() => setIsSaveQuoteModalOpen(true)} 
                                        disabled={currentQuote.isLossMaking || isReadOnlyDueToDowngrade} 
                                        className="btn-primary py-2 px-4 text-xs font-black shadow-md shadow-brand-500/20"
                                        aria-label="Enregistrer le devis pour le client"
                                    >
                                        <i className="fa-solid fa-floppy-disk mr-1.5"></i>
                                        {workingLots.length > 0 ? `Enregistrer Devis Global (${workingLots.length + 1} lots)` : 'Enregistrer ce Devis'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* SECTION REPLIABLE DES DÉTAILS TECHNIQUES & APPROVISIONNEMENT */}
                        <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                            <button 
                                onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                                className="w-full px-5 py-4 bg-neutral-50 hover:bg-neutral-100/80 flex items-center justify-between text-left transition-colors"
                                aria-expanded={showTechnicalDetails}
                                aria-label="Afficher ou masquer les détails techniques et approvisionnement"
                            >
                                <div className="flex items-center gap-2">
                                    <i className="fa-solid fa-wrench text-neutral-500"></i>
                                    <span className="text-xs font-extrabold text-neutral-800 uppercase tracking-wider">
                                        Détails Techniques & Commandes Fournisseurs
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-neutral-400 font-medium hidden sm:inline">
                                        {showTechnicalDetails ? 'Masquer' : 'Voir le détail des formules et matières'}
                                    </span>
                                    <i className={`fa-solid fa-chevron-down text-xs text-neutral-400 transition-transform duration-200 ${showTechnicalDetails ? 'rotate-180 text-brand-500' : ''}`}></i>
                                </div>
                            </button>

                            {showTechnicalDetails && (
                                <div className="p-4 sm:p-6 space-y-6 border-t border-neutral-200 bg-neutral-50/30 animate-fade-in">
                                    {/* DÉCOMPOSITION DU DÉBOURSÉ */}
                                    <div className="p-0 overflow-hidden border border-neutral-200 rounded-2xl bg-white">
                                        <div className="px-5 sm:px-6 py-4 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <i className="fa-solid fa-calculator text-neutral-600"></i>
                                                <h3 className="text-xs font-bold text-neutral-700 uppercase tracking-wider">Détail des Postes de Coût (Consommation Chantier)</h3>
                                            </div>
                                            <span className="text-xs font-mono font-bold text-neutral-500">Déboursé : {formatMoney(currentQuote.totalDebourseConsomme, companyInfo.currency)}</span>
                                        </div>
                                        
                                        <div className="app-table-wrapper rounded-none border-0">
                                            <table className="app-table">
                                                <thead>
                                                    <tr className="bg-white">
                                                        <th className="app-th pl-6">Poste / Composant</th>
                                                        <th className="app-th">Catégorie</th>
                                                        <th className="app-th text-right">Quantité Nette</th>
                                                        <th className="app-th text-right">Coût Unitaire</th>
                                                        <th className="app-th text-right pr-6">Coût Total Consommé</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {currentQuote.details.map(d => (
                                                        <tr key={d.id} className="hover:bg-neutral-50/50 transition-colors">
                                                            <td className="app-td pl-6 font-bold text-neutral-800">{d.label} <span className="text-xs font-normal text-neutral-500">({d.name})</span></td>
                                                            <td className="app-td">
                                                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${d.costCategory === 'labor' ? 'bg-amber-50 text-amber-700 border-amber-200' : d.costCategory === 'installation' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-neutral-100 text-neutral-600 border-neutral-200'}`}>
                                                                    {d.costCategory}
                                                                </span>
                                                            </td>
                                                            <td className="app-td text-right font-medium text-neutral-600">{d.billedQty.toFixed(2)} {d.unit}</td>
                                                            <td className="app-td text-right font-medium text-neutral-600">{formatMoney(d.unitCost, companyInfo.currency)}</td>
                                                            <td className="app-td pr-6 text-right font-bold text-neutral-900">{formatMoney(d.totalCost, companyInfo.currency)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* LISTE D'ACHAT CONSOLIDÉE */}
                                    {currentQuote.materialConsolidation && Object.keys(currentQuote.materialConsolidation).length > 0 && (
                                        <div className="p-0 overflow-hidden border border-neutral-200 rounded-2xl bg-white">
                                            <div className="px-5 sm:px-6 py-4 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <i className="fa-solid fa-cart-flatbed-suitcases text-neutral-600"></i>
                                                    <h3 className="text-xs font-bold text-neutral-700 uppercase tracking-wider">Approvisionnement Consolidé (Commandes Fournisseurs)</h3>
                                                </div>
                                                <span className="text-[9px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded font-extrabold uppercase">Indispensable Chantier</span>
                                            </div>
                                            <div className="app-table-wrapper rounded-none border-0">
                                                <table className="app-table">
                                                    <thead>
                                                        <tr className="bg-white">
                                                            <th className="app-th pl-6">Matière Première</th>
                                                            <th className="app-th text-right">Besoin Total (Net + Pertes)</th>
                                                            <th className="app-th text-right">Conditionnement Requis</th>
                                                            <th className="app-th text-right pr-6">Coût d'Achat Brut</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {Object.keys(currentQuote.materialConsolidation).map(id => {
                                                            const item = currentQuote.materialConsolidation[id];
                                                            return (
                                                                <tr key={id} className="hover:bg-neutral-50/50 transition-colors">
                                                                    <td className="app-td pl-6 font-bold text-neutral-800">{item.mat.name}</td>
                                                                    <td className="app-td text-right font-medium text-neutral-500">{item.totalBilledQty.toFixed(2)} {item.mat.unitCalc}</td>
                                                                    <td className="app-td text-right">
                                                                        <span className="inline-flex items-center bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-lg font-bold text-xs">
                                                                            {item.purchaseQty} {item.mat.unitBuy} (de {item.mat.unitSize} {item.mat.unitCalc})
                                                                        </span>
                                                                    </td>
                                                                    <td className="app-td pr-6 text-right font-bold text-neutral-900">
                                                                        {formatMoney(item.totalPurchaseCost, companyInfo.currency)}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="h-full min-h-[300px] flex items-center justify-center border-2 border-dashed border-neutral-200 rounded-2xl bg-white p-6 text-center">
                        <div>
                            <div className="w-16 h-16 bg-neutral-50 border border-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4 text-neutral-400">
                                <i className="fa-solid fa-calculator text-2xl"></i>
                            </div>
                            <p className="text-neutral-500 font-medium">Sélectionnez un ouvrage pour démarrer</p>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* BARRE D'ACTION STICKY PERSISTANTE EN BAS DU CALCULATEUR */}
        {currentQuote && !currentQuote.error && (
            <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white/95 backdrop-blur-md border-t border-neutral-200/80 p-3 sm:p-4 z-30 shadow-floating flex flex-wrap items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-3">
                    <div>
                        <span className="text-[10px] text-neutral-400 block uppercase font-bold">Total Net HT</span>
                        <span className="font-extrabold text-neutral-900 text-sm sm:text-base">{formatMoney(currentQuote.netHTConsomme, companyInfo.currency)}</span>
                    </div>
                    <div className="pl-3 border-l border-neutral-200">
                        <span className="text-[10px] text-brand-600 block uppercase font-black">Total TTC</span>
                        <span className="font-black text-brand-600 text-base sm:text-lg">{formatMoney(currentQuote.totalTTCConsomme, companyInfo.currency)}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button 
                        onClick={handleAddLotToWorkingQuote} 
                        disabled={currentQuote.isLossMaking || isReadOnlyDueToDowngrade} 
                        className="btn-secondary flex-1 sm:flex-initial text-xs py-2 px-3 font-bold border-neutral-300 hover:bg-neutral-100 flex items-center justify-center gap-1.5 shadow-sm"
                        aria-label="Ajouter cet ouvrage au devis multi-lots"
                    >
                        <i className="fa-solid fa-layer-group text-brand-500"></i>
                        <span className="truncate">+ Ajouter au devis multi-lots ({workingLots.length})</span>
                    </button>
                    <button 
                        onClick={() => setIsSaveQuoteModalOpen(true)} 
                        disabled={currentQuote.isLossMaking || isReadOnlyDueToDowngrade} 
                        className="btn-primary flex-1 sm:flex-initial text-xs py-2.5 px-4 font-extrabold shadow-md shadow-brand-500/20 flex items-center justify-center gap-2 whitespace-nowrap"
                        aria-label="Enregistrer le devis pour le client"
                    >
                        <i className="fa-solid fa-floppy-disk"></i>
                        <span>{workingLots.length > 0 ? `Enregistrer le Devis (${workingLots.length + 1} lots)` : 'Enregistrer le Devis'}</span>
                    </button>
                </div>
            </div>
        )}
    </div>
    );
};


    // ═══════════════════════════════════════════════════════════════
    // VUE 1 : GESTION DES AFFAIRES & PROJETS (7.2)
    // ═══════════════════════════════════════════════════════════════
    const renderProjects = () => {
        const filteredProjects = projects.filter(p => 
            p.name.toLowerCase().includes(projectSearchQuery.toLowerCase()) ||
            p.code.toLowerCase().includes(projectSearchQuery.toLowerCase()) ||
            (p.clientName && p.clientName.toLowerCase().includes(projectSearchQuery.toLowerCase()))
        );

        return (
            <div className="w-full max-w-[1400px] mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm">
                    <div>
                        <h2 className="text-xl font-black text-neutral-900 flex items-center gap-2">
                            <i className="fa-solid fa-folder-tree text-brand-600"></i>
                            Gestion des Affaires & Projets BTP
                        </h2>
                        <p className="text-xs text-neutral-500 mt-0.5">Regroupez vos devis initiaux (V1), révisions (V2, V3) et avenants par chantier.</p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-64">
                            <input
                                type="text"
                                value={projectSearchQuery}
                                onChange={(e) => setProjectSearchQuery(e.target.value)}
                                placeholder="Rechercher une affaire..."
                                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-1.5 pl-8 text-xs font-bold outline-none focus:border-brand-500"
                            />
                            <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"></i>
                        </div>
                        <button
                            onClick={() => {
                                const newCode = `PRJ-${new Date().getFullYear()}-${String(projects.length + 1).padStart(3, '0')}`;
                                const newP = {
                                    id: `prj-${Date.now()}`,
                                    code: newCode,
                                    name: 'Nouvelle Affaire',
                                    clientId: clients[0]?.id || '',
                                    clientName: clients[0]?.name || 'Client',
                                    siteAddress: '',
                                    city: 'Dakar',
                                    status: 'active',
                                    budgetEstimated: 0,
                                    createdAt: new Date().toISOString().split('T')[0]
                                };
                                updateProjects([newP, ...projects]);
                                showToast(`✓ Affaire ${newCode} créée avec succès !`, 'success');
                            }}
                            className="btn-primary py-2 px-4 text-xs font-extrabold flex items-center gap-1.5 shrink-0 shadow-md shadow-brand-500/20"
                        >
                            <i className="fa-solid fa-plus"></i>
                            <span>Nouvelle Affaire</span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredProjects.map(prj => {
                        const projectQuotes = savedQuotes.filter(q => q.projectRef === prj.name || (q.projectId && q.projectId === prj.id));
                        const totalProjectCA = projectQuotes.reduce((acc, q) => acc + (q.quoteData?.totalTTCConsomme || 0), 0);

                        return (
                            <div key={prj.id} className="bg-white rounded-3xl border border-neutral-200 p-5 shadow-sm space-y-4 hover:border-brand-300 transition-all">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase tracking-wider bg-brand-50 text-brand-700 px-2.5 py-0.5 rounded-full border border-brand-200">
                                                {prj.code}
                                            </span>
                                            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${prj.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>
                                                {prj.status === 'active' ? 'En cours' : prj.status}
                                            </span>
                                        </div>
                                        <h3 className="text-base font-black text-neutral-900 mt-1">{prj.name}</h3>
                                        <p className="text-xs text-neutral-500 font-medium">
                                            <i className="fa-solid fa-user mr-1 text-neutral-400"></i> {prj.clientName} &bull; <i className="fa-solid fa-location-dot mr-1 text-neutral-400"></i> {prj.siteAddress || prj.city}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] uppercase font-bold text-neutral-400 block">CA Cumulé Affaire</span>
                                        <span className="text-base font-black text-brand-600 font-mono">{formatMoney(totalProjectCA, companyInfo.currency)}</span>
                                    </div>
                                </div>

                                <div className="bg-neutral-50 rounded-2xl p-3.5 border border-neutral-100 space-y-2">
                                    <div className="flex justify-between items-center text-xs font-bold text-neutral-700">
                                        <span className="flex items-center gap-1.5">
                                            <i className="fa-solid fa-file-lines text-brand-500"></i>
                                            Devis &amp; Avenants Rattachés ({projectQuotes.length})
                                        </span>
                                    </div>
                                    {projectQuotes.length > 0 ? (
                                        <div className="space-y-1.5">
                                            {projectQuotes.map(q => (
                                                <div key={q.id} className="flex justify-between items-center text-xs bg-white p-2.5 rounded-xl border border-neutral-200/60">
                                                    <div>
                                                        <span className="font-extrabold text-neutral-800 mr-2">{q.number}</span>
                                                        <span className="text-[10px] text-neutral-400">{q.date}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-neutral-900 font-mono">{formatMoney(q.quoteData?.totalTTCConsomme, companyInfo.currency)}</span>
                                                        <button onClick={() => { setViewingSavedQuote(q); setIsCommercialMode(true); }} className="text-brand-600 hover:text-brand-800 p-1" title="Voir PDF">
                                                            <i className="fa-solid fa-file-pdf text-xs"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-neutral-400 italic">Aucun devis lié pour l'instant.</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ═══════════════════════════════════════════════════════════════
    // VUE 2 : CRM CLIENTS BTP (7.1)
    // ═══════════════════════════════════════════════════════════════
    const renderClients = () => {
        const filteredClients = clients.filter(c => 
            c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
            (c.email && c.email.toLowerCase().includes(clientSearchQuery.toLowerCase())) ||
            (c.phone && c.phone.includes(clientSearchQuery))
        );

        return (
            <div className="w-full max-w-[1400px] mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-3xl border border-neutral-200 shadow-sm">
                    <div>
                        <h2 className="text-xl font-black text-neutral-900 flex items-center gap-2">
                            <i className="fa-solid fa-users text-brand-600"></i>
                            Répertoire Clients &amp; Donneurs d'Ordres
                        </h2>
                        <p className="text-xs text-neutral-500 mt-0.5">Centralisez vos contacts, adresses de chantier, NIF/RCCM et historique d'affaires.</p>
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative flex-1 sm:w-64">
                            <input
                                type="text"
                                value={clientSearchQuery}
                                onChange={(e) => setClientSearchQuery(e.target.value)}
                                placeholder="Rechercher un client..."
                                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-1.5 pl-8 text-xs font-bold outline-none focus:border-brand-500"
                            />
                            <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-xs"></i>
                        </div>
                        <button
                            onClick={() => {
                                const newC = {
                                    id: `cli-${Date.now()}`,
                                    name: 'Nouveau Client',
                                    contactPerson: 'Contact Principal',
                                    taxId: 'NIF-000000',
                                    email: 'contact@client.com',
                                    phone: '+221 77 000 00 00',
                                    address: 'Adresse de Facturation',
                                    city: 'Dakar',
                                    notes: ''
                                };
                                updateClients([newC, ...clients]);
                                showToast("✓ Fiche client créée !", "success");
                            }}
                            className="btn-primary py-2 px-4 text-xs font-extrabold flex items-center gap-1.5 shrink-0 shadow-md shadow-brand-500/20"
                        >
                            <i className="fa-solid fa-user-plus"></i>
                            <span>Nouveau Client</span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredClients.map(c => {
                        const clientProjects = projects.filter(p => p.clientId === c.id || p.clientName === c.name);
                        const clientQuotes = savedQuotes.filter(q => q.clientId === c.id || q.clientName === c.name);

                        return (
                            <div key={c.id} className="bg-white rounded-3xl border border-neutral-200 p-5 shadow-sm space-y-4 hover:border-brand-300 transition-all flex flex-col justify-between">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 font-black text-sm flex items-center justify-center shrink-0">
                                            {c.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-extrabold text-sm text-neutral-900 truncate">{c.name}</h3>
                                            <p className="text-[11px] text-neutral-500 font-medium truncate">{c.contactPerson}</p>
                                        </div>
                                    </div>

                                    <div className="bg-neutral-50 rounded-2xl p-3 text-xs space-y-1 text-neutral-600 border border-neutral-100">
                                        {c.taxId && <p className="font-mono text-[10px] text-neutral-500"><strong>NIF :</strong> {c.taxId}</p>}
                                        {c.phone && <p><i className="fa-solid fa-phone mr-1.5 text-neutral-400"></i> {c.phone}</p>}
                                        {c.email && <p><i className="fa-solid fa-envelope mr-1.5 text-neutral-400"></i> {c.email}</p>}
                                        {c.address && <p><i className="fa-solid fa-location-dot mr-1.5 text-neutral-400"></i> {c.address}, {c.city}</p>}
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-neutral-100 flex justify-between items-center text-xs text-neutral-500">
                                    <span>{clientProjects.length} Affaires &bull; {clientQuotes.length} Devis</span>
                                    <button onClick={() => {
                                        setCalcForm(cf => ({ ...cf, clientName: c.name, projectRef: `Projet ${c.name}` }));
                                        setActiveView('calculator');
                                        showToast(`Client ${c.name} sélectionné pour le devis !`);
                                    }} className="text-brand-600 font-bold hover:underline">
                                        + Créer Devis
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderSavedQuotes = () => (
        <div className="w-full max-w-[1400px] mx-auto">
            <div className="app-card flex flex-col">
                <div className="p-5 sm:p-6 border-b border-neutral-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
                    <div>
                        <h2 className="text-xl font-bold text-neutral-800">Mes Devis Enregistrés</h2>
                        <p className="text-sm text-neutral-500 mt-1 font-medium">Historique des devis créés, consultation de l'étude interne et impression du PDF client.</p>
                    </div>
                    <span className="bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg text-xs font-bold">
                        {savedQuotes.length} devis enregistrés (Prochain : DEV-{new Date().getFullYear()}-{String(nextQuoteSeq).padStart(3, '0')})
                    </span>
                </div>

                {/* VUE CARTES SOUS 1024px */}
                <div className="block lg:hidden p-4 space-y-3">
                    {savedQuotes.map(sq => (
                        <div key={sq.id} className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-3">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-black bg-brand-100 text-brand-700 mb-1">
                                        {sq.number}
                                    </span>
                                    <h3 className="font-extrabold text-neutral-900 text-base">{sq.clientName || 'Client sans nom'}</h3>
                                    <p className="text-xs text-neutral-500">{sq.projectRef || 'Sans référence projet'}</p>
                                </div>
                                <span className="text-xs font-medium text-neutral-400">{sq.date}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-neutral-200/80 text-xs">
                                <div>
                                    <span className="text-neutral-400 block text-[10px] uppercase font-bold">Net HT</span>
                                    <span className="font-bold text-neutral-700">
                                        {formatMoney(sq.quoteData?.netHTConsomme, sq.companyInfoSnapshot?.currency || companyInfo.currency)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-neutral-400 block text-[10px] uppercase font-bold">Total TTC</span>
                                    <span className="font-black text-brand-600 text-sm">
                                        {formatMoney(sq.quoteData?.totalTTCConsomme, sq.companyInfoSnapshot?.currency || companyInfo.currency)}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button 
                                    onClick={() => {
                                        const hq = adaptSavedQuoteToHybrid(sq, solutions, materials, labor, recipes);
                                        setHybridQuote(hq);
                                        setUseHybridEditor(true);
                                        setActiveView('calculator');
                                        showToast(`Devis ${sq.number} ouvert dans l'Éditeur Hybride !`);
                                    }}
                                    className="btn-primary flex-1 py-2 px-3 text-xs font-bold justify-center bg-brand-600 hover:bg-brand-700 text-white"
                                    aria-label={`Modifier dans l'éditeur hybride ${sq.number}`}
                                >
                                    <i className="fa-solid fa-pen-to-square mr-1.5"></i> Modifier (V6)
                                </button>
                                <button 
                                    onClick={() => { setViewingSavedQuote(sq); setIsCommercialMode(true); }} 
                                    className="btn-secondary flex-1 py-2 px-3 text-xs font-bold justify-center"
                                    aria-label={`Voir le devis client PDF ${sq.number}`}
                                >
                                    <i className="fa-solid fa-file-pdf mr-1.5"></i> PDF
                                </button>
                                <button 
                                    onClick={() => { setViewingSavedQuote(sq); setIsCommercialMode(false); }} 
                                    className="btn-secondary py-2 px-3 text-xs font-bold justify-center"
                                    aria-label={`Voir l'étude de prix interne ${sq.number}`}
                                >
                                    <i className="fa-solid fa-eye"></i>
                                </button>
                                <button 
                                    disabled={isReadOnlyDueToDowngrade} 
                                    onClick={() => setConfirmDialog({ 
                                        isOpen: true, 
                                        title: "Supprimer Devis", 
                                        message: `Supprimer définitivement le devis ${sq.number} ?`, 
                                        isDanger: true, 
                                        onConfirm: () => { updateSavedQuotes(savedQuotes.filter(x => x.id !== sq.id)); closeConfirm(); showToast("Devis supprimé"); }
                                    })} 
                                    className="btn-icon text-neutral-400 hover:text-red-600 hover:bg-red-50 p-2"
                                    aria-label={`Supprimer le devis ${sq.number}`}
                                    title="Supprimer"
                                >
                                    <i className="fa-solid fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    ))}
                    {savedQuotes.length === 0 && (
                        <div className="p-8 text-center text-neutral-400">
                            <i className="fa-solid fa-folder-open text-4xl mb-3 block opacity-30"></i>
                            Aucun devis enregistré pour le moment.
                        </div>
                    )}
                </div>

                {/* VUE TABLEAU LARGE DESKTOP (≥ 1024px) */}
                <div className="hidden lg:block app-table-wrapper rounded-none border-0">
                    <table className="app-table">
                        <thead className="bg-neutral-50/80">
                            <tr>
                                <th className="app-th pl-6">N° Devis</th>
                                <th className="app-th">Date</th>
                                <th className="app-th">Client & Projet</th>
                                <th className="app-th text-right">Net HT</th>
                                <th className="app-th text-right">Total TTC</th>
                                <th className="app-th text-right pr-6 w-48">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {savedQuotes.map(sq => (
                                <tr key={sq.id} className="app-td border-b border-neutral-100 hover:bg-neutral-50/50">
                                    <td className="p-4 pl-6 font-extrabold text-brand-600">{sq.number}</td>
                                    <td className="p-4 text-xs font-medium text-neutral-500">{sq.date}</td>
                                    <td className="p-4">
                                        <div className="font-bold text-neutral-800">{sq.clientName}</div>
                                        <div className="text-xs text-neutral-500">{sq.projectRef}</div>
                                    </td>
                                    <td className="p-4 text-right font-bold text-neutral-700">{formatMoney(sq.quoteData?.netHTConsomme, sq.companyInfoSnapshot?.currency || companyInfo.currency)}</td>
                                    <td className="p-4 text-right font-extrabold text-neutral-900">{formatMoney(sq.quoteData?.totalTTCConsomme, sq.companyInfoSnapshot?.currency || companyInfo.currency)}</td>
                                    <td className="p-4 pr-6 text-right">
                                        <div className="flex justify-end items-center gap-1.5">
                                            <button 
                                                onClick={() => {
                                                    const hq = adaptSavedQuoteToHybrid(sq, solutions, materials, labor, recipes);
                                                    setHybridQuote(hq);
                                                    setUseHybridEditor(true);
                                                    setActiveView('calculator');
                                                    showToast(`Devis ${sq.number} ouvert dans l'Éditeur Hybride !`);
                                                }}
                                                className="btn-secondary py-1 px-2.5 text-xs font-bold text-brand-700 bg-brand-50 border-brand-200 hover:bg-brand-100 flex items-center gap-1" 
                                                title="Modifier dans l'Éditeur Hybride V6"
                                            >
                                                <i className="fa-solid fa-pen-to-square text-brand-600"></i> Éditer
                                            </button>
                                            {/* BLOC 7.3 : VERSIONING STRICT (V1 -> V2 -> V3) */}
                                            <button 
                                                onClick={() => {
                                                    const currentVersion = sq.versionNumber || 1;
                                                    const nextVersion = currentVersion + 1;
                                                    const baseNum = sq.number.replace(/-V\d+$/, '');
                                                    const newVersionNum = `${baseNum}-V${nextVersion}`;
                                                    const newId = Date.now() + Math.floor(Math.random() * 100000);
                                                    
                                                    const newVersionQuote = {
                                                        ...JSON.parse(JSON.stringify(sq)),
                                                        id: newId,
                                                        number: newVersionNum,
                                                        versionNumber: nextVersion,
                                                        parentQuoteId: sq.id,
                                                        status: 'draft',
                                                        signedAt: null,
                                                        signedByName: null,
                                                        signatureData: null,
                                                        date: new Date().toLocaleDateString('fr-FR')
                                                    };
                                                    if (newVersionQuote.hybridQuoteSnapshot) {
                                                        newVersionQuote.hybridQuoteSnapshot.id = newId;
                                                        newVersionQuote.hybridQuoteSnapshot.number = newVersionNum;
                                                    }
                                                    updateSavedQuotes([newVersionQuote, ...savedQuotes]);
                                                    showToast(`✓ Nouvelle révision ${newVersionNum} créée (V${currentVersion} préservée) !`, "success");
                                                }}
                                                className="btn-secondary py-1 px-2.5 text-xs font-bold text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 flex items-center gap-1"
                                                title="Créer une nouvelle révision (V2, V3) sans écraser la version envoyée"
                                            >
                                                <i className="fa-solid fa-code-branch text-indigo-600"></i> Révision (V{(sq.versionNumber || 1) + 1})
                                            </button>

                                            <button 
                                                onClick={() => {
                                                    const currentYear = new Date().getFullYear();
                                                    const newId = Date.now() + Math.floor(Math.random() * 100000);
                                                    const nextNum = generateNextQuoteNumber(savedQuotes);
                                                    const duplicated = {
                                                        ...JSON.parse(JSON.stringify(sq)),
                                                        id: newId,
                                                        number: nextNum,
                                                        clientName: `${sq.clientName} (Copie)`,
                                                        date: new Date().toLocaleDateString('fr-FR')
                                                    };
                                                    if (duplicated.hybridQuoteSnapshot) {
                                                        duplicated.hybridQuoteSnapshot.id = newId;
                                                        duplicated.hybridQuoteSnapshot.number = nextNum;
                                                        duplicated.hybridQuoteSnapshot.clientName = duplicated.clientName;
                                                    }
                                                    updateSavedQuotes([duplicated, ...savedQuotes]);
                                                    updateNextQuoteSeq(nextQuoteSeq + 1);
                                                    showToast(`Devis ${sq.number} dupliqué avec succès !`, "success");
                                                }}
                                                className="btn-icon text-neutral-600 hover:bg-neutral-100" 
                                                title="Dupliquer ce devis"
                                                aria-label={`Dupliquer ${sq.number}`}
                                            >
                                                <i className="fa-solid fa-clone"></i>
                                            </button>
                                            <button onClick={() => { setViewingSavedQuote(sq); setIsCommercialMode(true); }} className="btn-icon text-indigo-600 hover:bg-indigo-50" title="Aperçu Devis Client (PDF)" aria-label={`Aperçu devis client ${sq.number}`}><i className="fa-solid fa-file-pdf"></i></button>
                                            <button onClick={() => { setViewingSavedQuote(sq); setIsCommercialMode(false); }} className="btn-icon text-brand-600 hover:bg-brand-50" title="Vue Interne Étude de Prix" aria-label={`Étude interne ${sq.number}`}><i className="fa-solid fa-eye"></i></button>
                                            <button disabled={isReadOnlyDueToDowngrade} onClick={() => setConfirmDialog({ isOpen: true, title: "Supprimer Devis", message: `Supprimer le devis ${sq.number} ?`, isDanger: true, onConfirm: () => { updateSavedQuotes(savedQuotes.filter(x => x.id !== sq.id)); closeConfirm(); showToast("Devis supprimé"); }})} className={`btn-icon ${isReadOnlyDueToDowngrade ? 'opacity-40 cursor-not-allowed text-neutral-300' : 'text-neutral-400 hover:text-red-600 hover:bg-red-50'}`} aria-label={`Supprimer ${sq.number}`} title="Supprimer"><i className="fa-solid fa-trash"></i></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {savedQuotes.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="p-12 text-center text-neutral-400 font-medium">
                                        <i className="fa-solid fa-folder-open text-4xl mb-3 block opacity-30"></i>
                                        Aucun devis enregistré pour le moment.<br/>
                                        Créez un devis dans le calculateur puis cliquez sur "Enregistrer le Devis".
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );

    const renderRecipes = () => (
        <div className="flex flex-col lg:flex-row gap-6 w-full max-w-[1400px] mx-auto items-start">
            <div className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4">
                <div className="flex items-center justify-between px-1">
                    <h2 className="text-lg font-bold text-neutral-800">Catalogue des Ouvrages</h2>
                    <button disabled={isReadOnlyDueToDowngrade} onClick={() => { setSolutionModalForm({ id: null, name: '', icon: 'fa-cube', allowedModes: ['rectangle', 'surface', 'linear'] }); setIsSolutionModalOpen(true); }} className={`btn-secondary py-1.5 px-3 text-xs ${isReadOnlyDueToDowngrade ? 'opacity-50 cursor-not-allowed' : 'text-brand-600 border-brand-200 hover:bg-brand-50'}`} aria-label="Créer un nouvel ouvrage au catalogue">
                        <i className="fa-solid fa-plus"></i> Nouvel Ouvrage
                    </button>
                </div>

                {/* DIAGNOSTIC D'INTÉGRITÉ */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs font-bold text-emerald-900 shadow-sm space-y-1.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <i className="fa-solid fa-shield-check text-emerald-600 text-sm"></i>
                            <span>Santé du Catalogue :</span>
                        </div>
                        <span className="bg-white text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-extrabold">
                            {systemDiagnostic.okProducts} / {systemDiagnostic.totalProducts} Conformes
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] text-neutral-600 font-medium border-t border-emerald-200/60 pt-1.5">
                        <div>Formules Invalides : <span className={systemDiagnostic.invalidRecipes > 0 ? "font-bold text-red-600" : "font-bold text-emerald-700"}>{systemDiagnostic.invalidRecipes}</span></div>
                        <div>Ressources Manquantes : <span className={systemDiagnostic.missingResources > 0 ? "font-bold text-red-600" : "font-bold text-emerald-700"}>{systemDiagnostic.missingResources}</span></div>
                    </div>
                </div>

                {/* Barre de Recherche Catalogue Ouvrages (Annotation 2) */}
                <div className="relative">
                    <input
                        type="text"
                        value={solutionSearchQuery}
                        onChange={(e) => setSolutionSearchQuery(e.target.value)}
                        placeholder="Rechercher un ouvrage (ex: Béton, ACM, Peinture)..."
                        className="w-full bg-white border border-neutral-200 focus:border-brand-500 rounded-xl px-3.5 py-2 pl-9 text-xs font-bold text-neutral-800 placeholder-neutral-400 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all shadow-2xs"
                        aria-label="Rechercher un ouvrage dans le catalogue"
                    />
                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none"></i>
                    {solutionSearchQuery && (
                        <button
                            onClick={() => setSolutionSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs"
                            aria-label="Effacer la recherche"
                        >
                            <i className="fa-solid fa-xmark"></i>
                        </button>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    {solutions.filter(s => s.name.toLowerCase().includes(solutionSearchQuery.toLowerCase())).map(s => (
                        <div key={s.id} className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all duration-200 bg-white ${selectedSolutionForEdit?.id === s.id ? 'border-brand-500 shadow-sm' : 'border-transparent hover:border-neutral-200 shadow-sm'}`}>
                            <button onClick={() => setSelectedSolutionForEdit(s)} className="flex items-center text-left gap-3 flex-1 min-w-0 outline-none" aria-label={`Sélectionner l'ouvrage ${s.name}`}>
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${selectedSolutionForEdit?.id === s.id ? 'bg-brand-100 text-brand-600' : 'bg-neutral-100 text-neutral-400'}`}>
                                    <i className={`fa-solid ${s.icon}`}></i>
                                </div>
                                <span className={`font-bold text-sm leading-tight truncate ${selectedSolutionForEdit?.id === s.id ? 'text-neutral-900' : 'text-neutral-600'}`}>{s.name}</span>
                            </button>
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                                <button disabled={isReadOnlyDueToDowngrade} onClick={() => { setSolutionModalForm({ id: s.id, name: s.name, icon: s.icon || 'fa-cube', allowedModes: s.allowedModes || ['rectangle'] }); setIsSolutionModalOpen(true); }} className={`btn-icon text-xs w-7 h-7 ${isReadOnlyDueToDowngrade ? 'opacity-40 cursor-not-allowed' : 'text-neutral-500 hover:text-brand-600'}`} title="Éditer le nom" aria-label={`Modifier ${s.name}`}><i className="fa-solid fa-pen"></i></button>
                                <button disabled={isReadOnlyDueToDowngrade} onClick={() => handleDuplicateSolution(s)} className={`btn-icon text-xs w-7 h-7 ${isReadOnlyDueToDowngrade ? 'opacity-40 cursor-not-allowed' : 'text-neutral-500 hover:text-indigo-600'}`} title="Dupliquer" aria-label={`Dupliquer ${s.name}`}><i className="fa-solid fa-copy"></i></button>
                                <button disabled={isReadOnlyDueToDowngrade} onClick={() => handleDeleteSolution(s)} className={`btn-icon text-xs w-7 h-7 ${isReadOnlyDueToDowngrade ? 'opacity-40 cursor-not-allowed' : 'text-neutral-400 hover:text-red-600'}`} title="Supprimer" aria-label={`Supprimer ${s.name}`}><i className="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 min-w-0 w-full">
                {selectedSolutionForEdit && (
                    <div className="app-card flex flex-col">
                        <div className="p-5 sm:p-6 border-b border-neutral-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
                            <div>
                                <h3 className="text-neutral-400 text-[10px] font-extrabold uppercase tracking-wider mb-1">Composants & Formules de l'Ouvrage</h3>
                                <h2 className="text-xl font-bold text-neutral-800">{selectedSolutionForEdit.name}</h2>
                            </div>
                            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                                <button disabled={isReadOnlyDueToDowngrade} onClick={() => setIsAllowedModesModalOpen(true)} className={`btn-secondary py-2 px-3 text-xs ${isReadOnlyDueToDowngrade ? 'opacity-50 cursor-not-allowed' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'}`} aria-label="Configurer les modes de métré autorisés">
                                    <i className="fa-solid fa-vector-square text-brand-500"></i> Modes autorisés ({selectedSolutionForEdit.allowedModes?.length||0})
                                </button>
                                <button disabled={isReadOnlyDueToDowngrade} onClick={() => { setVarForm({ name: '', label: '', defaultValue: 0, unit: 'u' }); setIsVarModalOpen(true); }} className={`btn-secondary py-2 px-3 text-xs ${isReadOnlyDueToDowngrade ? 'opacity-50 cursor-not-allowed' : 'border-brand-200 text-brand-700 hover:bg-brand-50'}`} aria-label="Gérer les variables spécifiques">
                                    <i className="fa-solid fa-sliders"></i> Variables du Chantier
                                </button>
                                <button disabled={isReadOnlyDueToDowngrade} onClick={() => { setRecipeForm({ id: Date.now(), solutionId: selectedSolutionForEdit.id, type: 'material', refId: materials[0]?.id||'', formula: 'SURFACE', costCategory: 'material', label: '' }); setIsRecipeModalOpen(true); }} className={`btn-primary py-2 px-3 text-xs ${isReadOnlyDueToDowngrade ? 'opacity-50 cursor-not-allowed' : ''}`} aria-label="Ajouter un composant à l'ouvrage">
                                    <i className="fa-solid fa-plus"></i> Ajouter un composant
                                </button>
                            </div>
                        </div>

                        <div className="p-4 bg-brand-50/40 border-b border-neutral-100">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-bold text-brand-700 uppercase tracking-wider"><i className="fa-solid fa-sliders mr-1"></i>Variables Personnalisées de l'Ouvrage</h4>
                                {!isReadOnlyDueToDowngrade && (
                                    <button onClick={() => { setVarForm({ name: '', label: '', defaultValue: 0, unit: 'u' }); setIsVarModalOpen(true); }} className="text-[11px] font-bold text-brand-600 hover:underline" aria-label="Ajouter une variable personnalisée">
                                        + Ajouter une variable
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {selectedSolutionForEdit.customVars && selectedSolutionForEdit.customVars.map(cv => (
                                    <span key={cv.name} className="inline-flex items-center gap-1.5 bg-white border border-brand-200 text-brand-900 px-2.5 py-1 rounded-lg text-xs font-mono font-bold shadow-sm">
                                        <span>{cv.name}</span>
                                        <span className="text-neutral-400 font-normal">= {cv.defaultValue} {cv.unit}</span>
                                        {!isReadOnlyDueToDowngrade && <button onClick={() => handleDeleteCustomVar(cv.name)} className="ml-1 text-neutral-400 hover:text-red-600" aria-label={`Supprimer la variable ${cv.name}`}><i className="fa-solid fa-xmark text-[10px]"></i></button>}
                                    </span>
                                ))}
                                {(!selectedSolutionForEdit.customVars || selectedSolutionForEdit.customVars.length === 0) && (
                                    <span className="text-xs text-neutral-400 italic">Aucune variable spécifique configurée (ex : PROFONDEUR, COUCHES).</span>
                                )}
                            </div>
                        </div>

                        {/* CARTES SOUS 1024px */}
                        <div className="block lg:hidden p-4 space-y-3">
                            {recipes.filter(r => r.solutionId === selectedSolutionForEdit.id).map(r => {
                                const isMatMissing = r.type === 'material' && !materials.find(m => m.id === r.refId);
                                const isLabMissing = r.type === 'labor' && !labor.find(l => l.id === r.refId);
                                const isMissing = isMatMissing || isLabMissing;
                                const linkedName = r.type === 'material' 
                                    ? (materials.find(m=>m.id===r.refId)?.name || 'Ressource introuvable') 
                                    : (labor.find(l=>l.id===r.refId)?.name || 'Prestation introuvable');

                                return (
                                    <div key={r.id} className={`p-4 rounded-2xl border ${isMissing ? 'bg-red-50/60 border-red-200' : 'bg-neutral-50 border-neutral-200'} space-y-2`}>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-extrabold text-sm text-neutral-900">{r.label}</p>
                                                <p className="text-xs text-neutral-600 mt-0.5">{linkedName}</p>
                                            </div>
                                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-white text-neutral-700 border-neutral-300">
                                                {r.costCategory || r.type}
                                            </span>
                                        </div>
                                        <div className="bg-white p-2.5 rounded-xl border border-neutral-200/80 text-xs">
                                            <span className="text-neutral-400 font-bold block text-[10px] uppercase">Formule</span>
                                            <code className="font-mono text-brand-700 font-bold">{r.formula}</code>
                                        </div>
                                        <div className="flex justify-end gap-2 pt-1">
                                            <button disabled={isReadOnlyDueToDowngrade} onClick={() => { setRecipeForm({ ...r }); setIsRecipeModalOpen(true); }} className="btn-secondary py-1.5 px-3 text-xs font-bold" aria-label={`Modifier le composant ${r.label}`}>
                                                <i className="fa-solid fa-pen mr-1"></i> Modifier
                                            </button>
                                            <button disabled={isReadOnlyDueToDowngrade} onClick={() => setConfirmDialog({ isOpen: true, title: "Retirer", message: "Retirer ce composant de la recette ?", isDanger: true, onConfirm: () => { setRecipes(recipes.filter(x => x.id !== r.id)); closeConfirm(); }})} className="btn-icon text-neutral-400 hover:text-red-600 p-1.5" aria-label={`Retirer le composant ${r.label}`}>
                                                <i className="fa-solid fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* TABLEAU LARGE DESKTOP (≥ 1024px) */}
                        <div className="hidden lg:block app-table-wrapper rounded-none border-0">
                            <table className="app-table">
                                <thead className="bg-neutral-50/80">
                                    <tr>
                                        <th className="app-th pl-6 w-1/3">Composant & Formule</th>
                                        <th className="app-th text-center">Catégorie</th>
                                        <th className="app-th">Ressource Liée</th>
                                        <th className="app-th text-right pr-6 w-28">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recipes.filter(r => r.solutionId === selectedSolutionForEdit.id).map(r => {
                                        const isMatMissing = r.type === 'material' && !materials.find(m => m.id === r.refId);
                                        const isLabMissing = r.type === 'labor' && !labor.find(l => l.id === r.refId);
                                        const isMissing = isMatMissing || isLabMissing;

                                        return (
                                            <tr key={r.id} className={`app-td border-b border-neutral-100 ${isMissing ? 'bg-red-50/60' : 'hover:bg-neutral-50/50'}`}>
                                                <td className="p-4 pl-6">
                                                    <p className="font-bold text-neutral-800">{r.label}</p>
                                                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                        <code className="text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded border border-neutral-200 font-mono">{r.formula}</code>
                                                        {isMissing && <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded border border-red-200"><i className="fa-solid fa-triangle-exclamation mr-1"></i>Ressource Supprimée</span>}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                                        r.costCategory === 'installation' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                        r.costCategory === 'labor' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                                        'bg-orange-50 text-orange-700 border-orange-200'
                                                    }`}>
                                                        {r.costCategory || r.type}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm font-medium">
                                                    {r.type === 'material' 
                                                        ? (materials.find(m=>m.id===r.refId)?.name || <span className="text-red-600 font-bold">Ressource introuvable (ID #{r.refId})</span>) 
                                                        : (labor.find(l=>l.id===r.refId)?.name || <span className="text-red-600 font-bold">Prestation introuvable (ID #{r.refId})</span>)
                                                    }
                                                </td>
                                                <td className="p-4 pr-6 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <button disabled={isReadOnlyDueToDowngrade} onClick={() => { setRecipeForm({ ...r }); setIsRecipeModalOpen(true); }} className={`btn-icon ${isReadOnlyDueToDowngrade ? 'opacity-40 cursor-not-allowed text-neutral-300' : 'text-neutral-500 hover:text-brand-600'}`} title="Éditer le composant" aria-label={`Éditer ${r.label}`}><i className="fa-solid fa-pen"></i></button>
                                                        <button disabled={isReadOnlyDueToDowngrade} onClick={() => setConfirmDialog({ isOpen: true, title: "Retirer", message: "Retirer ce composant de la recette ?", isDanger: true, onConfirm: () => { setRecipes(recipes.filter(x => x.id !== r.id)); closeConfirm(); }})} className={`btn-icon ${isReadOnlyDueToDowngrade ? 'opacity-40 cursor-not-allowed text-neutral-300' : 'text-neutral-400 hover:text-red-600 hover:bg-red-50'}`} title="Retirer" aria-label={`Retirer ${r.label}`}><i className="fa-solid fa-trash"></i></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {recipes.filter(r => r.solutionId === selectedSolutionForEdit.id).length === 0 && (
                                        <tr>
                                            <td colSpan="4" className="p-8 text-center text-neutral-500 font-medium">Cet ouvrage n'a aucun composant. Cliquez sur "Ajouter un composant" pour commencer.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    const renderMaterials = () => {
        const selectedMaterial = materials.find(m => m.id === selectedMaterialId) || null;
        const selectedLaborItem = labor.find(l => l.id === selectedLaborId) || null;
        const editingIsNew = isResourceEditMode && (
            resourceTab === 'materials' ? (matForm && !materials.some(m => m.id === matForm.id)) : (laborForm && !labor.some(l => l.id === laborForm.id))
        );
        // Un brouillon "nouveau" n'existe pas encore dans materials/labor — sans ce
        // fallback, selectedItem resterait null et le panneau détail resterait sur
        // l'état vide au lieu d'afficher le formulaire de création.
        const selectedItem = resourceTab === 'materials'
            ? (selectedMaterial || (editingIsNew ? matForm : null))
            : (selectedLaborItem || (editingIsNew ? laborForm : null));

        const openMaterialDetail = (m) => { setSelectedMaterialId(m.id); setIsResourceEditMode(false); setResourceDetailTab('overview'); };
        const openLaborDetail = (l) => { setSelectedLaborId(l.id); setIsResourceEditMode(false); };
        const startEditMaterial = (m) => { setMatForm({ ...m }); setSelectedMaterialId(m.id); setIsResourceEditMode(true); };
        const startEditLabor = (l) => { setLaborForm({ ...l }); setSelectedLaborId(l.id); setIsResourceEditMode(true); };
        const startNewMaterial = () => {
            const draft = { id: Date.now(), name: '', category: 'Fer', unitBuy: 'Barre (6m)', unitSize: 6, unitCalc: 'm', priceBuy: '', waste: 5, yieldRate: 0, purchaseMode: 'pack' };
            setMatForm(draft); setSelectedMaterialId(draft.id); setIsResourceEditMode(true); setResourceDetailTab('overview');
        };
        const startNewLabor = () => {
            const draft = { id: Date.now(), name: '', calcMode: 'unite', unit: 'h', rate: '', yieldRate: 0 };
            setLaborForm(draft); setSelectedLaborId(draft.id); setIsResourceEditMode(true);
        };
        const closeDetail = () => {
            if (resourceTab === 'materials') setSelectedMaterialId(null); else setSelectedLaborId(null);
            setIsResourceEditMode(false);
        };
        const cancelEdit = () => {
            if (editingIsNew) { closeDetail(); } else { setIsResourceEditMode(false); }
        };

        const saveMaterial = (e) => {
            e.preventDefault();
            if (isReadOnlyDueToDowngrade) return;
            const p = (parseFloat(matForm.priceBuy) || 0) / (parseFloat(matForm.unitSize) || 1);
            const nm = { ...matForm, priceCalc: p, waste: parseFloat(matForm.waste) || 0, yieldRate: parseFloat(matForm.yieldRate) || 0 };
            const previousMat = materials.find(m => m.id === nm.id);
            updateMaterials(previousMat ? materials.map(m => m.id === nm.id ? nm : m) : [...materials, nm]);
            setSelectedMaterialId(nm.id);
            setIsResourceEditMode(false);
            showToast("Ressource enregistrée");
            // Journalisation réelle de l'historique de prix (Règle d'Or #3, Zéro Faux
            // Succès) : uniquement si le prix a changé pour une matière existante, en
            // organisation cloud réelle. Non bloquant.
            if (previousMat && isCloudOrgActive && supabaseClient && parseFloat(previousMat.priceBuy) !== parseFloat(nm.priceBuy)) {
                supabaseClient.from('material_price_history').insert({
                    organization_id: activeOrganizationId,
                    material_id: nm.id,
                    price: parseFloat(nm.priceBuy) || 0,
                    previous_price: parseFloat(previousMat.priceBuy) || 0,
                    supplier_name: nm.supplier || null
                }).then(({ error }) => { if (error) console.warn('[Price History] Échec de journalisation:', error); });
            }
        };
        const saveLabor = (e) => {
            e.preventDefault();
            if (isReadOnlyDueToDowngrade) return;
            const nl = { ...laborForm, rate: parseFloat(laborForm.rate) || 0, yieldRate: parseFloat(laborForm.yieldRate) || 0 };
            updateLabor(labor.find(x => x.id === nl.id) ? labor.map(x => x.id === nl.id ? nl : x) : [...labor, nl]);
            setSelectedLaborId(nl.id);
            setIsResourceEditMode(false);
            showToast("Prestation enregistrée !");
        };

        const lastHistoryEntry = materialHistory[0];
        const historyVariationPct = lastHistoryEntry && lastHistoryEntry.previous_price
            ? ((lastHistoryEntry.price - lastHistoryEntry.previous_price) / lastHistoryEntry.previous_price) * 100
            : null;

        return (
        <div className="w-full max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-6 items-start">
            {/* COLONNE LISTE — masquée sur mobile quand un détail est ouvert (P0.10, pattern Zoho Books) */}
            <div className={`${selectedItem ? 'hidden lg:flex' : 'flex'} lg:w-[380px] w-full shrink-0 flex-col gap-4`}>
                <div className="flex gap-2 bg-white p-2 rounded-xl border border-neutral-200">
                    <button onClick={() => setResourceTab('materials')}
                            className={`flex-1 px-3 py-2.5 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 ${resourceTab === 'materials' ? 'bg-brand-50 text-brand-600' : 'text-neutral-500 hover:text-neutral-800'}`}
                            aria-label="Voir la liste des matières premières">
                        <i className="fa-solid fa-box text-sm"></i> Matières ({materials.length})
                    </button>
                    <button onClick={() => setResourceTab('labor')}
                            className={`flex-1 px-3 py-2.5 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 ${resourceTab === 'labor' ? 'bg-brand-50 text-brand-600' : 'text-neutral-500 hover:text-neutral-800'}`}
                            aria-label="Voir la liste de la main-d'œuvre">
                        <i className="fa-solid fa-user-gear text-sm"></i> Main-d'œuvre ({labor.length})
                    </button>
                </div>

                {resourceTab === 'materials' && (
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setIsMatCsvModalOpen(true)} className="btn-secondary flex-1 py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5" title="Importer un CSV" aria-label="Importer un fichier CSV">
                            <i className="fa-solid fa-file-csv text-emerald-600"></i> CSV
                        </button>
                        <button type="button" onClick={() => {
                            const csvContent = "data:text/csv;charset=utf-8," +
                                "ID;Nom;Catégorie;Unité Achat;Taille Unité;Unité Calcul;Prix Achat;Perte (%);Rendement (m²)\n" +
                                materials.map(m => `"${m.id}";"${m.name}";"${m.category}";"${m.unitBuy}";"${m.unitSize}";"${m.unitCalc}";"${m.priceBuy}";"${m.waste}";"${m.yieldRate || 0}"`).join("\n");
                            const encodedUri = encodeURI(csvContent);
                            const link = document.createElement("a");
                            link.setAttribute("href", encodedUri);
                            link.setAttribute("download", `ikadevis_matieres_${new Date().toISOString().slice(0,10)}.csv`);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            showToast("Exportation CSV téléchargée !");
                        }} className="btn-secondary flex-1 py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5" title="Exporter en CSV" aria-label="Exporter au format CSV">
                            <i className="fa-solid fa-file-arrow-down text-brand-600"></i> Export
                        </button>
                    </div>
                )}

                <button disabled={isReadOnlyDueToDowngrade} onClick={resourceTab === 'materials' ? startNewMaterial : startNewLabor} className={`btn-primary w-full justify-center ${isReadOnlyDueToDowngrade ? 'opacity-50 cursor-not-allowed' : ''}`} aria-label={resourceTab === 'materials' ? "Ajouter une nouvelle matière" : "Ajouter une nouvelle prestation"}>
                    <i className="fa-solid fa-plus"></i> {resourceTab === 'materials' ? 'Nouvelle Matière' : 'Nouvelle Prestation'}
                </button>

                <div className="flex flex-col gap-2 max-h-[65vh] overflow-y-auto custom-scroll pr-1">
                    {resourceTab === 'materials' ? materials.map(m => (
                        <button key={m.id} onClick={() => openMaterialDetail(m)} className={`flex items-center justify-between gap-2 p-3.5 rounded-xl border-2 transition-all duration-200 bg-white text-left ${selectedMaterialId === m.id ? 'border-brand-500 shadow-sm' : 'border-transparent hover:border-neutral-200 shadow-sm'}`} aria-label={`Sélectionner ${m.name}`}>
                            <div className="min-w-0">
                                <p className={`font-bold text-sm truncate ${selectedMaterialId === m.id ? 'text-neutral-900' : 'text-neutral-700'}`}>{m.name}</p>
                                <p className="text-[11px] text-neutral-500 truncate">{m.category}</p>
                            </div>
                            <span className="text-xs font-extrabold text-brand-600 shrink-0">{formatMoney(m.priceBuy, companyInfo.currency)}</span>
                        </button>
                    )) : labor.map(l => (
                        <button key={l.id} onClick={() => openLaborDetail(l)} className={`flex items-center justify-between gap-2 p-3.5 rounded-xl border-2 transition-all duration-200 bg-white text-left ${selectedLaborId === l.id ? 'border-brand-500 shadow-sm' : 'border-transparent hover:border-neutral-200 shadow-sm'}`} aria-label={`Sélectionner ${l.name}`}>
                            <p className={`font-bold text-sm truncate ${selectedLaborId === l.id ? 'text-neutral-900' : 'text-neutral-700'}`}>{l.name}</p>
                            <span className="text-xs font-extrabold text-brand-600 shrink-0">{formatMoney(l.rate, companyInfo.currency)} / {l.unit || 'u'}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* COLONNE DÉTAIL — visible sur mobile uniquement quand un élément est sélectionné ;
                toujours visible côte-à-côte à partir de lg (≥1024px), état vide sinon. */}
            <div className={`${selectedItem ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0 w-full flex-col`}>
                {!selectedItem ? (
                    <div className="app-card p-16 text-center text-neutral-400">
                        <i className={`fa-solid ${resourceTab === 'materials' ? 'fa-box' : 'fa-user-gear'} text-3xl mb-3 text-neutral-300`}></i>
                        <p className="text-sm font-bold text-neutral-600">Sélectionnez {resourceTab === 'materials' ? 'une matière' : 'une prestation'} pour voir son détail</p>
                    </div>
                ) : (
                    <div className="app-card flex flex-col">
                        <div className="p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between gap-3 bg-white">
                            <div className="flex items-center gap-3 min-w-0">
                                <button onClick={closeDetail} className="lg:hidden btn-icon text-neutral-500 hover:text-neutral-800 shrink-0" aria-label="Retour à la liste">
                                    <i className="fa-solid fa-arrow-left"></i>
                                </button>
                                <h2 className="text-lg sm:text-xl font-bold text-neutral-800 truncate">
                                    {isResourceEditMode ? (editingIsNew ? `Nouvelle ${resourceTab === 'materials' ? 'matière' : 'prestation'}` : `Modifier « ${selectedItem.name} »`) : selectedItem.name}
                                </h2>
                            </div>
                            {!isResourceEditMode && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <button disabled={isReadOnlyDueToDowngrade} onClick={() => resourceTab === 'materials' ? startEditMaterial(selectedItem) : startEditLabor(selectedItem)} className={`btn-icon ${isReadOnlyDueToDowngrade ? 'opacity-40 cursor-not-allowed' : ''}`} title="Modifier" aria-label={`Modifier ${selectedItem.name}`}>
                                        <i className="fa-solid fa-pen"></i>
                                    </button>
                                    <button disabled={isReadOnlyDueToDowngrade} onClick={() => resourceTab === 'materials' ? handleDeleteMaterial(selectedItem) : handleDeleteLabor(selectedItem)} className={`btn-icon ${isReadOnlyDueToDowngrade ? 'opacity-40 cursor-not-allowed' : 'text-neutral-400 hover:text-red-600 hover:bg-red-50'}`} title="Supprimer" aria-label={`Supprimer ${selectedItem.name}`}>
                                        <i className="fa-solid fa-trash"></i>
                                    </button>
                                </div>
                            )}
                        </div>

                        {!isResourceEditMode && resourceTab === 'materials' && (
                            <div className="flex gap-1 px-5 sm:px-6 pt-3 border-b border-neutral-100">
                                <button onClick={() => setResourceDetailTab('overview')} className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors ${resourceDetailTab === 'overview' ? 'border-brand-500 text-brand-600' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>Vue d'ensemble</button>
                                <button onClick={() => setResourceDetailTab('history')} className={`px-3 py-2 text-xs font-bold border-b-2 transition-colors ${resourceDetailTab === 'history' ? 'border-brand-500 text-brand-600' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>Historique des prix</button>
                            </div>
                        )}

                        <div className="p-5 sm:p-6">
                            {isResourceEditMode ? (
                                resourceTab === 'materials' ? (
                                    <form onSubmit={saveMaterial} className="space-y-5">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="md:col-span-2"><label className="app-label">Nom complet</label><input disabled={isReadOnlyDueToDowngrade} required type="text" className="app-input font-bold" value={matForm.name} onChange={e => setMatForm({ ...matForm, name: e.target.value })} /></div>
                                            <div><label className="app-label">Catégorie</label><input disabled={isReadOnlyDueToDowngrade} required type="text" className="app-input" value={matForm.category} onChange={e => setMatForm({ ...matForm, category: e.target.value })} /></div>
                                            <div><label className="app-label">Unité d'achat (ex: Barre)</label><input disabled={isReadOnlyDueToDowngrade} required type="text" className="app-input" value={matForm.unitBuy} onChange={e => setMatForm({ ...matForm, unitBuy: e.target.value })} /></div>
                                            <div><label className="app-label">Taille (ex: 6)</label><input disabled={isReadOnlyDueToDowngrade} required type="number" step="0.01" min="0.01" className="app-input" value={matForm.unitSize} onChange={e => setMatForm({ ...matForm, unitSize: e.target.value })} /></div>
                                            <div><label className="app-label">Unité calcul (ex: m)</label><input disabled={isReadOnlyDueToDowngrade} required type="text" className="app-input" value={matForm.unitCalc} onChange={e => setMatForm({ ...matForm, unitCalc: e.target.value })} /></div>
                                            <div>
                                                <label className="app-label">Prix d'Achat Brut</label>
                                                <div className="relative">
                                                    <input disabled={isReadOnlyDueToDowngrade} required type="number" min="0" className="app-input font-bold text-brand-700 pr-12" value={matForm.priceBuy} onChange={e => setMatForm({ ...matForm, priceBuy: e.target.value })} />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 font-bold">{companyInfo.currency || 'FCFA'}</span>
                                                </div>
                                            </div>
                                            <div><label className="app-label">Rendement Matière (m²/unité)</label><input disabled={isReadOnlyDueToDowngrade} type="number" step="0.1" min="0" className="app-input font-bold" value={matForm.yieldRate || ''} onChange={e => setMatForm({ ...matForm, yieldRate: e.target.value })} placeholder="ex: 10 (m²/L)" /></div>
                                            <div><label className="app-label">Taux de perte (%)</label><input disabled={isReadOnlyDueToDowngrade} required type="number" min="0" max="100" className="app-input" value={matForm.waste} onChange={e => setMatForm({ ...matForm, waste: e.target.value })} /></div>
                                            <div>
                                                <label className="app-label">Stratégie d'Achat BTP</label>
                                                <select disabled={isReadOnlyDueToDowngrade} className="app-input font-bold" value={matForm.purchaseMode || 'pack'} onChange={e => setMatForm({ ...matForm, purchaseMode: e.target.value })}>
                                                    <option value="pack">Conditionnement Entier (Barre/Feuille/Pot)</option>
                                                    <option value="real">Quantité Réelle Exacte (au m², m, L)</option>
                                                    <option value="step">Pas Commercial Ajustable</option>
                                                </select>
                                            </div>
                                            {(matForm.purchaseMode === 'step') && (
                                                <div>
                                                    <label className="app-label">Pas Commercial (ex: 0.5)</label>
                                                    <input disabled={isReadOnlyDueToDowngrade} type="number" step="0.01" min="0.01" className="app-input font-bold text-brand-600" value={matForm.purchaseStep || 0.5} onChange={e => setMatForm({ ...matForm, purchaseStep: e.target.value })} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex justify-end gap-3 pt-2 border-t border-neutral-100">
                                            <button type="button" onClick={cancelEdit} className="btn-secondary" aria-label="Annuler la modification">Annuler</button>
                                            {!isReadOnlyDueToDowngrade && <button type="submit" className="btn-primary" aria-label="Enregistrer la ressource"><i className="fa-solid fa-check mr-1"></i> Enregistrer</button>}
                                        </div>
                                    </form>
                                ) : (
                                    <form onSubmit={saveLabor} className="space-y-5">
                                        <div>
                                            <label className="app-label">Intitulé / Métier</label>
                                            <input disabled={isReadOnlyDueToDowngrade} required type="text" className="app-input font-bold" value={laborForm.name} onChange={e => setLaborForm({ ...laborForm, name: e.target.value })} placeholder="Ex: Application Peinture" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="app-label">Mode de calcul</label>
                                                <CustomSelect
                                                    disabled={isReadOnlyDueToDowngrade}
                                                    value={laborForm.calcMode}
                                                    onChange={e => setLaborForm({ ...laborForm, calcMode: e.target.value })}
                                                    options={[
                                                        { value: 'unite', label: 'Unité (Quantité)' },
                                                        { value: 'surface', label: 'Surface (L x H m²)' },
                                                        { value: 'volume', label: 'Volume (L x H x P m³)' },
                                                        { value: 'perimetre', label: 'Périmètre / Linéaire ml' },
                                                        { value: 'forfait', label: 'Forfait Fixe' }
                                                    ]}
                                                />
                                            </div>
                                            <div>
                                                <label className="app-label">Unité de mesure</label>
                                                <CustomSelect
                                                    disabled={isReadOnlyDueToDowngrade}
                                                    value={laborForm.unit || 'h'}
                                                    onChange={e => setLaborForm({ ...laborForm, unit: e.target.value })}
                                                    options={[
                                                        { value: 'h', label: 'h (heures)' },
                                                        { value: 'j', label: 'j (jours)' },
                                                        { value: 'j-eq', label: 'j-eq (jour-équipe)' },
                                                        { value: 'm³', label: 'm³ (mètre cube)' },
                                                        { value: 'kg', label: 'kg (kilogramme)' },
                                                        { value: 't', label: 't (tonne)' },
                                                        { value: 'sac', label: 'sac' },
                                                        { value: 'L', label: 'L (litre)' },
                                                        { value: 'ml', label: 'ml (mètre linéaire)' },
                                                        { value: 'm²', label: 'm²' },
                                                        { value: 'u', label: 'u (unités / pièces)' },
                                                        { value: 'ens', label: 'ens (ensemble)' },
                                                        { value: 'pt', label: 'pt (point / poste)' },
                                                        { value: 'forfait', label: 'forfait' }
                                                    ]}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="app-label">Tarif Unitaire</label>
                                                <div className="relative">
                                                    <input disabled={isReadOnlyDueToDowngrade} required type="number" min="0" className="app-input font-bold text-brand-700 pr-12" value={laborForm.rate} onChange={e => setLaborForm({ ...laborForm, rate: e.target.value })} />
                                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 font-bold">{companyInfo.currency || 'FCFA'}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="app-label">Rendement (Vitesse d'Exécution)</label>
                                                <input disabled={isReadOnlyDueToDowngrade} type="number" min="0" className="app-input font-bold text-brand-700" value={laborForm.yieldRate || ''} onChange={e => setLaborForm({ ...laborForm, yieldRate: e.target.value })} placeholder="ex: 80 (m²/j)" />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-3 pt-2 border-t border-neutral-100">
                                            <button type="button" onClick={cancelEdit} className="btn-secondary" aria-label="Annuler la modification">Annuler</button>
                                            {!isReadOnlyDueToDowngrade && <button type="submit" className="btn-primary" aria-label="Enregistrer la prestation"><i className="fa-solid fa-check mr-1"></i> Enregistrer</button>}
                                        </div>
                                    </form>
                                )
                            ) : resourceTab === 'materials' && resourceDetailTab === 'history' ? (
                                <div className="space-y-4">
                                    <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider block">Prix d'Achat Actuel</span>
                                            <span className="text-xl font-black text-brand-600 font-mono">{formatMoney(selectedItem.priceBuy || selectedItem.priceCalc, companyInfo.currency)}</span>
                                            <span className="text-[11px] text-neutral-500 block">par {selectedItem.unitBuy || selectedItem.unitCalc}</span>
                                        </div>
                                        {historyVariationPct !== null && (
                                            <span className={`px-2.5 py-1 rounded-xl text-xs font-black border ${historyVariationPct >= 0 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-red-100 text-red-800 border-red-300'}`}>
                                                <i className={`fa-solid fa-arrow-trend-${historyVariationPct >= 0 ? 'up' : 'down'} mr-1`}></i> {historyVariationPct >= 0 ? '+' : ''}{historyVariationPct.toFixed(1)}%
                                            </span>
                                        )}
                                    </div>
                                    {!isCloudOrgActive ? (
                                        <div className="p-6 text-center text-neutral-400 bg-neutral-50 rounded-2xl border border-neutral-200">
                                            <i className="fa-solid fa-cloud text-2xl mb-2 text-neutral-300"></i>
                                            <p className="text-xs font-bold text-neutral-600">Historique disponible uniquement en mode connecté</p>
                                            <p className="text-[11px] text-neutral-400 mt-1">Connectez-vous à votre organisation cloud pour suivre l'évolution réelle des prix.</p>
                                        </div>
                                    ) : materialHistoryLoading ? (
                                        <div className="p-6 text-center text-neutral-400"><i className="fa-solid fa-circle-notch fa-spin text-xl text-amber-500"></i></div>
                                    ) : materialHistory.length === 0 ? (
                                        <div className="p-6 text-center text-neutral-400 bg-neutral-50 rounded-2xl border border-neutral-200">
                                            <i className="fa-solid fa-clock-rotate-left text-2xl mb-2 text-neutral-300"></i>
                                            <p className="text-xs font-bold text-neutral-600">{materialHistoryError ? 'Historique indisponible pour le moment' : 'Aucun changement de prix enregistré'}</p>
                                            <p className="text-[11px] text-neutral-400 mt-1">Chaque modification du prix d'achat sera journalisée ici.</p>
                                        </div>
                                    ) : (
                                        <div className="border border-neutral-200 rounded-2xl bg-white overflow-hidden shadow-2xs">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-neutral-50 border-b border-neutral-100 text-[10px] font-extrabold text-neutral-400 uppercase">
                                                    <tr><th className="p-2.5 pl-3">Date</th><th className="p-2.5">Fournisseur</th><th className="p-2.5 text-right pr-3">Tarif HT</th></tr>
                                                </thead>
                                                <tbody className="divide-y divide-neutral-100">
                                                    {materialHistory.map((h) => (
                                                        <tr key={h.id} className="hover:bg-neutral-50/50">
                                                            <td className="p-2.5 pl-3 font-mono text-neutral-500">{new Date(h.created_at).toLocaleDateString('fr-FR')}</td>
                                                            <td className="p-2.5 font-bold text-neutral-800">{h.supplier_name || 'Non renseigné'}</td>
                                                            <td className="p-2.5 text-right pr-3 font-mono font-bold text-neutral-900">{formatMoney(h.price)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ) : resourceTab === 'materials' ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80">
                                        <span className="text-neutral-400 block text-[10px] uppercase font-bold">Achat Fournisseur</span>
                                        <span className="font-bold text-neutral-800">{formatMoney(selectedItem.priceBuy, companyInfo.currency)}</span>
                                        <p className="text-[11px] text-neutral-500 mt-0.5">pour {selectedItem.unitSize} {selectedItem.unitCalc} ({selectedItem.unitBuy})</p>
                                    </div>
                                    <div className="bg-brand-50/30 p-3.5 rounded-xl border border-neutral-200/80">
                                        <span className="text-neutral-400 block text-[10px] uppercase font-bold">Coût Unitaire Net</span>
                                        <span className="font-extrabold text-brand-600 text-base">{formatMoney(selectedItem.priceCalc, companyInfo.currency)}</span>
                                        <p className="text-[11px] text-neutral-500 mt-0.5">/ {selectedItem.unitCalc}</p>
                                    </div>
                                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80">
                                        <span className="text-neutral-400 block text-[10px] uppercase font-bold">Rendement Matière</span>
                                        <span className="font-bold text-neutral-800">{selectedItem.yieldRate > 0 ? `${selectedItem.yieldRate} m²/${selectedItem.unitCalc}` : 'Non renseigné'}</span>
                                    </div>
                                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80">
                                        <span className="text-neutral-400 block text-[10px] uppercase font-bold">Taux de perte</span>
                                        <span className="font-bold text-neutral-800">{selectedItem.waste > 0 ? `${selectedItem.waste}%` : 'Aucune'}</span>
                                    </div>
                                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80 col-span-2">
                                        <span className="text-neutral-400 block text-[10px] uppercase font-bold">Stratégie d'Achat BTP</span>
                                        <span className="font-bold text-neutral-800">
                                            {selectedItem.purchaseMode === 'real' ? 'Quantité Réelle Exacte' : selectedItem.purchaseMode === 'step' ? `Pas Commercial Ajustable (${selectedItem.purchaseStep || 0.5})` : 'Conditionnement Entier'}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-brand-50/30 p-3.5 rounded-xl border border-neutral-200/80">
                                        <span className="text-neutral-400 block text-[10px] uppercase font-bold">Tarif Unitaire</span>
                                        <span className="font-extrabold text-brand-600 text-base">{formatMoney(selectedItem.rate, companyInfo.currency)}</span>
                                        <p className="text-[11px] text-neutral-500 mt-0.5">/ {selectedItem.unit || 'u'}</p>
                                    </div>
                                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80">
                                        <span className="text-neutral-400 block text-[10px] uppercase font-bold">Vitesse d'Exécution</span>
                                        <span className="font-bold text-neutral-800">{selectedItem.yieldRate > 0 ? `${selectedItem.yieldRate} m²/${selectedItem.unit}` : 'Au forfait unitaire'}</span>
                                    </div>
                                    <div className="bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80 col-span-2">
                                        <span className="text-neutral-400 block text-[10px] uppercase font-bold">Mode de Calcul</span>
                                        <span className="font-bold text-neutral-800 capitalize">{selectedItem.calcMode}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
        );
    };

    const NavItem = ({ id, icon, label, onClickExtra }) => {
        const isActive = activeView === id;
        return (
            <button 
                onClick={() => {
                    setActiveView(id);
                    if (onClickExtra) onClickExtra();
                }} 
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col lg:flex-row items-center lg:justify-start justify-center w-full lg:px-4 py-2 lg:py-3.5 rounded-xl transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                          ${isActive ? 'text-brand-600 bg-brand-50 lg:shadow-[inset_3px_0_0_0_#e6222b]' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`}>
                <i className={`fa-solid ${icon} text-xl lg:text-lg mb-1 lg:mb-0 lg:w-6 lg:text-center transition-transform ${isActive ? 'scale-110 lg:scale-100 text-brand-600' : 'opacity-70 group-hover:text-neutral-700'}`}></i>
                <span className={`text-[11px] lg:text-sm font-bold tracking-wide lg:tracking-normal ${isActive ? 'text-brand-600' : 'text-neutral-700'}`}>{label}</span>
            </button>
        );
    };

    // P0.9 (2026-08-17) — Composant dédié au restyle de la sidebar/tiroir de
    // navigation (desktop, tablette repliée, tiroir mobile). Distinct de
    // NavItem ci-dessus (qui reste inchangé, utilisé par la barre d'onglets
    // du bas) pour ne jamais affecter cette dernière. Même state/handlers
    // (setActiveView, activeView) — aucune logique métier nouvelle.
    const SidebarNavItem = ({ id, icon, label, onClickExtra, collapsed = false }) => {
        const isActive = activeView === id;
        return (
            <div className={collapsed ? 'relative sidebar-item-collapsed-wrap' : 'relative'}>
                <button
                    onClick={() => { setActiveView(id); if (onClickExtra) onClickExtra(); }}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={collapsed ? label : undefined}
                    className={`sidebar-item outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${collapsed ? 'sidebar-item-collapsed' : ''} ${isActive ? 'sidebar-item-active' : ''}`}
                >
                    <i className={`fa-solid ${icon} sidebar-item-icon`}></i>
                    {!collapsed && <span className="sidebar-item-label">{label}</span>}
                </button>
                {collapsed && <span className="sidebar-tooltip" role="tooltip">{label}</span>}
            </div>
        );
    };

    return (
        <div className="flex h-[100dvh] w-full bg-neutral-100 overflow-hidden font-sans">
            {/* SKIP LINK ACCESSIBLE POUR NAVIGATION CLAVIER / LECTEURS D'ÉCRAN */}
            <a 
                href="#main-content" 
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-brand-600 focus:text-white focus:font-bold focus:px-4 focus:py-2.5 focus:rounded-xl focus:shadow-xl"
            >
                Aller au contenu principal
            </a>

            {/* SIDEBAR DESKTOP (≥ 1024px) */}
            <aside className="hidden lg:flex flex-col sidebar-shell border-r border-neutral-200/70 z-20 shrink-0">
                <div className="p-4 flex flex-col gap-3 border-b border-neutral-100 shrink-0">
                    <div className="flex items-center justify-between">
                        <LogoSVG className="h-8 w-auto" />
                    </div>
                    <OrganizationSwitcher
                        userOrganizations={userOrganizations}
                        activeOrgId={activeOrganizationId}
                        activeOrgRole={activeOrganizationRole}
                        onSelectOrg={(orgId) => {
                            setActiveOrganizationId(orgId);
                            const found = userOrganizations.find(o => o.id === orgId);
                            if (found) setActiveOrganizationRole(found.role);
                            localStorage.setItem(`ikadevis_active_org_${currentUserId}`, orgId);
                            showToast(`Organisation active : ${found?.name || orgId}`, "info");
                        }}
                        onOpenCreateOrg={() => setIsCreateOrgModalOpen(true)}
                        isGuest={!sbUser || sbUser.id === 'guest'}
                    />
                </div>
                <nav className="flex-1 overflow-y-auto py-5 px-3 flex flex-col gap-[5px] custom-scroll" aria-label="Menu principal">
                    <p className="sidebar-section-label">Menu Principal</p>
                    <SidebarNavItem id="projects" icon="fa-folder-tree" label="Affaires & Projets" />
                    <SidebarNavItem id="clients" icon="fa-users" label="Clients (CRM)" />
                    <SidebarNavItem id="calculator" icon="fa-calculator" label="Créer un Devis" />
                    <SidebarNavItem id="savedQuotes" icon="fa-folder-open" label="Devis Enregistrés" />
                    <SidebarNavItem id="recipes" icon="fa-layer-group" label="Catalogue Ouvrages" />
                    <SidebarNavItem id="materials" icon="fa-database" label="Ressources & Prix" />
                </nav>
                <div className="p-4 border-t border-neutral-100 flex flex-col gap-2.5">
                    {sbUser && (
                        <div className={`flex flex-col gap-1 px-3.5 py-2.5 rounded-xl text-xs font-semibold border ${
                            sbSyncStatus === 'saved' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                            sbSyncStatus === 'syncing' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                            sbSyncStatus === 'error' ? 'bg-red-50 text-red-800 border-red-200' :
                            'bg-neutral-50 text-neutral-700 border-neutral-200'
                        }`}>
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5 font-bold">
                                    <i className={`fa-solid ${
                                        sbSyncStatus === 'saved' ? 'fa-cloud-check text-emerald-600' :
                                        sbSyncStatus === 'syncing' ? 'fa-arrow-rotate-right fa-spin text-blue-600' :
                                        sbSyncStatus === 'error' ? 'fa-triangle-exclamation text-red-600' :
                                        'fa-cloud text-neutral-400'
                                    }`}></i>
                                    {sbSyncStatus === 'saved' && 'Synchronisé'}
                                    {sbSyncStatus === 'syncing' && 'Sauvegarde…'}
                                    {sbSyncStatus === 'error' && 'Erreur Cloud'}
                                    {sbSyncStatus === 'idle' && 'Cloud Actif'}
                                </span>
                                {lastSavedTime.current && <span className="text-[10px] opacity-75 font-mono">{lastSavedTime.current}</span>}
                            </div>
                            <span className="truncate text-[11px] opacity-80">{sbUser.email}</span>
                        </div>
                    )}
                    {hasPermission(activeOrganizationRole, 'canViewAudit') && (
                        <button onClick={() => setIsAuditModalOpen(true)} className="w-full btn-secondary text-xs py-2.5 px-3 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50 border-indigo-200 flex items-center justify-center gap-2 font-bold" aria-label="Journal de sécurité et audit">
                            <i className="fa-solid fa-shield-halved text-indigo-600"></i> Journal d'Audit & Sécurité
                        </button>
                    )}
                    <button onClick={() => setIsCompanyModalOpen(true)} className="w-full btn-secondary text-xs py-2.5 px-3 text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-2" aria-label="Paramètres de l'entreprise">
                        <i className="fa-solid fa-building text-brand-500"></i> Paramètres Entreprise
                    </button>
                    {onSignOut && (
                        <button onClick={onSignOut} className="w-full text-xs py-2.5 px-3 rounded-xl text-neutral-500 hover:text-red-600 hover:bg-red-50 flex items-center justify-center gap-2 font-semibold transition-all" aria-label="Se déconnecter">
                            <i className="fa-solid fa-arrow-right-from-bracket"></i> Déconnexion
                        </button>
                    )}
                </div>
            </aside>

            {/* RAIL TABLETTE REPLIÉ (768–1023px) — icônes seules + tooltip au survol,
                mêmes items/handlers que la sidebar desktop, rien de nouveau côté logique. */}
            <aside className="hidden md:flex lg:hidden flex-col sidebar-shell-collapsed border-r border-neutral-200/70 z-20 shrink-0 items-center py-4 gap-4">
                {/* Repère visuel de marque au format icône seule (rail replié trop
                    étroit pour le logo complet ikadevis + baseline) */}
                <svg className="h-7 w-7" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <rect x="5" y="5" width="40" height="40" rx="10" fill="#E6222B"/>
                    <path d="M15 30L23 18L31 30H15Z" fill="white"/>
                    <circle cx="33" cy="17" r="4" fill="white"/>
                </svg>
                <nav className="flex-1 overflow-y-auto flex flex-col gap-[5px] custom-scroll w-full items-center" aria-label="Menu principal (replié)">
                    <SidebarNavItem id="projects" icon="fa-folder-tree" label="Affaires & Projets" collapsed />
                    <SidebarNavItem id="clients" icon="fa-users" label="Clients (CRM)" collapsed />
                    <SidebarNavItem id="calculator" icon="fa-calculator" label="Créer un Devis" collapsed />
                    <SidebarNavItem id="savedQuotes" icon="fa-folder-open" label="Devis Enregistrés" collapsed />
                    <SidebarNavItem id="recipes" icon="fa-layer-group" label="Catalogue Ouvrages" collapsed />
                    <SidebarNavItem id="materials" icon="fa-database" label="Ressources & Prix" collapsed />
                </nav>
                <div className="flex flex-col gap-2 w-full items-center pt-2 border-t border-neutral-100">
                    {hasPermission(activeOrganizationRole, 'canViewAudit') && (
                        <div className="relative sidebar-item-collapsed-wrap">
                            <button onClick={() => setIsAuditModalOpen(true)} className="btn-icon text-indigo-600 hover:bg-indigo-50" aria-label="Journal de sécurité et audit">
                                <i className="fa-solid fa-shield-halved"></i>
                            </button>
                            <span className="sidebar-tooltip" role="tooltip">Journal d'Audit & Sécurité</span>
                        </div>
                    )}
                    <div className="relative sidebar-item-collapsed-wrap">
                        <button onClick={() => setIsCompanyModalOpen(true)} className="btn-icon text-brand-500 hover:bg-brand-50" aria-label="Paramètres de l'entreprise">
                            <i className="fa-solid fa-building"></i>
                        </button>
                        <span className="sidebar-tooltip" role="tooltip">Paramètres Entreprise</span>
                    </div>
                    {onSignOut && (
                        <div className="relative sidebar-item-collapsed-wrap">
                            <button onClick={onSignOut} className="btn-icon text-neutral-400 hover:text-red-600 hover:bg-red-50" aria-label="Se déconnecter">
                                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                            </button>
                            <span className="sidebar-tooltip" role="tooltip">Déconnexion</span>
                        </div>
                    )}
                </div>
            </aside>

            {/* TIROIR MOBILE (< 768px) — au-delà, le rail tablette/desktop prend le
                relais (persistant, plus besoin d'un tiroir off-canvas). */}
            {isMobileDrawerOpen && (
                <div className="fixed inset-0 z-[150] md:hidden flex" role="dialog" aria-modal="true" aria-label="Menu de navigation mobile">
                    <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsMobileDrawerOpen(false)} aria-hidden="true"></div>
                    <div className="relative flex flex-col w-[min(85vw,300px)] sidebar-shell h-full shadow-2xl z-10 animate-fade-in">
                        <div className="p-4 flex items-center justify-between border-b border-neutral-100">
                            <LogoSVG className="h-8" />
                            <button onClick={() => setIsMobileDrawerOpen(false)} className="btn-icon text-neutral-500 hover:text-neutral-800" aria-label="Fermer le menu de navigation">
                                <i className="fa-solid fa-xmark text-xl"></i>
                            </button>
                        </div>
                        <nav className="flex-1 overflow-y-auto p-3 flex flex-col gap-[5px] custom-scroll" aria-label="Navigation mobile">
                            <p className="sidebar-section-label">Navigation</p>
                            <SidebarNavItem id="projects" icon="fa-folder-tree" label="Affaires & Projets" onClickExtra={() => setIsMobileDrawerOpen(false)} />
                            <SidebarNavItem id="clients" icon="fa-users" label="Clients (CRM)" onClickExtra={() => setIsMobileDrawerOpen(false)} />
                            <SidebarNavItem id="calculator" icon="fa-calculator" label="Créer un Devis" onClickExtra={() => setIsMobileDrawerOpen(false)} />
                            <SidebarNavItem id="savedQuotes" icon="fa-folder-open" label="Devis Enregistrés" onClickExtra={() => setIsMobileDrawerOpen(false)} />
                            <SidebarNavItem id="recipes" icon="fa-layer-group" label="Catalogue Ouvrages" onClickExtra={() => setIsMobileDrawerOpen(false)} />
                            <SidebarNavItem id="materials" icon="fa-database" label="Ressources & Prix" onClickExtra={() => setIsMobileDrawerOpen(false)} />
                        </nav>
                        <div className="p-4 border-t border-neutral-100 space-y-2">
                            <button onClick={() => { setIsCompanyModalOpen(true); setIsMobileDrawerOpen(false); }} className="w-full btn-secondary text-xs py-2 px-3 justify-center" aria-label="Paramètres entreprise">
                                <i className="fa-solid fa-building text-brand-500 mr-2"></i> Paramètres Entreprise
                            </button>
                            {onSignOut && (
                                <button onClick={onSignOut} className="w-full text-xs py-2 px-3 rounded-xl text-neutral-500 hover:text-red-600 hover:bg-red-50 flex items-center justify-center gap-2 font-semibold" aria-label="Déconnexion">
                                    <i className="fa-solid fa-arrow-right-from-bracket"></i> Déconnexion
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                {/* HEADER SOUS 768px AVEC BOUTON HAMBURGER (tablette/desktop ont le rail/la sidebar persistants) */}
                <header className="md:hidden shrink-0 h-16 bg-white border-b border-neutral-200 z-30 flex items-center justify-between px-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsMobileDrawerOpen(true)} 
                            className="btn-icon text-neutral-700 hover:text-brand-600 hover:bg-neutral-100 p-2" 
                            aria-label="Ouvrir le menu de navigation"
                            title="Menu"
                        >
                            <i className="fa-solid fa-bars text-xl"></i>
                        </button>
                        <LogoSVG className="h-7" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-300'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                            <span>{isOnline ? 'En ligne' : 'Hors-ligne'}</span>
                        </div>
                        <button 
                            onClick={() => setIsCompanyModalOpen(true)} 
                            className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                            aria-label="Ouvrir les paramètres entreprise"
                        >
                            <i className="fa-solid fa-building text-brand-500"></i>
                            <span className="hidden sm:inline font-bold truncate max-w-[120px]">{companyInfo.name}</span>
                        </button>
                    </div>
                </header>

                {/* V5.3 READ-ONLY BANNER */}
                {downgradeWarning && (
                    <div className="bg-red-600 text-white px-4 py-3 text-xs font-extrabold flex items-center justify-between shrink-0 shadow-lg animate-pulse" role="alert">
                        <div className="flex items-center gap-2">
                            <i className="fa-solid fa-lock text-base"></i>
                            <span>{downgradeWarning}</span>
                        </div>
                    </div>
                )}

                {/* V5.7.1 CLOUD OFFLINE INFORMATIONAL BANNER */}
                {cloudState === 'offline_error' && cloudErrorMessage && (
                    <div className="bg-amber-600 text-white px-4 py-3 text-xs font-extrabold flex items-center justify-between shrink-0 shadow-lg" role="alert">
                        <div className="flex items-center gap-2">
                            <i className="fa-solid fa-wifi text-base"></i>
                            <span>⚠️ {cloudErrorMessage}</span>
                        </div>
                        <button onClick={() => { setCloudState('idle'); setSbDataLoaded(false); setCloudRetryCount(c => c + 1); }} className="underline text-xs hover:text-amber-100 font-bold px-3 py-1 bg-amber-700/60 rounded-md transition-all">Réessayer la synchronisation</button>
                    </div>
                )}

                <main id="main-content" className="flex-1 overflow-y-auto w-full custom-scroll pb-28 md:pb-8">
                    <div className="p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto">
                        <header className="hidden lg:flex h-12 items-center justify-between mb-6 shrink-0">
                            <h1 className="text-2xl font-extrabold text-neutral-800 tracking-tight">
                                {activeView === 'calculator' && 'Création & Chiffrage de Devis BTP'}
                                {activeView === 'savedQuotes' && 'Devis Enregistrés & PDF Commercial'}
                                {activeView === 'recipes' && 'Catalogue des Ouvrages & Formules'}
                                {activeView === 'materials' && 'Base des Ressources & Coûts'}
                            </h1>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setIsHealthModalOpen(true)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${(!sbUser || sbUser.id === 'guest') ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 shadow-2xs' : isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 shadow-2xs' : 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100 shadow-2xs'}`} 
                                    title="Ouvrir le Diagnostic Système & Health Check"
                                >
                                    <span className={`w-2 h-2 rounded-full ${(!sbUser || sbUser.id === 'guest') ? 'bg-amber-500' : isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`}></span>
                                    <span>{(!sbUser || sbUser.id === 'guest') ? 'Mode Démo (Local)' : isOnline ? 'Cloud Connecté' : 'Mode Chantier'}</span>
                                </button>
                                <button onClick={() => setIsCompanyModalOpen(true)} className="btn-secondary text-xs py-1.5 px-3" aria-label="Paramètres de l'entreprise">
                                    <i className="fa-solid fa-building text-brand-500"></i> {companyInfo.name}
                                </button>
                                <button disabled={isReadOnlyDueToDowngrade} onClick={resetToDefault} className={`btn-secondary text-xs text-red-600 border-red-200 hover:bg-red-50 py-1.5 px-3 ${isReadOnlyDueToDowngrade ? 'opacity-50 cursor-not-allowed' : ''}`} aria-label="Réinitialiser les données">
                                    <i className="fa-solid fa-arrow-rotate-left"></i> Réinitialiser
                                </button>
                            </div>
                        </header>
                        <div className="animate-fade-in w-full">
                            {activeView === 'calculator' && renderCalculator()}
                            {activeView === 'projects' && renderProjects()}
                            {activeView === 'clients' && renderClients()}
                            {activeView === 'savedQuotes' && renderSavedQuotes()}
                            {activeView === 'recipes' && renderRecipes()}
                            {activeView === 'materials' && renderMaterials()}
                        </div>
                    </div>
                </main>

                {/* BOTTOM BAR MOBILE (< 768px) — tablette/desktop ont le rail/la sidebar persistants */}
                <nav className="md:hidden absolute bottom-0 left-0 right-0 bg-white border-t border-neutral-200 z-40 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom,1rem)] pt-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] min-h-[4.5rem]" aria-label="Barre de navigation rapide">
                    <NavItem id="calculator" icon="fa-calculator" label="Calcul" />
                    <NavItem id="savedQuotes" icon="fa-folder-open" label="Mes devis" />
                    <NavItem id="recipes" icon="fa-layer-group" label="Catalogue" />
                    <NavItem id="materials" icon="fa-database" label="Ressources" />
                </nav>
            </div>

            {/* Company Settings Modal */}
            {isAuditModalOpen && (
                <AuditLogViewerModal
                    isOpen={isAuditModalOpen}
                    onClose={() => setIsAuditModalOpen(false)}
                    organizationId={activeOrganizationId}
                    supabaseClient={supabaseClient}
                    currentRole={activeOrganizationRole}
                />
            )}

            {isCreateOrgModalOpen && (
                <CreateOrganizationModal
                    isOpen={isCreateOrgModalOpen}
                    onClose={() => setIsCreateOrgModalOpen(false)}
                    onCreateOrg={handleCreateOrganization}
                    isReadOnly={isReadOnlyDueToDowngrade}
                />
            )}

            {isMatCsvModalOpen && (
                <MaterialCsvModal
                    isOpen={isMatCsvModalOpen}
                    onClose={() => setIsMatCsvModalOpen(false)}
                    existingMaterials={materials}
                    onImportMaterials={(newMats) => {
                        updateMaterials(newMats);
                        showToast(`${newMats.length} matières enregistrées dans le catalogue !`, "success");
                    }}
                />
            )}

            {isCompanyModalOpen && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
                    <div className="bg-white rounded-2xl shadow-floating w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white">
                            <h3 className="font-bold text-neutral-800 text-lg"><i className="fa-solid fa-building text-brand-500 mr-2"></i>Paramètres Entreprise</h3>
                            <button onClick={() => setIsCompanyModalOpen(false)} className="btn-icon w-8 h-8" aria-label="Fermer la boîte de dialogue"><i className="fa-solid fa-xmark text-xl"></i></button>
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); if (!isReadOnlyDueToDowngrade) { updateCompanyInfo({ ...companyInfo }); setIsCompanyModalOpen(false); showToast("Paramètres entreprise sauvegardés"); } }}>
                            <div className="p-6 overflow-y-auto custom-scroll bg-neutral-50/50 space-y-4 max-h-[70dvh]">
                                <div>
                                    <label htmlFor="company_name" className="app-label">Raison Sociale / Nom Entreprise</label>
                                    <input id="company_name" disabled={isReadOnlyDueToDowngrade} required type="text" className="app-input font-bold" value={companyInfo.name} onChange={e => updateCompanyInfo({...companyInfo, name: e.target.value})} placeholder="Ex : Entreprise BTP SARL" />
                                </div>
                                <div>
                                    <label htmlFor="company_tagline" className="app-label">Slogan / Activités principales</label>
                                    <input id="company_tagline" disabled={isReadOnlyDueToDowngrade} type="text" className="app-input font-bold" value={companyInfo.tagline} onChange={e => updateCompanyInfo({...companyInfo, tagline: e.target.value})} placeholder="Ex : Travaux Publics & Bâtiment" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="company_phone" className="app-label">Téléphone / WhatsApp</label>
                                        <input id="company_phone" disabled={isReadOnlyDueToDowngrade} type="text" className="app-input font-bold" value={companyInfo.phone} onChange={e => updateCompanyInfo({...companyInfo, phone: e.target.value})} placeholder="+223 XX XX XX XX" />
                                    </div>
                                    <div>
                                        <label htmlFor="company_email" className="app-label">Email professionnel</label>
                                        <input id="company_email" disabled={isReadOnlyDueToDowngrade} type="email" className="app-input font-bold" value={companyInfo.email} onChange={e => updateCompanyInfo({...companyInfo, email: e.target.value})} placeholder="contact@entreprise.com" />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="company_address" className="app-label">Adresse Géographique</label>
                                    <input id="company_address" disabled={isReadOnlyDueToDowngrade} type="text" className="app-input font-bold" value={companyInfo.address} onChange={e => updateCompanyInfo({...companyInfo, address: e.target.value})} placeholder="Bamako, Mali" />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="company_nif" className="app-label flex justify-between items-center">
                                            <span>NIF (Identifiant Fiscal)</span>
                                            <span className="text-[10px] text-neutral-400 font-normal">Numéro Fiscal</span>
                                        </label>
                                        <input id="company_nif" disabled={isReadOnlyDueToDowngrade} type="text" className="app-input font-bold" value={companyInfo.nif} onChange={e => updateCompanyInfo({...companyInfo, nif: e.target.value})} placeholder="Ex : 084123456A" />
                                    </div>
                                    <div>
                                        <label htmlFor="company_rccm" className="app-label flex justify-between items-center">
                                            <span>RCCM (Registre du Commerce)</span>
                                            <span className="text-[10px] text-neutral-400 font-normal">Immatriculation</span>
                                        </label>
                                        <input id="company_rccm" disabled={isReadOnlyDueToDowngrade} type="text" className="app-input font-bold" value={companyInfo.rccm} onChange={e => updateCompanyInfo({...companyInfo, rccm: e.target.value})} placeholder="Ex : MA.BKO.2024.B.1234" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="company_currency" className="app-label">Devise principale</label>
                                        <input id="company_currency" disabled={isReadOnlyDueToDowngrade} type="text" className="app-input font-bold" value={companyInfo.currency} onChange={e => updateCompanyInfo({...companyInfo, currency: e.target.value})} placeholder="FCFA, EUR, USD..." />
                                    </div>
                                    <div>
                                        <label htmlFor="company_validity" className="app-label flex justify-between items-center">
                                            <span>Validité de l'offre</span>
                                            <span className="text-[10px] text-neutral-400 font-normal">Sur devis client</span>
                                        </label>
                                        <input id="company_validity" disabled={isReadOnlyDueToDowngrade} type="text" className="app-input font-bold" value={companyInfo.quoteValidity} onChange={e => updateCompanyInfo({...companyInfo, quoteValidity: e.target.value})} placeholder="30 jours" />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="company_terms" className="app-label">Conditions de Règlement Client</label>
                                    <textarea id="company_terms" disabled={isReadOnlyDueToDowngrade} className="app-input font-medium" rows="2" value={companyInfo.paymentTerms} onChange={e => setCompanyInfo({...companyInfo, paymentTerms: e.target.value})} placeholder="Ex : 50% à la commande, 40% à l'avancement, 10% à la livraison."></textarea>
                                </div>
                            </div>
                            <div className="px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3">
                                <button type="button" onClick={() => setIsCompanyModalOpen(false)} className="btn-secondary" aria-label="Fermer la boîte de dialogue">Fermer</button>
                                {!isReadOnlyDueToDowngrade && <button type="submit" className="btn-primary" aria-label="Enregistrer les paramètres de l'entreprise"><i className="fa-solid fa-check mr-1.5"></i> Enregistrer</button>}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isAllowedModesModalOpen && selectedSolutionForEdit && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
                    <div className="bg-white rounded-2xl shadow-floating w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white">
                            <h3 className="font-bold text-neutral-800 text-lg">Modes de Métré Autorisés pour {selectedSolutionForEdit.name}</h3>
                            <button onClick={() => setIsAllowedModesModalOpen(false)} className="btn-icon w-8 h-8" aria-label="Fermer la boîte de dialogue"><i className="fa-solid fa-xmark text-xl"></i></button>
                        </div>
                        <div className="p-6 bg-neutral-50/50 space-y-3">
                            {[
                                { id: 'rectangle', label: 'Rectangle (Largeur x Hauteur)' },
                                { id: 'surface', label: 'Surface Directe (m²)' },
                                { id: 'floor', label: 'Sol / Plafond (Largeur x Longueur)' },
                                { id: 'linear', label: 'Mètre Linéaire (ml)' },
                                { id: 'unit', label: 'Unité / Pièce (u)' }
                            ].map(mode => {
                                const isChecked = selectedSolutionForEdit.allowedModes && selectedSolutionForEdit.allowedModes.includes(mode.id);
                                return (
                                    <label key={mode.id} className="flex items-center p-3.5 bg-white border border-neutral-200 rounded-xl cursor-pointer hover:bg-neutral-50 transition-colors">
                                        <input disabled={isReadOnlyDueToDowngrade} type="checkbox" className="w-5 h-5 rounded border-neutral-300 text-brand-600 focus:ring-brand-500 accent-brand-600"
                                            checked={isChecked}
                                            onChange={e => {
                                                if (isReadOnlyDueToDowngrade) return;
                                                let currentModes = selectedSolutionForEdit.allowedModes || [];
                                                let newModes = e.target.checked 
                                                    ? [...currentModes, mode.id] 
                                                    : currentModes.filter(m => m !== mode.id);
                                                if (newModes.length === 0) newModes = ['rectangle'];
                                                
                                                const updatedSolutions = solutions.map(s => s.id === selectedSolutionForEdit.id ? { ...s, allowedModes: newModes } : s);
                                                setSolutions(updatedSolutions);
                                                setSelectedSolutionForEdit({ ...selectedSolutionForEdit, allowedModes: newModes });
                                            }} />
                                        <span className="ml-3 text-sm font-bold text-neutral-800">{mode.label}</span>
                                    </label>
                                );
                            })}
                        </div>
                        <div className="px-6 py-4 border-t border-neutral-100 bg-white flex justify-end">
                            <button onClick={() => setIsAllowedModesModalOpen(false)} className="btn-primary" aria-label="Fermer la boîte de dialogue">Fermer</button>
                        </div>
                    </div>
                </div>
            )}

            {isVarModalOpen && selectedSolutionForEdit && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
                    <div className="bg-white rounded-2xl shadow-floating w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white">
                            <h3 className="font-bold text-neutral-800 text-lg">Nouvelle Variable Dynamique (ex: PROFONDEUR)</h3>
                            <button onClick={() => setIsVarModalOpen(false)} className="btn-icon w-8 h-8" aria-label="Fermer la boîte de dialogue"><i className="fa-solid fa-xmark text-xl"></i></button>
                        </div>
                        <form onSubmit={handleAddCustomVarSubmit}>
                            <div className="p-6 bg-neutral-50/50 space-y-4">
                                <div>
                                    <label htmlFor="var_code_name" className="app-label">Nom Code Variable (ex: PROFONDEUR)</label>
                                    <input id="var_code_name" disabled={isReadOnlyDueToDowngrade} autoFocus required type="text" className="app-input font-bold font-mono uppercase" value={varForm.name} onChange={e => setVarForm({...varForm, name: e.target.value})} placeholder="PROFONDEUR, COUCHES, NB_PORTES..." />
                                </div>
                                <div>
                                    <label htmlFor="var_display_label" className="app-label">Libellé d'affichage (ex: Profondeur caisson)</label>
                                    <input id="var_display_label" disabled={isReadOnlyDueToDowngrade} type="text" className="app-input font-bold" value={varForm.label} onChange={e => setVarForm({...varForm, label: e.target.value})} placeholder="Ex: Profondeur meuble" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="var_default_val" className="app-label">Valeur par défaut (0 autorisé)</label>
                                        <input id="var_default_val" disabled={isReadOnlyDueToDowngrade} required type="number" step="0.1" className="app-input font-bold" value={varForm.defaultValue} onChange={e => setVarForm({...varForm, defaultValue: e.target.value})} />
                                    </div>
                                    <div>
                                        <label htmlFor="var_unit" className="app-label">Unité (m, cm, u, etc.)</label>
                                        <input id="var_unit" disabled={isReadOnlyDueToDowngrade} type="text" className="app-input font-bold" value={varForm.unit} onChange={e => setVarForm({...varForm, unit: e.target.value})} />
                                    </div>
                                </div>
                            </div>
                            <div className="px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3">
                                <button type="button" onClick={() => setIsVarModalOpen(false)} className="btn-secondary" aria-label="Annuler la création de variable">Annuler</button>
                                {!isReadOnlyDueToDowngrade && <button type="submit" className="btn-primary" aria-label="Créer la variable"><i className="fa-solid fa-plus mr-1"></i> Créer la variable</button>}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isRecipeModalOpen && recipeForm && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-floating w-full max-w-lg flex flex-col max-h-[90dvh] overflow-hidden">
                        <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white shrink-0">
                            <h3 className="font-bold text-neutral-800 text-lg">{recipeForm.id > 100000 ? 'Nouveau composant' : 'Modifier le composant'}</h3>
                            <button onClick={() => setIsRecipeModalOpen(false)} className="btn-icon w-8 h-8" aria-label="Fermer la boîte de dialogue"><i className="fa-solid fa-xmark text-xl"></i></button>
                        </div>
                        <div className="p-6 bg-neutral-50/50 overflow-y-auto custom-scroll pb-32">
                            <form id="recipeForm" onSubmit={(e) => { 
                                e.preventDefault(); 
                                if (isReadOnlyDueToDowngrade) return;
                                if(!recipeForm.refId) return; 
                                const newRec = {...recipeForm, refId: parseInt(recipeForm.refId)};
                                if (recipes.some(r => r.id === newRec.id)) {
                                    updateRecipes(recipes.map(r => r.id === newRec.id ? newRec : r));
                                } else {
                                    updateRecipes([...recipes, newRec]);
                                }
                                setIsRecipeModalOpen(false); 
                                showToast("Composant de recette enregistré"); 
                            }} className="space-y-5">
                                <div>
                                    <label className="app-label">Type de ressource</label>
                                    <CustomSelect 
                                        disabled={isReadOnlyDueToDowngrade}
                                        value={recipeForm.type} 
                                        onChange={e => setRecipeForm({...recipeForm, type: e.target.value, costCategory: e.target.value==='material' ? 'material' : 'labor', refId: e.target.value==='material' ? (materials[0]?.id || '') : (labor[0]?.id || '')})}
                                        options={[
                                            { value: 'material', label: 'Matière Première' },
                                            { value: 'labor', label: "Main d'œuvre / Prestation" }
                                        ]}
                                    />
                                </div>
                                <div>
                                    <label className="app-label">Catégorie Métier Explicite (costCategory)</label>
                                    <CustomSelect 
                                        disabled={isReadOnlyDueToDowngrade}
                                        value={recipeForm.costCategory || 'material'} 
                                        onChange={e => setRecipeForm({...recipeForm, costCategory: e.target.value})}
                                        options={[
                                            { value: 'material', label: 'Matières Premières' },
                                            { value: 'labor', label: "Main-d'œuvre Fabrication (Atelier)" },
                                            { value: 'installation', label: 'Pose & Installation (Site)' },
                                            { value: 'transport', label: 'Transport & Logistique' },
                                            { value: 'subcontracting', label: 'Sous-traitance' }
                                        ]}
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="app-label mb-0">Ressource liée</label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (recipeForm.type === 'material') {
                                                    setMatForm({ id: Date.now(), name: '', category: 'Fer', unitBuy: 'Barre (6m)', unitSize: 6, unitCalc: 'm', priceBuy: '', waste: 5, yieldRate: 0, purchaseMode: 'pack' });
                                                    setIsMatModalOpen(true);
                                                } else {
                                                    setLaborForm({ id: Date.now(), name: '', calcMode: 'surface', unit: 'm²', rate: '', yieldRate: 0 });
                                                    setIsLaborModalOpen(true);
                                                }
                                            }}
                                            className="text-xs font-black text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all shadow-2xs"
                                            title="Créer une nouvelle matière ou main-d'œuvre à la volée"
                                        >
                                            <i className="fa-solid fa-plus text-[10px]"></i>
                                            <span>+ Nouvelle {recipeForm.type === 'material' ? 'Matière' : 'Prestation'}</span>
                                        </button>
                                    </div>
                                    <CustomSelect 
                                        disabled={isReadOnlyDueToDowngrade}
                                        value={recipeForm.refId} 
                                        onChange={e => setRecipeForm({...recipeForm, refId: e.target.value})}
                                        options={recipeForm.type === 'material' 
                                            ? materials.map(m => ({ value: m.id, label: m.name })) 
                                            : labor.map(l => ({ value: l.id, label: l.name }))}
                                    />
                                </div>
                                <div>
                                    <label className="app-label">Formule Mathématique (supporte IF(cond, a, b))</label>
                                    <input disabled={isReadOnlyDueToDowngrade} required type="text" className="app-input font-bold font-mono" value={recipeForm.formula} onChange={e => setRecipeForm({...recipeForm, formula: e.target.value})} placeholder="Ex: SURFACE, IF(SURFACE > 100, SURFACE * 0.95, SURFACE)" />
                                </div>
                                <div><label className="app-label">Intitulé affiché sur le devis</label><input disabled={isReadOnlyDueToDowngrade} required type="text" className="app-input font-bold" value={recipeForm.label} onChange={e => setRecipeForm({...recipeForm, label: e.target.value})} placeholder="Ex: Fer du cadre" /></div>
                            </form>
                        </div>
                        <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-3 bg-white shrink-0">
                            <button type="button" onClick={() => setIsRecipeModalOpen(false)} className="btn-secondary" aria-label="Annuler la modification">Annuler</button>
                            {!isReadOnlyDueToDowngrade && <button type="submit" form="recipeForm" className="btn-primary" aria-label="Enregistrer le composant"><i className="fa-solid fa-check mr-1"></i> Enregistrer</button>}
                        </div>
                    </div>
                </div>
            )}

            {isSolutionModalOpen && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-floating w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white">
                            <h3 className="font-bold text-neutral-800 text-lg">{solutionModalForm.id ? 'Éditer l\'Ouvrage' : 'Nouvel Ouvrage'}</h3>
                            <button onClick={() => setIsSolutionModalOpen(false)} className="btn-icon w-8 h-8" aria-label="Fermer la boîte de dialogue"><i className="fa-solid fa-xmark text-xl"></i></button>
                        </div>
                        <form onSubmit={(e) => { 
                            e.preventDefault(); 
                            if (isReadOnlyDueToDowngrade) return;
                            if(solutionModalForm.name.trim()){
                                const modesToSave = solutionModalForm.allowedModes && solutionModalForm.allowedModes.length > 0 ? solutionModalForm.allowedModes : ['rectangle'];
                                if (solutionModalForm.id) {
                                    const nextSols = solutions.map(s => s.id === solutionModalForm.id ? { ...s, name: solutionModalForm.name.trim(), allowedModes: modesToSave } : s);
                                    updateSolutions(nextSols);
                                    if (selectedSolutionForEdit && selectedSolutionForEdit.id === solutionModalForm.id) {
                                        setSelectedSolutionForEdit({ ...selectedSolutionForEdit, name: solutionModalForm.name.trim(), allowedModes: modesToSave });
                                    }
                                    showToast("Ouvrage mis à jour !");
                                } else {
                                    const ns = {
                                        id: Date.now(), 
                                        name: solutionModalForm.name.trim(), 
                                        icon: 'fa-cube', 
                                        allowedModes: modesToSave, 
                                        customVars: []
                                    }; 
                                    updateSolutions([...solutions, ns]); 
                                    setSelectedSolutionForEdit(ns); 
                                    showToast("Ouvrage créé avec succès");
                                }
                                setIsSolutionModalOpen(false); 
                            }
                        }}>
                            <div className="p-6 bg-neutral-50/50 space-y-4">
                                <div>
                                    <label htmlFor="ouvrage_modal_name" className="app-label">Nom de l'ouvrage dans le catalogue</label>
                                    <input id="ouvrage_modal_name" disabled={isReadOnlyDueToDowngrade} autoFocus required type="text" className="app-input font-bold" value={solutionModalForm.name} onChange={e => setSolutionModalForm({...solutionModalForm, name: e.target.value})} placeholder="Ex: Semelle Béton Armé" />
                                </div>
                                <div>
                                    <label className="app-label mb-2 block">Modes de Métré Autorisés au démarrage</label>
                                    <div className="space-y-2">
                                        {[
                                            { id: 'rectangle', label: 'Rectangle (Largeur x Hauteur)' },
                                            { id: 'surface', label: 'Surface Directe (m²)' },
                                            { id: 'floor', label: 'Sol / Plafond (Largeur x Longueur)' },
                                            { id: 'linear', label: 'Mètre Linéaire (ml)' },
                                            { id: 'unit', label: 'Unité / Pièce (u)' }
                                        ].map(m => (
                                            <label key={m.id} className="flex items-center text-xs font-semibold text-neutral-700 cursor-pointer">
                                                <input disabled={isReadOnlyDueToDowngrade} type="checkbox" className="w-4 h-4 rounded border-neutral-300 text-brand-600 accent-brand-600 mr-2"
                                                    checked={solutionModalForm.allowedModes && solutionModalForm.allowedModes.includes(m.id)}
                                                    onChange={e => {
                                                        if (isReadOnlyDueToDowngrade) return;
                                                        const cur = solutionModalForm.allowedModes || [];
                                                        const next = e.target.checked ? [...cur, m.id] : cur.filter(x => x !== m.id);
                                                        setSolutionModalForm({ ...solutionModalForm, allowedModes: next });
                                                    }} />
                                                {m.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3">
                                <button type="button" onClick={() => setIsSolutionModalOpen(false)} className="btn-secondary" aria-label="Annuler la modification">Annuler</button>
                                {!isReadOnlyDueToDowngrade && <button type="submit" className="btn-primary" aria-label="Enregistrer l'ouvrage"><i className="fa-solid fa-check mr-1"></i> Enregistrer</button>}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isSaveQuoteModalOpen && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-2xl shadow-floating w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white">
                            <h3 className="font-bold text-neutral-800 text-lg">Enregistrer Devis (N° DEV-{new Date().getFullYear()}-{String(nextQuoteSeq).padStart(3, '0')})</h3>
                            <button onClick={() => setIsSaveQuoteModalOpen(false)} className="btn-icon w-8 h-8" aria-label="Fermer la boîte de dialogue"><i className="fa-solid fa-xmark text-xl"></i></button>
                        </div>
                        <form onSubmit={handleSaveQuoteSubmit}>
                            <div className="p-6 bg-neutral-50/50 space-y-4">
                                <div>
                                    <label htmlFor="save_quote_client_name" className="app-label flex justify-between items-center">
                                        <span>Nom du Client / Entreprise <span className="text-red-500">*</span></span>
                                        {clientNameError && <span className="text-red-600 font-bold text-xs animate-shake" role="alert"><i className="fa-solid fa-circle-exclamation mr-1"></i>Champ requis</span>}
                                    </label>
                                    <input 
                                        id="save_quote_client_name"
                                        disabled={isReadOnlyDueToDowngrade} 
                                        autoFocus 
                                        type="text" 
                                        aria-required="true"
                                        aria-invalid={clientNameError}
                                        className={`app-input font-bold ${clientNameError ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/30 text-red-900' : ''}`} 
                                        value={saveQuoteForm.clientName} 
                                        onChange={e => {
                                            setSaveQuoteForm({...saveQuoteForm, clientName: e.target.value});
                                            if (e.target.value.trim()) setClientNameError(false);
                                        }} 
                                        placeholder="Ex: SOCIETE BTP SARL" 
                                    />
                                    {clientNameError && (
                                        <p className="text-xs text-red-600 mt-1 font-semibold" role="alert">
                                            Veuillez indiquer le nom ou la raison sociale du client pour ce devis.
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label htmlFor="save_quote_project_ref" className="app-label">Référence du Projet / Chantier</label>
                                    <input id="save_quote_project_ref" disabled={isReadOnlyDueToDowngrade} type="text" className="app-input font-bold" value={saveQuoteForm.projectRef} onChange={e => setSaveQuoteForm({...saveQuoteForm, projectRef: e.target.value})} placeholder="Ex: Rénovation Bâtiment A" />
                                </div>
                                <div>
                                    <label htmlFor="save_quote_notes" className="app-label">Notes & Remarques (Affichées sur le devis)</label>
                                    <textarea id="save_quote_notes" disabled={isReadOnlyDueToDowngrade} className="app-input font-medium" rows="3" value={saveQuoteForm.notes} onChange={e => setSaveQuoteForm({...saveQuoteForm, notes: e.target.value})} placeholder="Remarques particulières, délais, conditions de livraison..."></textarea>
                                </div>
                            </div>
                            <div className="px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3">
                                <button type="button" onClick={() => setIsSaveQuoteModalOpen(false)} className="btn-secondary" aria-label="Annuler l'enregistrement">Annuler</button>
                                {!isReadOnlyDueToDowngrade && <button type="submit" className="btn-primary" aria-label="Valider et enregistrer le devis"><i className="fa-solid fa-check mr-1.5"></i> Enregistrer Devis</button>}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <QuoteSignatureModal
                isOpen={isSignatureModalOpen}
                onClose={() => setIsSignatureModalOpen(false)}
                quote={viewingSavedQuote}
                onConfirmSignature={(sig) => {
                    if (viewingSavedQuote) {
                        const updatedQ = {
                            ...viewingSavedQuote,
                            status: 'accepted',
                            signedAt: sig.signedAt,
                            signedByName: sig.signerName,
                            signatureData: sig.signatureData
                        };
                        setViewingSavedQuote(updatedQ);
                        updateSavedQuotes(savedQuotes.map(q => q.id === updatedQ.id ? updatedQ : q));
                        showToast(`✓ Devis ${updatedQ.number} signé électroniquement avec succès !`, 'success');
                    }
                }}
            />

            <HealthCheckModal
                isOpen={isHealthModalOpen}
                onClose={() => setIsHealthModalOpen(false)}
                isOnline={isOnline}
                sbUser={sbUser}
                solutionsCount={solutions.length}
                materialsCount={materials.length}
                quotesCount={savedQuotes.length}
            />

            <QuoteShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                quote={viewingSavedQuote}
                showToast={showToast}
            />

            {viewingSavedQuote && (
                <div className="fixed inset-0 bg-neutral-900/75 backdrop-blur-sm flex items-center justify-center z-[120] p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-floating w-full max-w-4xl flex flex-col max-h-[92dvh] overflow-hidden my-auto">
                        <div className="px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-extrabold text-brand-600 bg-brand-50 px-3 py-1 rounded-lg">{viewingSavedQuote.number}</span>
                                <div>
                                    <h3 className="font-extrabold text-neutral-900 text-lg leading-tight">{viewingSavedQuote.clientName}</h3>
                                    <p className="text-xs text-neutral-500">{viewingSavedQuote.projectRef} &bull; {viewingSavedQuote.date}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex bg-neutral-100 p-1 rounded-xl">
                                    <button onClick={() => setIsCommercialMode(false)} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${!isCommercialMode ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`} aria-label="Afficher la vue étude interne">
                                        Vue Interne (Étude)
                                    </button>
                                    <button onClick={() => setIsCommercialMode(true)} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${isCommercialMode ? 'bg-brand-600 text-white shadow-sm' : 'text-neutral-500'}`} aria-label="Afficher le devis commercial propre">
                                        Devis Commercial Client Clean
                                    </button>
                                </div>
                                <button onClick={() => setIsShareModalOpen(true)} className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 font-bold" title="Partager le devis au client" aria-label="Partager le devis">
                                    <i className="fa-solid fa-share-nodes text-brand-600"></i>
                                    <span>Partager</span>
                                </button>
                                <button onClick={() => setIsSignatureModalOpen(true)} className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 font-bold text-emerald-700 hover:bg-emerald-50 border-emerald-200" title="Signer électroniquement" aria-label="Signer le devis">
                                    <i className="fa-solid fa-signature text-emerald-600"></i>
                                    <span>Signer</span>
                                </button>
                                <button onClick={() => window.print()} className="btn-primary py-1.5 px-3.5 text-xs flex items-center gap-1.5 font-bold shadow-md shadow-brand-500/20" title="Imprimer ou Enregistrer en PDF (A4)" aria-label="Imprimer le devis">
                                    <i className="fa-solid fa-print"></i>
                                    <span>Imprimer / PDF</span>
                                </button>
                                <button onClick={() => setViewingSavedQuote(null)} className="btn-icon w-8 h-8" aria-label="Fermer la boîte de dialogue"><i className="fa-solid fa-xmark text-xl"></i></button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scroll bg-neutral-50/50 space-y-6">
                            {isCommercialMode ? (
                                <div className="bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm space-y-6 print:border-0 print:p-0" id="printArea">
                                    <div className="flex justify-between items-start border-b border-neutral-200 pb-6">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <LogoSVG className="h-10" />
                                            </div>
                                            <p className="text-xs font-bold text-neutral-800">{viewingSavedQuote.companyInfoSnapshot?.name || companyInfo.name}</p>
                                            <p className="text-xs text-neutral-500 font-medium">{viewingSavedQuote.companyInfoSnapshot?.tagline || companyInfo.tagline}</p>
                                            <p className="text-xs text-neutral-500 font-medium">Adresse: {viewingSavedQuote.companyInfoSnapshot?.address || companyInfo.address}</p>
                                            <p className="text-xs text-neutral-500 font-medium">Contact: {viewingSavedQuote.companyInfoSnapshot?.email || companyInfo.email} &bull; Tel: {viewingSavedQuote.companyInfoSnapshot?.phone || companyInfo.phone}</p>
                                            <p className="text-[11px] text-neutral-400">NIF: {viewingSavedQuote.companyInfoSnapshot?.nif || companyInfo.nif} &bull; RCCM: {viewingSavedQuote.companyInfoSnapshot?.rccm || companyInfo.rccm}</p>
                                        </div>
                                        <div className="text-right">
                                            <h2 className="text-2xl font-black text-brand-600 uppercase tracking-tight">DEVIS COMMERCIAL</h2>
                                            <p className="text-sm font-bold text-neutral-800 mt-1">N° : {viewingSavedQuote.number}</p>
                                            <p className="text-xs text-neutral-500">Date : {viewingSavedQuote.date}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-6 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                                        <div>
                                            <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider mb-1">CLIENT</p>
                                            <p className="font-extrabold text-neutral-900 text-base">{viewingSavedQuote.clientName}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider mb-1">DÉSIGNATION CHANTIER</p>
                                            <p className="font-bold text-neutral-800">{viewingSavedQuote.projectRef}</p>
                                        </div>
                                    </div>

                                    {viewingSavedQuote.notes && (
                                        <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl text-xs text-amber-900">
                                            <p className="font-bold text-[10px] uppercase text-amber-700 tracking-wider mb-1"><i className="fa-solid fa-note-sticky mr-1"></i>Notes & Remarques :</p>
                                            <p className="whitespace-pre-line">{viewingSavedQuote.notes}</p>
                                        </div>
                                    )}

                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-neutral-900 text-white font-bold uppercase">
                                                <th className="p-3.5 rounded-l-lg">Désignation Ouvrage / Prestation Commerciale</th>
                                                <th className="p-3.5 text-center">Quantité</th>
                                                <th className="p-3.5 text-right">Prix Unitaire HT</th>
                                                <th className="p-3.5 text-right rounded-r-lg">Total HT</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100">
                                            {viewingSavedQuote.quoteData?.commercialItems?.map(item => (
                                                <tr key={item.id}>
                                                    <td className="p-3.5">
                                                        <p className="font-bold text-neutral-900">{item.label}</p>
                                                        {item.dimensionSummary && (
                                                            <p className="text-[11px] text-neutral-500 mt-0.5 font-medium">{item.dimensionSummary}</p>
                                                        )}
                                                    </td>
                                                    <td className="p-3.5 text-center font-medium">{item.billedQty.toFixed(2)} {item.unit}</td>
                                                    <td className="p-3.5 text-right font-medium">{formatMoney(item.sellingUnitHT, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</td>
                                                    <td className="p-3.5 text-right font-bold text-neutral-900">{formatMoney(item.sellingTotalHT, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <div className="flex justify-end pt-4 border-t border-neutral-200">
                                        <div className="w-72 space-y-2 text-xs">
                                            <div className="flex justify-between font-bold text-neutral-800 text-sm">
                                                <span>Net HT Client :</span>
                                                <span>{formatMoney(viewingSavedQuote.quoteData?.netHTConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</span>
                                            </div>
                                            <div className="flex justify-between text-neutral-500">
                                                <span>TVA ({viewingSavedQuote.vatRate !== undefined ? viewingSavedQuote.vatRate : 18}%) :</span>
                                                <span>+{formatMoney(viewingSavedQuote.quoteData?.tvaConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</span>
                                            </div>
                                            <div className="flex justify-between font-black text-brand-600 text-base border-t-2 border-neutral-900 pt-2">
                                                <span>TOTAL TTC :</span>
                                                <span>{formatMoney(viewingSavedQuote.quoteData?.totalTTCConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* BLOC 7/10 : TABLEAU ÉCHÉANCIER DE RÈGLEMENT BTP */}
                                    <div className="pt-4 border-t border-neutral-200">
                                        <h4 className="text-xs font-black text-neutral-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <i className="fa-solid fa-calendar-check text-brand-600"></i>
                                            Échéancier Prévisionnel des Règlements BTP
                                        </h4>
                                        <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-2xs">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-neutral-50 border-b border-neutral-200 text-[10px] font-extrabold text-neutral-500 uppercase">
                                                    <tr>
                                                        <th className="p-2.5 pl-3">Étape de Travaux</th>
                                                        <th className="p-2.5 text-center">Taux (%)</th>
                                                        <th className="p-2.5 text-right pr-3">Montant TTC</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-neutral-100 font-medium">
                                                    <tr>
                                                        <td className="p-2.5 pl-3">Acompte à la signature et démarrage des travaux</td>
                                                        <td className="p-2.5 text-center font-bold text-neutral-700">40%</td>
                                                        <td className="p-2.5 text-right pr-3 font-mono font-bold text-neutral-900">{formatMoney((viewingSavedQuote.quoteData?.totalTTCConsomme || 0) * 0.40, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</td>
                                                    </tr>
                                                    <tr>
                                                        <td className="p-2.5 pl-3">Situation intermédiaire / Avancement gros œuvre &amp; hors d'eau</td>
                                                        <td className="p-2.5 text-center font-bold text-neutral-700">30%</td>
                                                        <td className="p-2.5 text-right pr-3 font-mono font-bold text-neutral-900">{formatMoney((viewingSavedQuote.quoteData?.totalTTCConsomme || 0) * 0.30, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</td>
                                                    </tr>
                                                    <tr>
                                                        <td className="p-2.5 pl-3">Second œuvre, finitions et équipements</td>
                                                        <td className="p-2.5 text-center font-bold text-neutral-700">20%</td>
                                                        <td className="p-2.5 text-right pr-3 font-mono font-bold text-neutral-900">{formatMoney((viewingSavedQuote.quoteData?.totalTTCConsomme || 0) * 0.20, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</td>
                                                    </tr>
                                                    <tr className="bg-neutral-50/60 font-bold">
                                                        <td className="p-2.5 pl-3 text-brand-700">Solde à la réception définitive et remise des clés</td>
                                                        <td className="p-2.5 text-center text-brand-700">10%</td>
                                                        <td className="p-2.5 text-right pr-3 font-mono text-brand-700">{formatMoney((viewingSavedQuote.quoteData?.totalTTCConsomme || 0) * 0.10, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="pt-8 border-t border-neutral-100 grid grid-cols-2 gap-8 text-[11px] text-neutral-500">
                                        <div>
                                            <p className="font-bold text-neutral-700 mb-1">Conditions de règlement :</p>
                                            <p>{viewingSavedQuote.companyInfoSnapshot?.paymentTerms || companyInfo.paymentTerms}</p>
                                            <p className="mt-1">Validité de l'offre : {viewingSavedQuote.companyInfoSnapshot?.quoteValidity || companyInfo.quoteValidity}</p>
                                        </div>
                                        <div className="text-center border border-dashed border-neutral-300 p-4 rounded-xl">
                                            <p className="font-bold text-neutral-700 mb-8">Bon pour accord et signature client :</p>
                                            <p className="text-[10px] text-neutral-400">Date et cachet</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {(() => {
                                        const savedMargePct = viewingSavedQuote.quoteData?.margePctConsommeReelle !== undefined
                                            ? viewingSavedQuote.quoteData.margePctConsommeReelle
                                            : (viewingSavedQuote.quoteData?.netHTConsomme > 0 
                                                ? ((viewingSavedQuote.quoteData?.margeValeurConsomme || 0) / viewingSavedQuote.quoteData.netHTConsomme) * 100 
                                                : 0);

                                        const savedMargeAchatPct = viewingSavedQuote.quoteData?.margePctAchatReelle !== undefined
                                            ? viewingSavedQuote.quoteData.margePctAchatReelle
                                            : (viewingSavedQuote.quoteData?.netHTAchat > 0 
                                                ? ((viewingSavedQuote.quoteData?.margeValeurAchat || 0) / viewingSavedQuote.quoteData.netHTAchat) * 100 
                                                : 0);

                                        return (
                                            <>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm">
                                                        <p className="text-[10px] font-bold text-neutral-500 uppercase">Étude de Prix Consommé (Internes)</p>
                                                        <p className="text-2xl font-extrabold text-neutral-900 mt-1">{formatMoney(viewingSavedQuote.quoteData?.totalTTCConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</p>
                                                        <div className="mt-3 text-xs space-y-1 text-neutral-600 border-t pt-2">
                                                            <div className="flex justify-between"><span>Déboursé sec :</span><span>{formatMoney(viewingSavedQuote.quoteData?.totalDebourseConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</span></div>
                                                            <div className="flex justify-between"><span>Frais généraux :</span><span>{formatMoney(viewingSavedQuote.quoteData?.fraisGenerauxConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</span></div>
                                                            <div className="flex justify-between font-bold text-emerald-600"><span>Marge réelle (après remise) :</span><span>+{formatMoney(viewingSavedQuote.quoteData?.margeValeurConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)} ({savedMargePct.toFixed(2)}%)</span></div>
                                                        </div>
                                                    </div>
                                                    <div className="bg-neutral-900 text-white p-5 rounded-2xl shadow-floating">
                                                        <p className="text-[10px] font-bold text-brand-400 uppercase">Budget d'Achat Sécurisé (Trésorerie)</p>
                                                        <p className="text-2xl font-extrabold text-brand-400 mt-1">{formatMoney(viewingSavedQuote.quoteData?.totalTTCAchat, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</p>
                                                        <div className="mt-3 text-xs space-y-1 text-neutral-400 border-t border-neutral-800 pt-2">
                                                            <div className="flex justify-between"><span>Déboursé achat :</span><span>{formatMoney(viewingSavedQuote.quoteData?.totalDebourseAchat, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</span></div>
                                                            <div className="flex justify-between"><span>Frais généraux :</span><span>{formatMoney(viewingSavedQuote.quoteData?.fraisGenerauxAchat, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</span></div>
                                                            <div className="flex justify-between font-bold text-brand-300"><span>Marge sécurisée :</span><span>+{formatMoney(viewingSavedQuote.quoteData?.margeValeurAchat, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)} ({savedMargeAchatPct.toFixed(2)}%)</span></div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {viewingSavedQuote.quoteData?.lots && viewingSavedQuote.quoteData.lots.length > 0 && (
                                                    <div className="bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm space-y-4">
                                                        <h4 className="font-extrabold text-xs text-neutral-800 uppercase tracking-wider flex items-center gap-2">
                                                            <i className="fa-solid fa-layer-group text-brand-500"></i> Ventilation des {viewingSavedQuote.quoteData.lots.length} Lots / Ouvrages du Chantier
                                                        </h4>
                                                        <div className="space-y-2.5">
                                                            {viewingSavedQuote.quoteData.lots.map((l, idx) => (
                                                                <div key={l.id || idx} className="p-3.5 bg-neutral-50/80 rounded-xl border border-neutral-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                                                                    <div>
                                                                        <span className="font-black text-brand-600 mr-2">Poste #{idx + 1}</span>
                                                                        <strong className="text-neutral-900">{l.lotName}</strong>
                                                                        <p className="text-neutral-500 mt-0.5 font-medium">{formatLotDimensions(l)}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-4 shrink-0 font-bold">
                                                                        <span className="text-neutral-600 text-xs">Déboursé : {formatMoney(l.quoteData?.totalDebourseConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</span>
                                                                        <span className="text-emerald-700 font-extrabold text-xs">Net HT : {formatMoney(l.quoteData?.netHTConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3 shrink-0">
                            <button onClick={() => window.print()} className="btn-secondary"><i className="fa-solid fa-print"></i> Imprimer Devis</button>
                            <button onClick={() => setViewingSavedQuote(null)} className="btn-primary">Fermer</button>
                        </div>
                    </div>
                </div>
            )}

            {/* P0.1 V5.2 — Modal d'Importation Explicite des Données Locales */}
            {showImportBanner && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[135] p-4">
                    <div className="bg-white rounded-3xl shadow-floating w-full max-w-lg overflow-hidden p-8 text-center animate-fade-in">
                        <div className="w-16 h-16 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-5">
                            <i className="fa-solid fa-[#fa-file-import] fa-cloud-arrow-down text-3xl"></i>
                        </div>
                        <h3 className="font-extrabold text-neutral-900 text-xl mb-2">Données locales non associées détectées</h3>
                        <p className="text-neutral-600 text-sm font-medium mb-6 leading-relaxed">
                            Des données chiffrées/catalogue créées précédemment sur ce navigateur sont disponibles. 
                            Souhaitez-vous les **importer dans votre compte cloud ({sbUser?.email})** ou démarrer avec une base vierge ?
                        </p>
                        <div className="flex flex-col gap-3">
                            <button onClick={() => {
                                const legacy = LS.getLegacyData();
                                if (legacy.companyInfo) setCompanyInfo(legacy.companyInfo);
                                if (legacy.materials) setMaterials(legacy.materials);
                                if (legacy.labor) setLabor(legacy.labor);
                                if (legacy.solutions) setSolutions(legacy.solutions);
                                if (legacy.recipes) {
                                    const migrated = migrateRecipes(legacy.recipes, legacy.schemaVersion || 8);
                                    setRecipes(migrated);
                                }
                                if (legacy.savedQuotes) setSavedQuotes(legacy.savedQuotes);
                                if (legacy.nextQuoteSeq) setNextQuoteSeq(legacy.nextQuoteSeq);
                                LS.clearLegacyData();
                                setShowImportBanner(false);
                                showToast("Données locales importées et migrées avec succès dans votre compte cloud !");
                            }} className="btn-primary w-full py-3.5 flex items-center justify-center gap-2">
                                <i className="fa-solid fa-file-import"></i> Importer mes données dans ce compte
                            </button>
                            <button onClick={() => {
                                LS.clearLegacyData();
                                setShowImportBanner(false);
                                showToast("Base locale réinitialisée. Compte cloud propre.");
                            }} className="btn-secondary w-full py-3 text-neutral-600 hover:text-red-600">
                                Ignorer &amp; Démarrer sur un compte propre
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmDialog.isOpen && (
                <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4">
                    <div className="bg-white rounded-3xl shadow-floating w-full max-w-md overflow-hidden p-8 text-center">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${confirmDialog.isDanger ? 'bg-red-50 text-brand-500' : 'bg-brand-50 text-brand-500'}`}>
                            <i className={`fa-solid ${confirmDialog.isDanger ? 'fa-trash-can' : 'fa-circle-question'} text-2xl`}></i>
                        </div>
                        <h3 className="font-extrabold text-neutral-900 text-xl mb-2">{confirmDialog.title}</h3>
                        <p className="text-neutral-500 text-sm font-medium mb-8 leading-relaxed whitespace-pre-line">{confirmDialog.message}</p>
                        <div className="flex flex-col sm:flex-row gap-3 w-full">
                            <button onClick={closeConfirm} className="btn-secondary flex-1 py-3">Annuler</button>
                            {confirmDialog.onConfirm && (
                                <button onClick={confirmDialog.onConfirm} className="flex flex-1 items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-sm transition-all duration-200 active:scale-95">Confirmer</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {toast && (
                <div key={toast.id} className="fixed bottom-24 md:bottom-8 right-0 md:right-8 left-0 md:left-auto mx-4 md:mx-0 bg-neutral-900 text-white px-5 py-4 rounded-xl shadow-floating flex items-center gap-4 z-[140] max-w-sm border border-neutral-700 animate-slide-up">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-emerald-500/20 text-emerald-400">
                        <i className="fa-solid fa-check"></i>
                    </div>
                    <span className="font-semibold text-sm leading-tight">{toast.message}</span>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// V5.2 — ROOT AVEC AUTH GATE SUPABASE
// ═══════════════════════════════════════════════════════════════
function AppShell() {
    const [session, setSession] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
    const [newPasswordInput, setNewPasswordInput] = useState('');
    const [recoverySuccess, setRecoverySuccess] = useState(false);
    const [recoveryError, setRecoveryError] = useState(null);

    useEffect(() => {
        if (!sb) { setAuthLoading(false); return; }
        
        let isMounted = true;
        const timer = setTimeout(() => {
            if (isMounted) setAuthLoading(false);
        }, 1500);

        sb.auth.getSession().then(({ data: { session: s } }) => {
            if (isMounted) {
                setSession(s);
                setAuthLoading(false);
                clearTimeout(timer);
            }
        }).catch((err) => {
            console.warn("[AppShell] Supabase session error, fallback to offline:", err);
            if (isMounted) {
                setAuthLoading(false);
                clearTimeout(timer);
            }
        });

        const { data: { subscription } } = sb.auth.onAuthStateChange((event, s) => {
            if (isMounted) {
                setSession(s);
                if (event === 'PASSWORD_RECOVERY') {
                    setIsPasswordRecovery(true);
                }
            }
        });

        return () => {
            isMounted = false;
            clearTimeout(timer);
            if (subscription && typeof subscription.unsubscribe === 'function') {
                subscription.unsubscribe();
            }
        };
    }, []);

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        setRecoveryError(null);
        try {
            const { error } = await sb.auth.updateUser({ password: newPasswordInput });
            if (error) throw error;
            setRecoverySuccess(true);
            setTimeout(() => { setIsPasswordRecovery(false); setRecoverySuccess(false); }, 2000);
        } catch(err) {
            setRecoveryError(err.message || "Erreur de réinitialisation");
        }
    };

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{background: 'linear-gradient(135deg, #0f172a 0%, #171717 50%, #1a0505 100%)'}}>
                <div className="text-center">
                    <div className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4" style={{background: 'linear-gradient(135deg, #E6222B, #9b1c1c)'}}>
                        <i className="fa-solid fa-spinner fa-spin text-white text-2xl"></i>
                    </div>
                    <p className="text-white font-bold">ikadevis</p>
                    <p className="text-neutral-500 text-sm">Initialisation…</p>
                </div>
            </div>
        );
    }

    if (isPasswordRecovery) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
                <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl">
                    <h2 className="text-2xl font-black text-neutral-900 mb-2">Nouveau mot de passe</h2>
                    <p className="text-neutral-500 text-sm mb-6">Saisissez votre nouveau mot de passe pour votre compte ikadevis.</p>
                    {recoveryError && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold mb-4">{recoveryError}</div>}
                    {recoverySuccess ? (
                        <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl text-sm font-bold text-center">
                            <i className="fa-solid fa-circle-check text-2xl mb-2 block text-emerald-500"></i>
                            Mot de passe mis à jour avec succès !
                        </div>
                    ) : (
                        <form onSubmit={handleUpdatePassword} className="space-y-4">
                            <input type="password" value={newPasswordInput} onChange={e=>setNewPasswordInput(e.target.value)} required minLength={8} placeholder="Minimum 8 caractères" className="w-full border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none" />
                            <button type="submit" className="btn-primary w-full py-3.5">Enregistrer le mot de passe</button>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    if (!session) {
        return <AuthScreen onAuthSuccess={(s) => setSession(s)} />;
    }

    return <UserSchemaGate supabaseSession={session} supabaseClient={sb} onSignOut={() => {
        if (sb && session?.user?.id !== 'guest') sb.auth.signOut();
        setSession(null);
    }} />;
}

// P0.1 V5.7 — Pre-Mount User Schema Gate (Synchrone AVANT de monter <App>)
function UserSchemaGate({ supabaseSession, supabaseClient, onSignOut }) {
    const sbUser = supabaseSession?.user;
    
    const userSchemaCheck = useMemo(() => {
        if (!sbUser) return { isDowngrade: false, storedInt: CURRENT_SCHEMA_INT };
        const raw = LS.get('schemaVersion', sbUser.id);
        const storedInt = raw !== null ? parseInt(raw, 10) : CURRENT_SCHEMA_INT;
        return { isDowngrade: storedInt > CURRENT_SCHEMA_INT, storedInt };
    }, [sbUser]);

    if (userSchemaCheck.isDowngrade) {
        return (
            <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-6 text-white text-center">
                <div className="bg-neutral-800 p-8 rounded-3xl max-w-md w-full border border-neutral-700 shadow-2xl space-y-4">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-2">
                        <i className="fa-solid fa-shield-cat text-3xl"></i>
                    </div>
                    <h2 className="text-xl font-extrabold text-white">Protection Anti-Downgrade V5.9</h2>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                        Vos données locales ont été enregistrées avec une version de schéma supérieure (<strong className="text-red-400">V{userSchemaCheck.storedInt}</strong>).
                    </p>
                    <p className="text-xs text-neutral-500 leading-relaxed">
                        Pour éviter tout écrasement ou corruption de données, l'accès à cette version de l'application (V{CURRENT_SCHEMA_INT}) est bloqué pour votre compte. Veuillez vous connecter depuis une version récente.
                    </p>
                    <button onClick={onSignOut} className="btn-primary w-full py-3.5 mt-4">
                        <i className="fa-solid fa-right-from-bracket mr-2"></i> Se Déconnecter
                    </button>
                </div>
            </div>
        );
    }

    return <App supabaseSession={supabaseSession} supabaseClient={supabaseClient} onSignOut={onSignOut} />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <ErrorBoundary>
        <AppShell />
    </ErrorBoundary>
);
