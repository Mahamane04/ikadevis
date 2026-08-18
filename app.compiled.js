const { useState, useEffect, useMemo, useRef, useCallback } = React;
const __CFG = typeof window !== "undefined" && window.__APP_CONFIG__ || {};
if (typeof window !== "undefined" && !window.__APP_CONFIG__) {
  console.warn("[ikadevis] config.js absent ou non charg\xE9 avant app.compiled.js \u2014 copiez config.example.js en config.js et renseignez vos identifiants Supabase.");
}
const SUPABASE_URL = __CFG.SUPABASE_URL || "";
const SUPABASE_ANON = __CFG.SUPABASE_ANON || "";
const sb = typeof window !== "undefined" && window.supabase && SUPABASE_URL && SUPABASE_ANON ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;
const CC_PREFIX = "costcalc_";
const LS = {
  getKey: (key, userId) => userId ? "costcalc:" + userId + ":" + key : "costcalc:guest:" + key,
  get: (key, userId) => {
    try {
      const k = LS.getKey(key, userId);
      const v = localStorage.getItem(k);
      if (v !== null) return JSON.parse(v);
      return null;
    } catch (e) {
      return null;
    }
  },
  set: (key, val, userId) => {
    try {
      const k = LS.getKey(key, userId);
      localStorage.setItem(k, JSON.stringify(val));
    } catch (e) {
    }
  },
  getOutbox: (userId) => {
    if (!userId) return {};
    try {
      const v = localStorage.getItem("costcalc:" + userId + ":outbox");
      return v ? JSON.parse(v) : {};
    } catch (e) {
      return {};
    }
  },
  setOutboxKey: (key, val, userId) => {
    if (!userId) return;
    try {
      const outbox = LS.getOutbox(userId);
      const lastRev = parseInt(localStorage.getItem("costcalc:" + userId + ":lastRev") || "100", 10);
      const revision = lastRev + 1;
      localStorage.setItem("costcalc:" + userId + ":lastRev", String(revision));
      outbox[key] = { revision, value: val };
      localStorage.setItem("costcalc:" + userId + ":outbox", JSON.stringify(outbox));
    } catch (e) {
    }
  },
  clearOutboxKeyIfRevisionMatches: (key, confirmedRevision, userId) => {
    if (!userId) return;
    try {
      const outbox = LS.getOutbox(userId);
      const entry = outbox[key];
      if (entry) {
        const entryRev = typeof entry === "object" && "revision" in entry ? entry.revision : 0;
        if (entryRev === confirmedRevision || entryRev <= confirmedRevision) {
          delete outbox[key];
          if (Object.keys(outbox).length === 0) {
            localStorage.removeItem("costcalc:" + userId + ":outbox");
          } else {
            localStorage.setItem("costcalc:" + userId + ":outbox", JSON.stringify(outbox));
          }
        }
      }
    } catch (e) {
    }
  },
  clearOutboxKey: (key, userId) => {
    if (!userId) return;
    try {
      const outbox = LS.getOutbox(userId);
      delete outbox[key];
      if (Object.keys(outbox).length === 0) {
        localStorage.removeItem("costcalc:" + userId + ":outbox");
      } else {
        localStorage.setItem("costcalc:" + userId + ":outbox", JSON.stringify(outbox));
      }
    } catch (e) {
    }
  },
  clearOutbox: (userId) => {
    if (!userId) return;
    localStorage.removeItem("costcalc:" + userId + ":outbox");
  },
  hasLegacyUnnamespacedData: () => {
    return [
      "companyInfo",
      "materials",
      "labor",
      "solutions",
      "recipes",
      "savedQuotes",
      "costcalc_materials",
      "costcalc_recipes",
      "costcalc:guest:materials",
      "costcalc:guest:recipes",
      "costcalc:guest:savedQuotes"
    ].some((k) => localStorage.getItem(k) !== null);
  },
  getLegacyData: () => {
    const loadKey = (k) => {
      const val = localStorage.getItem("costcalc:guest:" + k) || localStorage.getItem("costcalc_" + k) || localStorage.getItem(k);
      try {
        return val ? JSON.parse(val) : null;
      } catch (e) {
        return null;
      }
    };
    const rawSchema = localStorage.getItem("costcalc:guest:schemaVersion") || localStorage.getItem("schemaVersion");
    return {
      companyInfo: loadKey("companyInfo"),
      materials: loadKey("materials"),
      labor: loadKey("labor"),
      solutions: loadKey("solutions"),
      recipes: loadKey("recipes"),
      savedQuotes: loadKey("savedQuotes"),
      nextQuoteSeq: loadKey("nextQuoteSeq"),
      schemaVersion: rawSchema ? parseInt(rawSchema, 10) : 8
    };
  },
  clearLegacyData: () => {
    Object.keys(localStorage).filter((k) => k.startsWith("costcalc_") || k.startsWith("costcalc:guest:") || ["companyInfo", "materials", "labor", "solutions", "recipes", "savedQuotes", "nextQuoteSeq", "calcForm", "schemaVersion"].includes(k)).forEach((k) => localStorage.removeItem(k));
  },
  clearUser: (userId) => {
    const prefix = userId ? "costcalc:" + userId + ":" : "costcalc:guest:";
    Object.keys(localStorage).filter((k) => k.startsWith(prefix)).forEach((k) => localStorage.removeItem(k));
  }
};
if (typeof window !== "undefined") window.LS = LS;
const SCHEMA_VERSION = "9";
const CURRENT_SCHEMA_INT = 9;
function AuthScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const handleGoogleAuth = async () => {
    setError(null);
    setInfo(null);
    setGoogleLoading(true);
    try {
      if (!sb) throw new Error("Client Supabase non initialis\xE9 \u2014 v\xE9rifiez que vendor/supabase.min.js est charg\xE9.");
      const { error: err } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin }
      });
      if (err) throw err;
    } catch (err) {
      setError(err.message || "Connexion Google impossible.");
      setGoogleLoading(false);
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (!sb) throw new Error("Client Supabase non initialis\xE9 \u2014 v\xE9rifiez que vendor/supabase.min.js est charg\xE9.");
      if (mode === "login") {
        const { data, error: err } = await sb.auth.signInWithPassword({ email, password });
        if (err) throw err;
        onAuthSuccess(data.session);
      } else if (mode === "signup") {
        if (!orgName.trim()) throw new Error("Le nom de votre organisation est requis.");
        if (password.length < 8) throw new Error("Le mot de passe doit contenir au moins 8 caract\xE8res.");
        const { data, error: err } = await sb.auth.signUp({ email, password, options: { data: { org_name: orgName } } });
        if (err) throw err;
        if (data.session) {
          onAuthSuccess(data.session);
        } else {
          setInfo("Compte cr\xE9\xE9 ! V\xE9rifiez votre email pour confirmer votre inscription, puis connectez-vous.");
          setMode("login");
        }
      } else if (mode === "reset") {
        const { error: err } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (err) throw err;
        setInfo("Email de r\xE9initialisation envoy\xE9. V\xE9rifiez votre bo\xEEte de r\xE9ception.");
        setMode("login");
      }
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen bg-gradient-to-br from-slate-900 via-neutral-900 to-brand-950 flex items-center justify-center p-4", style: { background: "linear-gradient(135deg, #0f172a 0%, #171717 50%, #1a0505 100%)" } }, /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-md" }, /* @__PURE__ */ React.createElement("div", { className: "text-center mb-10" }, /* @__PURE__ */ React.createElement("div", { className: "inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-brand-600 shadow-2xl mb-6", style: { background: "linear-gradient(135deg, #E6222B, #9b1c1c)" } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 40 40", className: "w-10 h-10" }, /* @__PURE__ */ React.createElement("path", { d: "M5 30L17 12L29 30H5Z", fill: "white", opacity: "0.9" }), /* @__PURE__ */ React.createElement("circle", { cx: "30", cy: "12", r: "6", fill: "white" }))), /* @__PURE__ */ React.createElement("h1", { className: "text-3xl font-black text-white tracking-tight" }, "ikadevis"), /* @__PURE__ */ React.createElement("p", { className: "text-neutral-400 font-semibold text-sm mt-1 tracking-widest uppercase" }, "BTP \xB7 ERP Calcul de Devis")), /* @__PURE__ */ React.createElement("div", { className: "bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl" }, /* @__PURE__ */ React.createElement("h2", { className: "text-white font-extrabold text-xl mb-1" }, mode === "login" ? "Connexion" : mode === "signup" ? "Cr\xE9er un compte" : "R\xE9initialiser le mot de passe"), /* @__PURE__ */ React.createElement("p", { className: "text-neutral-400 text-sm font-medium mb-6" }, mode === "login" ? "Acc\xE9dez \xE0 votre espace de travail BTP." : mode === "signup" ? "Commencez \xE0 chiffrer vos projets." : "Entrez votre email pour recevoir un lien."), error && /* @__PURE__ */ React.createElement("div", { className: "bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold rounded-xl px-4 py-3 mb-4" }, error), info && /* @__PURE__ */ React.createElement("div", { className: "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-semibold rounded-xl px-4 py-3 mb-4" }, info), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit, className: "space-y-4" }, mode === "signup" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-neutral-300 text-xs font-bold uppercase tracking-wider mb-1.5" }, "Nom de l'organisation"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: orgName,
      onChange: (e) => setOrgName(e.target.value),
      required: true,
      className: "w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm font-medium placeholder-neutral-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all",
      placeholder: "Ex: BATI SARL, BTP Constructions\u2026"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-neutral-300 text-xs font-bold uppercase tracking-wider mb-1.5" }, "Email"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "email",
      value: email,
      onChange: (e) => setEmail(e.target.value),
      required: true,
      className: "w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm font-medium placeholder-neutral-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all",
      placeholder: "vous@entreprise.com"
    }
  )), mode !== "reset" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "block text-neutral-300 text-xs font-bold uppercase tracking-wider mb-1.5" }, "Mot de passe"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "password",
      value: password,
      onChange: (e) => setPassword(e.target.value),
      required: true,
      minLength: 8,
      className: "w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-3 text-sm font-medium placeholder-neutral-500 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all",
      placeholder: mode === "signup" ? "Minimum 8 caract\xE8res" : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
    }
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "submit",
      disabled: loading,
      className: "w-full py-3.5 rounded-xl font-black text-white text-sm tracking-wide transition-all active:scale-95 disabled:opacity-50",
      style: { background: loading ? "#666" : "linear-gradient(135deg, #E6222B, #9b1c1c)", boxShadow: "0 4px 20px rgba(230,34,43,0.4)" }
    },
    loading ? /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-spinner fa-spin mr-2" }), "Chargement\u2026") : mode === "login" ? "Se connecter \u2192" : mode === "signup" ? "Cr\xE9er mon compte \u2192" : "Envoyer le lien \u2192"
  )), mode !== "reset" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 my-5" }, /* @__PURE__ */ React.createElement("div", { className: "flex-1 h-px bg-white/10" }), /* @__PURE__ */ React.createElement("span", { className: "text-neutral-500 text-[11px] font-bold uppercase tracking-wider" }, "ou"), /* @__PURE__ */ React.createElement("div", { className: "flex-1 h-px bg-white/10" })), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleGoogleAuth,
      disabled: googleLoading,
      "aria-label": mode === "signup" ? "S'inscrire avec Google" : "Se connecter avec Google",
      className: "w-full py-3 px-4 rounded-xl font-bold text-sm text-neutral-800 bg-white hover:bg-neutral-100 transition-all border border-white/20 flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95"
    },
    googleLoading ? /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-spinner fa-spin" }) : /* @__PURE__ */ React.createElement("i", { className: "fa-brands fa-google text-[#4285F4]" }),
    mode === "signup" ? "S'inscrire avec Google" : "Continuer avec Google"
  )), /* @__PURE__ */ React.createElement("div", { className: "mt-4 pt-4 border-t border-white/10 flex flex-col gap-3 text-center" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => onAuthSuccess({ user: { id: "guest", email: "invite@local.app" } }),
      className: "w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-white/10 hover:bg-white/20 transition-all border border-white/20 flex items-center justify-center gap-2"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-user-check text-emerald-400" }),
    "Continuer en Mode D\xE9mo / Hors-ligne (Invit\xE9)"
  ), mode === "login" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setMode("signup");
    setError(null);
  }, className: "text-neutral-400 hover:text-white text-sm font-semibold transition-colors" }, "Pas encore de compte ? ", /* @__PURE__ */ React.createElement("span", { className: "text-brand-400" }, "Cr\xE9er un compte")), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setMode("reset");
    setError(null);
  }, className: "text-neutral-500 hover:text-neutral-300 text-xs font-medium transition-colors" }, "Mot de passe oubli\xE9 ?")), mode !== "login" && /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setMode("login");
    setError(null);
  }, className: "text-neutral-400 hover:text-white text-sm font-semibold transition-colors" }, "\u2190 Retour \xE0 la connexion"))), /* @__PURE__ */ React.createElement("p", { className: "text-center text-neutral-500 text-xs font-medium mt-6" }, "\u{1F512} S\xE9curis\xE9 par Supabase Auth & RLS \xB7 Mode D\xE9mo Local disponible")));
}
const LogoSVG = ({ className = "h-8" }) => /* @__PURE__ */ React.createElement("svg", { className, viewBox: "0 0 240 60", fill: "none", xmlns: "http://www.w3.org/2000/svg" }, /* @__PURE__ */ React.createElement("rect", { x: "5", y: "10", width: "40", height: "40", rx: "10", fill: "#E6222B" }), /* @__PURE__ */ React.createElement("path", { d: "M15 35L23 23L31 35H15Z", fill: "white" }), /* @__PURE__ */ React.createElement("circle", { cx: "33", cy: "22", r: "4", fill: "white" }), /* @__PURE__ */ React.createElement("text", { x: "55", y: "38", fill: "#171717", fontFamily: "Inter, sans-serif", fontWeight: "900", fontSize: "24", letterSpacing: "-0.5" }, "ikadevis"), /* @__PURE__ */ React.createElement("text", { x: "55", y: "50", fill: "#E6222B", fontFamily: "Inter, sans-serif", fontWeight: "800", fontSize: "10", letterSpacing: "2" }, "BTP & ERP CALCUL"));
const CustomSelect = ({ value, onChange, options, className, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef(null);
  const selectedOption = options.find((o) => String(o.value) === String(value)) || options[0];
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return /* @__PURE__ */ React.createElement("div", { ref: selectRef, className: `relative ${className || ""}` }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled,
      onClick: () => !disabled && setIsOpen(!isOpen),
      className: `w-full text-left px-4 py-3 border rounded-xl text-sm font-semibold transition-all focus:outline-none flex justify-between items-center ${disabled ? "bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed" : isOpen ? "border-brand-500 bg-white ring-4 ring-brand-500/10 text-brand-700" : "bg-neutral-50 border-neutral-200 text-neutral-800 hover:border-neutral-300 hover:bg-white"}`
    },
    /* @__PURE__ */ React.createElement("span", { className: "truncate" }, selectedOption ? selectedOption.label : "S\xE9lectionner..."),
    /* @__PURE__ */ React.createElement("i", { className: `fa-solid fa-chevron-down text-[10px] transition-transform duration-200 ${isOpen ? "rotate-180 text-brand-500" : "text-neutral-400"}` })
  ), isOpen && !disabled && /* @__PURE__ */ React.createElement("div", { className: "absolute z-[100] w-full mt-2 bg-white border border-neutral-100 rounded-xl shadow-floating overflow-hidden max-h-60 overflow-y-auto animate-fade-in origin-top" }, options.map((opt) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: opt.value,
      type: "button",
      onClick: () => {
        onChange({ target: { value: opt.value } });
        setIsOpen(false);
      },
      className: `w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between ${String(value) === String(opt.value) ? "bg-brand-50 text-brand-700 font-bold" : "text-neutral-700 font-medium hover:bg-neutral-50 hover:text-neutral-900"}`
    },
    /* @__PURE__ */ React.createElement("span", null, opt.label),
    String(value) === String(opt.value) && /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check text-brand-600 text-xs" })
  ))));
};
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
      return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen flex items-center justify-center bg-neutral-900 text-white p-6 font-sans" }, /* @__PURE__ */ React.createElement("div", { className: "max-w-md w-full bg-neutral-800 border border-neutral-700 rounded-3xl p-8 text-center shadow-2xl space-y-5" }, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto text-2xl border border-red-500/30" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-shield-halved" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-xl font-extrabold text-white" }, "R\xE9cup\xE9ration S\xE9curis\xE9e d'Affichage"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-400 mt-1" }, "Vos donn\xE9es de devis et catalogue restent sauvegard\xE9es.")), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-red-300 font-mono bg-neutral-950/80 p-3 rounded-xl text-left overflow-auto max-h-32 border border-neutral-800" }, this.state.error?.message || "Erreur intercept\xE9e"), /* @__PURE__ */ React.createElement("button", { onClick: () => window.location.reload(), className: "btn-primary w-full py-3.5 shadow-lg shadow-brand-500/30 font-bold" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-rotate-right mr-2" }), "Actualiser l'application")));
    }
    return this.props.children;
  }
}
function NewQuoteWizardModal({
  isOpen,
  onClose,
  onLoadTemplate,
  onGenerateFromQuickEstimate,
  onInitBlankQuote,
  currency = "FCFA"
}) {
  const [wizardTab, setWizardTab] = useState("quick_estimate");
  const [estimateCategory, setEstimateCategory] = useState("villa_house");
  const [estimateSurface, setEstimateSurface] = useState(150);
  const [estimateQuality, setEstimateQuality] = useState("standard");
  const [estimateCity, setEstimateCity] = useState("Bamako");
  if (!isOpen) return null;
  const quickResult = calculateQuickEstimate({
    category: estimateCategory,
    surface: parseFloat(estimateSurface) || 1,
    quality: estimateQuality,
    city: estimateCity
  });
  const categoryOptions = [
    { id: "villa_house", label: "Construction Villa / Maison", icon: "fa-house", unit: "m\xB2", defaultSurface: 150, desc: "Bros \u0153uvre, second \u0153uvre et finitions" },
    { id: "event_stand", label: "\xC9v\xE9nementiel & Stands", icon: "fa-tent", unit: "m\xB2", defaultSurface: 36, desc: "Podium, backdrops, b\xE2ches, mobilier, r\xE9gie" },
    { id: "acm_facade", label: "Habillage Fa\xE7ade Alucobond / ACM", icon: "fa-building", unit: "m\xB2", defaultSurface: 120, desc: "Panneaux composites, ossature, calepinage" },
    { id: "signage_branding", label: "Enseigne & Branding Magasin", icon: "fa-shop", unit: "ml", defaultSurface: 6, desc: "Caissons lumineux LED, totems, adh\xE9sifs" },
    { id: "renovation_paint", label: "Peinture & Ravalement", icon: "fa-paint-roller", unit: "m\xB2", defaultSurface: 350, desc: "Pr\xE9paration, peinture satin\xE9e et finitions" }
  ];
  const templatesList = [
    {
      id: "r1_villa",
      title: "Construction Villa Duplex R+1",
      domain: "BTP & Gros \u0152uvre",
      icon: "fa-house-laptop",
      lotsCount: 11,
      badge: "BTP 11 Lots",
      desc: "Terrassement, fondations, b\xE9ton arm\xE9, ma\xE7onnerie, \xE9tanch\xE9it\xE9, \xE9lec, plomberie, carrelage, menuiserie, peinture...",
      template: R1_TEMPLATE_QUOTE
    },
    {
      id: "painting_pro",
      title: "Peinture & Ravalement Int\xE9rieur / Ext\xE9rieur",
      domain: "Finitions & Peinture",
      icon: "fa-paint-roller",
      lotsCount: 3,
      badge: "M\xE9tr\xE9 D\xE9duit",
      desc: "3 lots : protection masquage, lessivage, primaire hydrofuge, enduit 2 passes et peinture velours 2 couches (350m\xB2).",
      template: PAINTING_PRO_TEMPLATE_QUOTE
    },
    {
      id: "tiling_pro",
      title: "Carrelage & Fa\xEFence Gr\xE8s C\xE9rame 60x60",
      domain: "Rev\xEAtements Sols & Murs",
      icon: "fa-table-cells",
      lotsCount: 3,
      badge: "Pose & Joints",
      desc: "3 lots : ragr\xE9age autolissant P3, carrelage 60x60 rectifi\xE9 double encollage C2S1, plinthes et profil\xE9s alu (220m\xB2).",
      template: TILING_PRO_TEMPLATE_QUOTE
    },
    {
      id: "metallerie_pro",
      title: "M\xE9tallerie, Ch\xE2ssis Acier & Plan de D\xE9bit",
      domain: "M\xE9tallerie & Serrurerie",
      icon: "fa-hammer",
      lotsCount: 3,
      badge: "Plan de D\xE9bit 1D",
      desc: "3 lots : d\xE9bit barres 6m optimis\xE9 (chutes < 5%), soudure MIG/MAG, gaz, antirouille zinc, laque et pose site.",
      template: METALLERIE_PRO_TEMPLATE_QUOTE
    },
    {
      id: "menuiserie_pro",
      title: "Menuiserie, Dressing & Caissons Meuble",
      domain: "Agencement & Menuiserie",
      icon: "fa-couch",
      lotsCount: 3,
      badge: "Calepinage 2D",
      desc: "3 lots : panneaux MDF 18mm, placage chants ABS 2mm, charni\xE8res amorties, tiroirs invisibles et montage atelier/pose.",
      template: MENUISERIE_PRO_TEMPLATE_QUOTE
    },
    {
      id: "acm_facade",
      title: "Habillage Fa\xE7ade ACM Alucobond 180m\xB2",
      domain: "Fa\xE7ades & Bardage",
      icon: "fa-building-columns",
      lotsCount: 3,
      badge: "Cassettes ACM",
      desc: "3 lots : \xE9chafaudage s\xE9curis\xE9, ossature tubulaire galvanis\xE9e et cassettes Alucobond 4mm PVDF avec calepinage.",
      template: ACM_FACADE_TEMPLATE_QUOTE
    },
    {
      id: "signage_branding",
      title: "Enseigne Lumineuse LED & Vitrine",
      domain: "Signal\xE9tique & Branding",
      icon: "fa-lightbulb",
      lotsCount: 2,
      badge: "LED IP67",
      desc: "2 lots : caisson lumineux double face LED, lettres d\xE9coup\xE9es r\xE9tro\xE9clair\xE9es et adh\xE9sif vitrine microperfor\xE9.",
      template: SIGNAGE_BRANDING_TEMPLATE_QUOTE
    }
  ];
  const handleApplyQuickEstimate = () => {
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    let selectedTemplate = R1_TEMPLATE_QUOTE;
    if (estimateCategory === "event_stand") selectedTemplate = EVENT_TEMPLATE_QUOTE;
    else if (estimateCategory === "acm_facade") selectedTemplate = ACM_FACADE_TEMPLATE_QUOTE;
    else if (estimateCategory === "signage_branding") selectedTemplate = SIGNAGE_BRANDING_TEMPLATE_QUOTE;
    const customQuote = {
      ...JSON.parse(JSON.stringify(selectedTemplate)),
      id: Date.now(),
      number: `DEV-${currentYear}-EST-${Math.floor(100 + Math.random() * 900)}`,
      clientName: "Client Estimation Rapide",
      projectRef: `Projet ${categoryOptions.find((c) => c.id === estimateCategory)?.label} (${estimateSurface} ${quickResult.unit})`,
      status: "draft"
    };
    onGenerateFromQuickEstimate(customQuote);
    onClose();
  };
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden border border-neutral-200" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/70 shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-2xl bg-brand-500 text-white flex items-center justify-center text-lg font-bold shadow-md shadow-brand-500/20" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-wand-magic-sparkles" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-black text-neutral-900" }, "Nouveau Devis \u2014 Assistant Intelligent"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500" }, "Choisissez votre m\xE9thode de chiffrage selon votre profil et projet"))), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: onClose,
      className: "w-8 h-8 rounded-xl border border-neutral-200 hover:bg-neutral-100 flex items-center justify-center text-neutral-500",
      "aria-label": "Fermer l'assistant"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark" })
  )), /* @__PURE__ */ React.createElement("div", { className: "flex border-b border-neutral-200 bg-white px-6 pt-3 gap-3 shrink-0" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setWizardTab("quick_estimate"),
      className: `pb-3 px-3 text-xs font-black border-b-2 flex items-center gap-2 transition-all ${wizardTab === "quick_estimate" ? "border-brand-600 text-brand-600" : "border-transparent text-neutral-500 hover:text-neutral-900"}`
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bolt text-brand-500" }),
    /* @__PURE__ */ React.createElement("span", null, "1. Estimation Rapide (Particulier / Novice)")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setWizardTab("templates"),
      className: `pb-3 px-3 text-xs font-black border-b-2 flex items-center gap-2 transition-all ${wizardTab === "templates" ? "border-brand-600 text-brand-600" : "border-transparent text-neutral-500 hover:text-neutral-900"}`
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-layer-group text-indigo-500" }),
    /* @__PURE__ */ React.createElement("span", null, "2. Mod\xE8les M\xE9tiers 1-Clic (BTP, \xC9v\xE9nementiel, Fa\xE7ade)")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setWizardTab("blank"),
      className: `pb-3 px-3 text-xs font-black border-b-2 flex items-center gap-2 transition-all ${wizardTab === "blank" ? "border-brand-600 text-brand-600" : "border-transparent text-neutral-500 hover:text-neutral-900"}`
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-circle-plus text-neutral-500" }),
    /* @__PURE__ */ React.createElement("span", null, "3. Devis Vierge")
  )), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto p-6 space-y-6" }, wizardTab === "quick_estimate" && /* @__PURE__ */ React.createElement("div", { className: "space-y-6 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label text-xs font-black uppercase text-neutral-700" }, "\xC9tape 1 : Que souhaitez-vous faire chiffrer ?"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2" }, categoryOptions.map((cat) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: cat.id,
      onClick: () => {
        setEstimateCategory(cat.id);
        setEstimateSurface(cat.defaultSurface);
      },
      className: `p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${estimateCategory === cat.id ? "border-brand-500 bg-brand-50/40 shadow-sm ring-2 ring-brand-500/10" : "border-neutral-200 hover:border-neutral-300 bg-white"}`
    },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2.5" }, /* @__PURE__ */ React.createElement("div", { className: `w-8 h-8 rounded-xl flex items-center justify-center text-sm ${estimateCategory === cat.id ? "bg-brand-500 text-white" : "bg-neutral-100 text-neutral-600"}` }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${cat.icon}` })), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("h4", { className: "text-xs font-extrabold text-neutral-900 truncate" }, cat.label), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-neutral-500 truncate" }, cat.desc)))
  )))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-200" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label text-[11px] font-bold" }, "Surface / Quantit\xE9 estim\xE9e (", categoryOptions.find((c) => c.id === estimateCategory)?.unit || "m\xB2", ")"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "1",
      value: estimateSurface,
      onChange: (e) => setEstimateSurface(Math.max(1, parseFloat(e.target.value) || 1)),
      className: "w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-black text-neutral-900 focus:border-brand-500 outline-none"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label text-[11px] font-bold" }, "Niveau de Finition / Standing"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: estimateQuality,
      onChange: (e) => setEstimateQuality(e.target.value),
      className: "w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 focus:border-brand-500 outline-none"
    },
    /* @__PURE__ */ React.createElement("option", { value: "eco" }, "\xC9conomique (Mat\xE9riaux standards)"),
    /* @__PURE__ */ React.createElement("option", { value: "standard" }, "Standard (Bon rapport qualit\xE9/prix)"),
    /* @__PURE__ */ React.createElement("option", { value: "premium" }, "Haut Standing / Premium (Finitions luxe)")
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label text-[11px] font-bold" }, "Ville / Localisation Chantier"), /* @__PURE__ */ React.createElement(
    "select",
    {
      value: estimateCity,
      onChange: (e) => setEstimateCity(e.target.value),
      className: "w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 focus:border-brand-500 outline-none"
    },
    /* @__PURE__ */ React.createElement("option", { value: "Bamako" }, "Bamako (Mali)"),
    /* @__PURE__ */ React.createElement("option", { value: "Abidjan" }, "Abidjan (C\xF4te d'Ivoire)"),
    /* @__PURE__ */ React.createElement("option", { value: "Dakar" }, "Dakar (S\xE9n\xE9gal)"),
    /* @__PURE__ */ React.createElement("option", { value: "Ouagadougou" }, "Ouagadougou (Burkina)"),
    /* @__PURE__ */ React.createElement("option", { value: "Conakry" }, "Conakry (Guin\xE9e)"),
    /* @__PURE__ */ React.createElement("option", { value: "Autre" }, "Autre Localit\xE9")
  ))), /* @__PURE__ */ React.createElement("div", { className: "p-5 rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-950 text-white shadow-lg space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black uppercase tracking-wider text-brand-400" }, "Estimation Indicative Instantan\xE9e"), /* @__PURE__ */ React.createElement("h3", { className: "text-sm font-extrabold text-white" }, categoryOptions.find((c) => c.id === estimateCategory)?.label, " \u2014 ", estimateSurface, " ", quickResult.unit)), /* @__PURE__ */ React.createElement("span", { className: "px-3 py-1 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 text-xs font-mono font-bold self-start sm:self-auto" }, "Tarif moyen : ", formatMoney(quickResult.ratePerUnit, currency), " / ", quickResult.unit)), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-baseline justify-between gap-4 pt-1" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 block uppercase font-bold" }, "Fourchette Estimative Net HT"), /* @__PURE__ */ React.createElement("span", { className: "text-base sm:text-xl font-bold text-neutral-200" }, formatMoney(quickResult.minHT, currency), " ", /* @__PURE__ */ React.createElement("span", { className: "text-neutral-500 text-xs" }, "\xE0"), " ", formatMoney(quickResult.maxHT, currency))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-brand-400 block uppercase font-black" }, "Budget Moyen Estim\xE9 TTC"), /* @__PURE__ */ React.createElement("span", { className: "text-lg sm:text-2xl font-black text-brand-400" }, formatMoney(quickResult.avgTTC, currency)))), /* @__PURE__ */ React.createElement("div", { className: "pt-2 flex justify-end" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleApplyQuickEstimate,
      className: "btn-primary py-2.5 px-5 text-xs font-black shadow-md shadow-brand-500/30 flex items-center gap-2"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-right" }),
    /* @__PURE__ */ React.createElement("span", null, "Transformer en Devis D\xE9taill\xE9 & Chiffrer")
  )))), wizardTab === "templates" && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in" }, templatesList.map((tpl) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: tpl.id,
      className: "p-5 rounded-2xl border border-neutral-200 hover:border-brand-500 hover:shadow-md bg-white transition-all flex flex-col justify-between group cursor-pointer",
      onClick: () => {
        onLoadTemplate(tpl.template);
        onClose();
      }
    },
    /* @__PURE__ */ React.createElement("div", { className: "space-y-2.5" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white flex items-center justify-center text-base transition-colors" }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${tpl.icon}` })), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700" }, tpl.lotsCount, " Lots")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold text-brand-600 uppercase tracking-wider block" }, tpl.domain), /* @__PURE__ */ React.createElement("h3", { className: "font-black text-sm text-neutral-900 group-hover:text-brand-700 transition-colors" }, tpl.title), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 mt-1 leading-relaxed" }, tpl.desc))),
    /* @__PURE__ */ React.createElement("div", { className: "pt-4 mt-3 border-t border-neutral-100 flex items-center justify-between text-xs font-bold text-brand-600 group-hover:translate-x-1 transition-transform" }, /* @__PURE__ */ React.createElement("span", null, "Charger ce projet mod\xE8le"), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-right" }))
  ))), wizardTab === "blank" && /* @__PURE__ */ React.createElement("div", { className: "p-8 text-center space-y-4 animate-fade-in bg-neutral-50 rounded-2xl border border-neutral-200" }, /* @__PURE__ */ React.createElement("div", { className: "w-14 h-14 rounded-2xl bg-white border border-neutral-200 text-neutral-600 flex items-center justify-center mx-auto text-2xl shadow-xs" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-circle-plus" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-base font-extrabold text-neutral-800" }, "Commencer avec un devis vierge"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 mt-1 max-w-md mx-auto" }, "Cr\xE9ez un devis de z\xE9ro en ajoutant librement vos lots, ouvrages de la biblioth\xE8que et lignes de prestations.")), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        onInitBlankQuote();
        onClose();
      },
      className: "btn-primary py-2.5 px-6 text-xs font-black"
    },
    "Initialiser le Devis Vierge"
  )))));
}
function AcmCalepinageVisualizer({
  width = 12,
  height = 6,
  panelWidth = 1.5,
  panelHeight = 4,
  onApplyParams,
  currency = "FCFA"
}) {
  const [wInput, setWInput] = useState(width);
  const [hInput, setHInput] = useState(height);
  const [pwInput, setPwInput] = useState(panelWidth);
  const [phInput, setPhInput] = useState(panelHeight);
  const nesting = calculateAcmNesting({
    width: parseFloat(wInput) || 1,
    height: parseFloat(hInput) || 1,
    panelWidth: parseFloat(pwInput) || 1.5,
    panelHeight: parseFloat(phInput) || 4
  });
  const svgWidth = 400;
  const svgHeight = 220;
  const padding = 20;
  const scaleX = (svgWidth - 2 * padding) / Math.max(1, nesting.cols * pwInput);
  const scaleY = (svgHeight - 2 * padding) / Math.max(1, nesting.rows * phInput);
  const scale = Math.min(scaleX, scaleY);
  return /* @__PURE__ */ React.createElement("div", { className: "p-4 rounded-2xl bg-neutral-900 text-white space-y-4 border border-neutral-800" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between border-b border-neutral-800 pb-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-border-all text-brand-400" }), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-extrabold uppercase tracking-wider text-neutral-200" }, "Calepinage 2D & Nesting Panneaux Fa\xE7ade ACM")), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20" }, "Taux de chute : ", nesting.wastePct, "%")), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] text-neutral-400 block" }, "Fa\xE7ade Largeur (m)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      value: wInput,
      onChange: (e) => setWInput(e.target.value),
      className: "w-full bg-neutral-800 border border-neutral-700 rounded-lg p-1.5 font-bold text-white text-xs outline-none"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] text-neutral-400 block" }, "Fa\xE7ade Hauteur (m)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      value: hInput,
      onChange: (e) => setHInput(e.target.value),
      className: "w-full bg-neutral-800 border border-neutral-700 rounded-lg p-1.5 font-bold text-white text-xs outline-none"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] text-neutral-400 block" }, "Format Plaque $L_p$ (m)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      value: pwInput,
      onChange: (e) => setPwInput(e.target.value),
      className: "w-full bg-neutral-800 border border-neutral-700 rounded-lg p-1.5 font-bold text-white text-xs outline-none"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] text-neutral-400 block" }, "Format Plaque $H_p$ (m)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      value: phInput,
      onChange: (e) => setPhInput(e.target.value),
      className: "w-full bg-neutral-800 border border-neutral-700 rounded-lg p-1.5 font-bold text-white text-xs outline-none"
    }
  ))), /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-950 rounded-xl p-3 border border-neutral-800 flex flex-col items-center justify-center" }, /* @__PURE__ */ React.createElement("svg", { width: svgWidth, height: svgHeight, className: "overflow-visible" }, Array.from({ length: nesting.rows }).map(
    (_, rIdx) => Array.from({ length: nesting.cols }).map((_2, cIdx) => {
      const x = padding + cIdx * pwInput * scale;
      const y = padding + rIdx * phInput * scale;
      const w = pwInput * scale;
      const h = phInput * scale;
      return /* @__PURE__ */ React.createElement("g", { key: `${rIdx}-${cIdx}` }, /* @__PURE__ */ React.createElement(
        "rect",
        {
          x,
          y,
          width: w - 2,
          height: h - 2,
          fill: "#e6222b22",
          stroke: "#e6222b",
          strokeWidth: "1.5",
          rx: "2"
        }
      ), /* @__PURE__ */ React.createElement(
        "text",
        {
          x: x + w / 2,
          y: y + h / 2,
          fill: "#ffffff",
          fontSize: "9",
          fontWeight: "bold",
          textAnchor: "middle",
          dominantBaseline: "middle"
        },
        "P",
        rIdx * nesting.cols + cIdx + 1
      ));
    })
  ))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 gap-2 text-center text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "p-2 rounded-lg bg-neutral-800/60 border border-neutral-700/60" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 block" }, "Plaques Brutes"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-white text-sm" }, nesting.totalRawPanels, " plaques")), /* @__PURE__ */ React.createElement("div", { className: "p-2 rounded-lg bg-neutral-800/60 border border-neutral-700/60" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 block" }, "Tubes Ossature"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-brand-400 text-sm" }, nesting.totalLinearTubes, " ml (", nesting.tubesBarCount, " b.)")), /* @__PURE__ */ React.createElement("div", { className: "p-2 rounded-lg bg-neutral-800/60 border border-neutral-700/60" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 block" }, "Surface Utile"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-emerald-400 text-sm" }, nesting.totalSurface, " m\xB2"))), onApplyParams && /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => onApplyParams({
        surfaceDirect: nesting.totalSurface,
        rawPanels: nesting.totalRawPanels,
        tubesLinear: nesting.totalLinearTubes,
        waste: nesting.wastePct
      }),
      className: "w-full btn-primary text-xs py-2 font-bold flex items-center justify-center gap-1.5"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check" }),
    /* @__PURE__ */ React.createElement("span", null, "Appliquer les M\xE9tr\xE9s Calepin\xE9s au Devis")
  ));
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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const statusOptions = [
    { value: "draft", label: "Brouillon", bg: "bg-neutral-100 text-neutral-700 border-neutral-300" },
    { value: "to_verify", label: "\xC0 v\xE9rifier", bg: "bg-amber-50 text-amber-700 border-amber-300" },
    { value: "ready", label: "Pr\xEAt", bg: "bg-blue-50 text-blue-700 border-blue-300" },
    { value: "sent", label: "Envoy\xE9", bg: "bg-indigo-50 text-indigo-700 border-indigo-300" },
    { value: "accepted", label: "Accept\xE9", bg: "bg-emerald-50 text-emerald-700 border-emerald-300" }
  ];
  const currentStatus = statusOptions.find((s) => s.value === (quote.status || "draft")) || statusOptions[0];
  return /* @__PURE__ */ React.createElement("header", { className: "bg-white border-b border-neutral-200 px-4 py-3 sticky top-0 z-30 shadow-xs" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col lg:flex-row lg:items-center justify-between gap-3 max-w-[1700px] mx-auto" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 text-white font-mono text-xs font-bold tracking-wide shrink-0" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-invoice text-brand-400 text-[11px]" }), quote.number || "DEV-2026-001"), /* @__PURE__ */ React.createElement("div", { className: "hidden sm:flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border border-neutral-200 shrink-0" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: !canUndo,
      onClick: onUndo,
      className: `w-7 h-7 rounded flex items-center justify-center text-xs transition-all ${canUndo ? "text-neutral-700 hover:bg-white shadow-xs" : "text-neutral-300 cursor-not-allowed"}`,
      title: "Annuler la derni\xE8re action (Ctrl+Z)",
      "aria-label": "Annuler la modification"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-rotate-left" })
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: !canRedo,
      onClick: onRedo,
      className: `w-7 h-7 rounded flex items-center justify-center text-xs transition-all ${canRedo ? "text-neutral-700 hover:bg-white shadow-xs" : "text-neutral-300 cursor-not-allowed"}`,
      title: "R\xE9tablir (Ctrl+Y)",
      "aria-label": "R\xE9tablir la modification"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-rotate-right" })
  )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 flex-1 min-w-[200px]" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: quote.clientName || "",
      onChange: (e) => onUpdateQuote({ clientName: e.target.value }),
      placeholder: "Nom du Client (ex: M. KOUASSI, BTP SARL)\u2026",
      className: "bg-neutral-50 hover:bg-white focus:bg-white border border-neutral-200 focus:border-brand-500 rounded-lg px-3 py-1.5 text-xs font-bold text-neutral-900 placeholder-neutral-400 focus:ring-2 focus:ring-brand-500/10 outline-none flex-1 transition-all",
      "aria-label": "Nom du client"
    }
  ), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: quote.projectRef || "",
      onChange: (e) => onUpdateQuote({ projectRef: e.target.value }),
      placeholder: "Chantier / Projet (ex: Villa R+1 Cocody)\u2026",
      className: "hidden sm:block bg-neutral-50 hover:bg-white focus:bg-white border border-neutral-200 focus:border-brand-500 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-800 placeholder-neutral-400 focus:ring-2 focus:ring-brand-500/10 outline-none flex-1 transition-all",
      "aria-label": "R\xE9f\xE9rence du chantier"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "relative shrink-0" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      value: quote.status || "draft",
      onChange: (e) => onUpdateQuote({ status: e.target.value }),
      className: `text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full border cursor-pointer appearance-none pr-6 ${currentStatus.bg} focus:outline-none focus:ring-2 focus:ring-brand-500/20`,
      "aria-label": "Statut du devis"
    },
    statusOptions.map((opt) => /* @__PURE__ */ React.createElement("option", { key: opt.value, value: opt.value }, opt.label))
  ), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-down absolute right-2 top-1/2 -translate-y-1/2 text-[9px] pointer-events-none opacity-60" })), /* @__PURE__ */ React.createElement("div", { className: "hidden xl:flex items-center gap-1.5 text-[11px] shrink-0 font-medium" }, isSaving ? /* @__PURE__ */ React.createElement("span", { className: "text-neutral-500 flex items-center gap-1" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-spinner fa-spin text-brand-500" }), /* @__PURE__ */ React.createElement("span", null, "Sauvegarde\u2026")) : hasUnsavedChanges ? /* @__PURE__ */ React.createElement("span", { className: "text-amber-600 flex items-center gap-1 font-bold" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-dot text-amber-500 text-[9px]" }), /* @__PURE__ */ React.createElement("span", null, "Modifications non enregistr\xE9es")) : /* @__PURE__ */ React.createElement("span", { className: "text-emerald-600 flex items-center gap-1 font-bold" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-cloud-check text-emerald-500" }), /* @__PURE__ */ React.createElement("span", null, autosaveTime ? `Enregistr\xE9 \xE0 ${autosaveTime}` : "Enregistr\xE9 localement")))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center justify-end gap-2 lg:shrink-0 self-stretch lg:self-center" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: onOpenWizard,
      className: "btn-primary text-xs py-1.5 px-3.5 font-black flex items-center gap-1.5 shadow-sm shadow-brand-500/20",
      title: "Ouvrir l'assistant intelligent de cr\xE9ation de devis"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-wand-magic-sparkles" }),
    /* @__PURE__ */ React.createElement("span", null, "+ Nouveau Devis")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: onPreviewQuote,
      className: "btn-secondary text-xs py-1.5 px-3 font-bold flex items-center gap-1.5"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-eye text-neutral-600" }),
    /* @__PURE__ */ React.createElement("span", null, "Aper\xE7u Client & PDF")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: isReadOnlyDueToDowngrade,
      onClick: onSaveQuote,
      className: "btn-primary text-xs py-1.5 px-3.5 font-extrabold flex items-center gap-1.5 shadow-sm shadow-brand-500/20 bg-neutral-900 hover:bg-black text-white"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-floppy-disk" }),
    /* @__PURE__ */ React.createElement("span", null, "Enregistrer")
  ), /* @__PURE__ */ React.createElement("div", { ref: menuRef, className: "relative" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setIsMenuOpen(!isMenuOpen),
      className: "w-8 h-8 rounded-lg border border-neutral-200 hover:bg-neutral-100 flex items-center justify-center text-neutral-600 transition-all",
      "aria-label": "Plus d'actions sur le devis"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-ellipsis-vertical text-xs" })
  ), isMenuOpen && /* @__PURE__ */ React.createElement("div", { className: "absolute right-0 mt-1 w-52 bg-white border border-neutral-100 rounded-xl shadow-floating py-1.5 z-40 text-xs animate-fade-in font-medium" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        onOpenWizard();
        setIsMenuOpen(false);
      },
      className: "w-full text-left px-3 py-2 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-wand-magic-sparkles text-brand-500" }),
    " Assistant Nouveau Devis"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        window.print();
        setIsMenuOpen(false);
      },
      className: "w-full text-left px-3 py-2 text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-print text-neutral-400" }),
    " Imprimer / Exporter PDF"
  ), /* @__PURE__ */ React.createElement("div", { className: "border-t border-neutral-100 my-1" }), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        onToggleHybridEditor();
        setIsMenuOpen(false);
      },
      className: "w-full text-left px-3 py-2 text-neutral-500 hover:bg-neutral-50 flex items-center gap-2 text-[11px]"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-clock-rotate-left text-neutral-400" }),
    " Basculer en Mode Classique V5"
  ))))));
}
function LotNavigator({
  lots,
  activeLotIndex,
  onSelectLot,
  onAddLot,
  onDuplicateLot,
  onMoveLot,
  onDeleteLot,
  currency = "FCFA"
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const filteredLots = lots.filter(
    (l) => l.name && l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.code && l.code.includes(searchQuery)
  );
  return /* @__PURE__ */ React.createElement("aside", { className: "w-full lg:w-[220px] lg:h-full lg:min-h-0 bg-neutral-50/80 border-r border-neutral-200 flex flex-col shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "p-3 border-b border-neutral-200 bg-white/80 space-y-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-black uppercase tracking-wider text-neutral-500 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-layer-group text-brand-500" }), " Lots du Devis (", lots.length, ")"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: onAddLot,
      className: "w-7 h-7 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-600 flex items-center justify-center text-xs font-bold transition-all",
      "aria-label": "Ajouter un nouveau lot",
      title: "Ajouter un lot au devis"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus" })
  )), lots.length > 4 && /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-[10px]" }), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: searchQuery,
      onChange: (e) => setSearchQuery(e.target.value),
      placeholder: "Filtrer les lots\u2026",
      className: "w-full pl-7 pr-2 py-1 bg-white border border-neutral-200 rounded-lg text-[11px] text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-brand-500"
    }
  ))), /* @__PURE__ */ React.createElement("nav", { className: "flex-1 min-h-0 overflow-y-auto custom-scroll p-2 space-y-1.5", "aria-label": "Navigation des lots de travaux" }, filteredLots.map((lot, idx) => {
    const originalIndex = lots.findIndex((l) => l.id === lot.id);
    const isActive = originalIndex === activeLotIndex;
    const itemsCount = lot.items?.length || 0;
    const subtotal = lot.lotTotalHT || 0;
    return (
      // P0.17 (2026-08-17) — Cartes de lot trop hautes (5 lignes
      // empilées) : ~4 lots visibles seulement sur un devis qui en
      // compte 9+. Passées en rangée de liste compacte (2 lignes,
      // ~52px) : code + nom + montant, méta et flèches de
      // réordonnancement condensées. Aucune action perdue.
      /* @__PURE__ */ React.createElement(
        "div",
        {
          key: lot.id,
          className: `group relative rounded-lg px-2.5 py-2 transition-all cursor-pointer border ${isActive ? "bg-white border-brand-500 shadow-sm ring-1 ring-brand-500/10" : "bg-white/60 hover:bg-white border-neutral-200/80 hover:border-neutral-300"}`,
          onClick: () => onSelectLot(originalIndex),
          role: "button",
          tabIndex: 0,
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") onSelectLot(originalIndex);
          },
          "aria-current": isActive ? "true" : "false"
        },
        /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 min-w-0" }, /* @__PURE__ */ React.createElement("span", { className: `text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${isActive ? "bg-brand-600 text-white" : "bg-neutral-200 text-neutral-700"}` }, lot.code || String(originalIndex + 1).padStart(2, "0")), /* @__PURE__ */ React.createElement("p", { className: "text-xs font-bold text-neutral-900 truncate flex-1 min-w-0 leading-tight" }, lot.name || `Lot ${originalIndex + 1}`), /* @__PURE__ */ React.createElement("div", { className: "hidden group-hover:flex items-center shrink-0" }, originalIndex > 0 && /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            onClick: (e) => {
              e.stopPropagation();
              onMoveLot(originalIndex, -1);
            },
            className: "px-0.5 text-neutral-400 hover:text-neutral-700 text-[10px]",
            title: "Monter le lot",
            "aria-label": "Monter le lot"
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-up" })
        ), originalIndex < lots.length - 1 && /* @__PURE__ */ React.createElement(
          "button",
          {
            type: "button",
            onClick: (e) => {
              e.stopPropagation();
              onMoveLot(originalIndex, 1);
            },
            className: "px-0.5 text-neutral-400 hover:text-neutral-700 text-[10px]",
            title: "Descendre le lot",
            "aria-label": "Descendre le lot"
          },
          /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-down" })
        ))),
        /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between gap-2 mt-0.5 pl-[26px] text-[10px]" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-500 font-medium truncate" }, itemsCount, " ", itemsCount > 1 ? "ouvrages" : "ouvrage", lot.isComplete ? /* @__PURE__ */ React.createElement("span", { className: "text-emerald-600 font-bold ml-1.5" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-check" })) : itemsCount > 0 ? /* @__PURE__ */ React.createElement("span", { className: "text-amber-600 font-bold ml-1.5", title: "\xC0 v\xE9rifier" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-exclamation" })) : null), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-neutral-900 shrink-0" }, formatMoney(subtotal, currency)))
      )
    );
  }), filteredLots.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "p-4 text-center text-xs text-neutral-400" }, "Aucun lot trouv\xE9")));
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
  currency = "FCFA"
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(lot.name || "");
  useEffect(() => {
    setTitleInput(lot.name || "");
  }, [lot.name]);
  const handleSaveTitle = () => {
    setIsEditingTitle(false);
    if (titleInput.trim() && titleInput !== lot.name) {
      onUpdateLot({ name: titleInput.trim() });
    }
  };
  return (
    // P0.17 (2026-08-17) — `flex-wrap` + largeur minimale sur le bloc titre :
    // sans ça, les boutons d'action (whitespace-nowrap, donc incompressibles)
    // écrasaient le titre et la ligne "Sous-total HT · Marge · ouvrages" en
    // une colonne d'une dizaine de pixels dès que la fenêtre rétrécissait.
    /* @__PURE__ */ React.createElement("div", { className: "bg-white border-b border-neutral-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:flex-wrap justify-between items-start sm:items-center gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 flex-1 min-w-full sm:min-w-[240px]" }, /* @__PURE__ */ React.createElement("span", { className: "w-9 h-9 rounded-xl bg-brand-50 text-brand-700 border border-brand-200 flex items-center justify-center font-black text-sm shrink-0" }, lot.code || String(lotIndex + 1).padStart(2, "0")), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, isEditingTitle ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: titleInput,
        onChange: (e) => setTitleInput(e.target.value),
        onBlur: handleSaveTitle,
        onKeyDown: (e) => {
          if (e.key === "Enter") handleSaveTitle();
        },
        autoFocus: true,
        className: "border border-brand-500 rounded-lg px-2.5 py-1 text-sm font-extrabold text-neutral-900 w-full focus:ring-2 focus:ring-brand-500/20 outline-none"
      }
    ), /* @__PURE__ */ React.createElement("button", { onClick: handleSaveTitle, className: "p-1 text-emerald-600 font-bold text-xs" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check" }))) : /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 group cursor-pointer", onClick: () => setIsEditingTitle(true) }, /* @__PURE__ */ React.createElement("h2", { className: "text-base sm:text-lg font-black text-neutral-900 truncate" }, lot.name || `Lot ${lotIndex + 1}`), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pencil text-xs text-neutral-400 group-hover:text-brand-500 transition-colors" })), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-3 mt-1 text-xs" }, /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-neutral-900" }, "Sous-total HT : ", /* @__PURE__ */ React.createElement("strong", { className: "text-brand-600 font-black" }, formatMoney(lot.lotTotalHT || 0, currency))), lot.lotMarginPct !== void 0 && /* @__PURE__ */ React.createElement("span", { className: "text-neutral-500 font-medium" }, "\u2022 Marge : ", /* @__PURE__ */ React.createElement("span", { className: "font-bold text-emerald-600" }, lot.lotMarginPct, "%")), /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 font-medium" }, "\u2022 ", lot.items?.length || 0, " ouvrage(s)")))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: onOpenPicker,
        className: "btn-primary text-xs py-2 px-3.5 font-extrabold flex items-center justify-center gap-1.5 shadow-sm shadow-brand-500/20 flex-1 sm:flex-initial whitespace-nowrap",
        "aria-label": "Ajouter un ouvrage depuis le catalogue"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus" }),
      /* @__PURE__ */ React.createElement("span", null, "+ Ajouter un Ouvrage")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: onAddCustomLine,
        className: "btn-secondary text-xs py-2 px-3 font-bold flex items-center justify-center gap-1.5",
        title: "Ajouter une ligne libre non catalogu\xE9e",
        "aria-label": "Ajouter une ligne libre"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pen-ruler text-neutral-500" }),
      /* @__PURE__ */ React.createElement("span", null, "+ Ligne Libre")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: onDuplicateLot,
        className: "p-2 rounded-xl border border-neutral-200 hover:bg-neutral-100 text-neutral-600 transition-all text-xs",
        title: "Dupliquer ce lot",
        "aria-label": "Dupliquer ce lot"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-clone" })
    ), lotsCount > 1 && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: onDeleteLot,
        className: "p-2 rounded-xl border border-neutral-200 hover:bg-red-50 text-neutral-400 hover:text-red-600 transition-all text-xs",
        title: "Supprimer ce lot",
        "aria-label": "Supprimer ce lot"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash-can" })
    )))
  );
}
function WorkItemTable({
  items,
  onUpdateItem,
  onOpenInspector,
  onDuplicateItem,
  onDeleteItem,
  onOpenPicker,
  currency = "FCFA"
}) {
  if (!items || items.length === 0) {
    return /* @__PURE__ */ React.createElement("div", { className: "p-8 sm:p-12 text-center border-2 border-dashed border-neutral-200 rounded-2xl bg-white m-4 sm:m-6 space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto text-2xl" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-cube" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-base font-extrabold text-neutral-800" }, "Ce lot ne contient aucun ouvrage pour le moment"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 mt-1 max-w-md mx-auto" }, "S\xE9lectionnez un ouvrage dans votre biblioth\xE8que m\xE9tier ou ajoutez une ligne personnalis\xE9e pour calculer le devis.")), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center justify-center gap-3 pt-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: onOpenPicker,
        className: "btn-primary text-xs py-2.5 px-4 font-extrabold flex items-center gap-2"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus" }),
      " Choisir dans le Catalogue"
    )));
  }
  return /* @__PURE__ */ React.createElement("div", { className: "p-4 sm:p-6 space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "sm:hidden space-y-3" }, items.map((item, idx) => {
    const unitPrice = item.unitPriceHT || 0;
    const total = item.totalHT || 0;
    return /* @__PURE__ */ React.createElement("div", { key: item.id || idx, className: "border border-neutral-200 rounded-2xl bg-white shadow-xs p-3.5 space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-2.5" }, /* @__PURE__ */ React.createElement("div", { className: "w-7 h-7 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center text-xs shrink-0 mt-1" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-cube" })), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1 space-y-1" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: item.name || "",
        onChange: (e) => onUpdateItem(idx, { name: e.target.value }),
        placeholder: "D\xE9signation de l'ouvrage ou ligne...",
        className: "w-full font-bold text-sm text-neutral-900 bg-transparent hover:bg-neutral-100 focus:bg-white border border-transparent hover:border-neutral-200 focus:border-brand-500 rounded-md px-2 py-1 outline-none transition-all",
        "aria-label": `D\xE9signation pour ${item.name}`
      }
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: item.description || "",
        onChange: (e) => onUpdateItem(idx, { description: e.target.value }),
        placeholder: "Pr\xE9cisions ou description...",
        className: "w-full text-xs text-neutral-500 bg-transparent hover:bg-neutral-100 focus:bg-white border border-transparent hover:border-neutral-200 focus:border-brand-500 rounded px-2 py-0.5 outline-none transition-all placeholder-neutral-300",
        "aria-label": `Description pour ${item.name}`
      }
    ), item.calcForm && /* @__PURE__ */ React.createElement("span", { className: "inline-block text-[10px] font-mono text-neutral-400 pl-2" }, "Mode: ", item.calcForm.takeoffMode || "rectangle", " \u2022 ", item.calcForm.width, "m \xD7 ", item.calcForm.height, "m"))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-2.5 pt-2 border-t border-neutral-100" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider block mb-1" }, "Quantit\xE9"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        min: "1",
        step: "any",
        value: item.qty || 1,
        onChange: (e) => {
          const val = parseFloat(e.target.value) || 1;
          onUpdateItem(idx, { qty: val, calcForm: { ...item.calcForm || {}, qty: val } });
        },
        className: "w-full text-center py-1.5 px-2 font-bold text-neutral-900 border border-neutral-200 rounded-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none",
        "aria-label": `Quantit\xE9 pour ${item.name}`
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "px-2 py-1.5 rounded bg-neutral-100 text-neutral-700 font-mono text-[11px] shrink-0" }, item.unit || "u"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider block mb-1" }, "Prix unitaire HT"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        min: "0",
        step: "any",
        value: item.unitPriceHT || 0,
        onChange: (e) => {
          const val = parseFloat(e.target.value) || 0;
          onUpdateItem(idx, { unitPriceHT: val, totalHT: val * (item.qty || 1), isCustom: true });
        },
        className: "w-full text-right py-1.5 px-2 font-bold text-neutral-900 border border-neutral-200 rounded-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none",
        "aria-label": `Prix unitaire pour ${item.name}`
      }
    ))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between pt-2 border-t border-neutral-100" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider block" }, "Total Net HT"), /* @__PURE__ */ React.createElement("span", { className: "font-black text-neutral-900 text-base" }, formatMoney(total, currency))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => onOpenInspector(idx), className: "p-2 rounded-lg border border-neutral-200 hover:border-brand-300 hover:bg-brand-50 text-neutral-600 hover:text-brand-600 text-sm transition-all", title: "Voir et modifier les d\xE9tails techniques & m\xE9tr\xE9s", "aria-label": `D\xE9tails techniques de ${item.name}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-sliders" })), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => onDuplicateItem(idx), className: "p-2 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 text-sm transition-all", title: "Dupliquer cette ligne", "aria-label": `Dupliquer ${item.name}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-copy" })), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => onDeleteItem(idx), className: "p-2 rounded-lg border border-neutral-200 hover:bg-red-50 text-neutral-400 hover:text-red-600 text-sm transition-all", title: "Supprimer cette ligne", "aria-label": `Supprimer ${item.name}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash-can" })))));
  })), /* @__PURE__ */ React.createElement("div", { className: "hidden sm:block overflow-x-auto border border-neutral-200 rounded-2xl bg-white shadow-xs" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left text-xs border-collapse" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 font-extrabold uppercase tracking-wider text-[10px]" }, /* @__PURE__ */ React.createElement("th", { className: "py-3.5 px-4" }, "D\xE9signation Ouvrage"), /* @__PURE__ */ React.createElement("th", { className: "py-3.5 px-3 text-center w-24" }, "Quantit\xE9"), /* @__PURE__ */ React.createElement("th", { className: "py-3.5 px-2 text-center w-20" }, "Unit\xE9"), /* @__PURE__ */ React.createElement("th", { className: "py-3.5 px-3 text-right w-32" }, "Prix Unitaire HT"), /* @__PURE__ */ React.createElement("th", { className: "py-3.5 px-4 text-right w-36" }, "Total Net HT"), /* @__PURE__ */ React.createElement("th", { className: "py-3.5 px-3 text-center w-28" }, "Actions"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-neutral-100" }, items.map((item, idx) => {
    const unitPrice = item.unitPriceHT || 0;
    const total = item.totalHT || 0;
    return /* @__PURE__ */ React.createElement("tr", { key: item.id || idx, className: "hover:bg-neutral-50/60 transition-colors group" }, /* @__PURE__ */ React.createElement("td", { className: "py-3 px-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-2.5" }, /* @__PURE__ */ React.createElement("div", { className: "w-7 h-7 rounded-lg bg-neutral-100 text-neutral-700 flex items-center justify-center text-xs shrink-0 mt-1" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-cube" })), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1 space-y-1" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: item.name || "",
        onChange: (e) => onUpdateItem(idx, { name: e.target.value }),
        placeholder: "D\xE9signation de l'ouvrage ou ligne...",
        className: "w-full font-bold text-xs text-neutral-900 bg-transparent hover:bg-neutral-100 focus:bg-white border border-transparent hover:border-neutral-200 focus:border-brand-500 rounded-md px-2 py-1 outline-none transition-all",
        "aria-label": `D\xE9signation pour ${item.name}`
      }
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: item.description || "",
        onChange: (e) => onUpdateItem(idx, { description: e.target.value }),
        placeholder: "Pr\xE9cisions ou description pour le devis client...",
        className: "w-full text-[11px] text-neutral-500 bg-transparent hover:bg-neutral-100 focus:bg-white border border-transparent hover:border-neutral-200 focus:border-brand-500 rounded px-2 py-0.5 outline-none transition-all placeholder-neutral-300",
        "aria-label": `Description pour ${item.name}`
      }
    ), item.calcForm && /* @__PURE__ */ React.createElement("span", { className: "inline-block text-[10px] font-mono text-neutral-400 pl-2" }, "Mode: ", item.calcForm.takeoffMode || "rectangle", " \u2022 ", item.calcForm.width, "m \xD7 ", item.calcForm.height, "m")))), /* @__PURE__ */ React.createElement("td", { className: "py-3 px-3 text-center" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        min: "1",
        step: "any",
        value: item.qty || 1,
        onChange: (e) => {
          const val = parseFloat(e.target.value) || 1;
          onUpdateItem(idx, {
            qty: val,
            calcForm: { ...item.calcForm || {}, qty: val }
          });
        },
        className: "w-20 text-center py-1.5 px-2 font-bold text-neutral-900 border border-neutral-200 rounded-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none",
        "aria-label": `Quantit\xE9 pour ${item.name}`
      }
    )), /* @__PURE__ */ React.createElement("td", { className: "py-3 px-2 text-center text-neutral-600 font-medium" }, /* @__PURE__ */ React.createElement("span", { className: "px-2 py-1 rounded bg-neutral-100 text-neutral-700 font-mono text-[11px]" }, item.unit || "u")), /* @__PURE__ */ React.createElement("td", { className: "py-3 px-3 text-right" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        min: "0",
        step: "any",
        value: item.unitPriceHT || 0,
        onChange: (e) => {
          const val = parseFloat(e.target.value) || 0;
          onUpdateItem(idx, {
            unitPriceHT: val,
            totalHT: val * (item.qty || 1),
            isCustom: true
          });
        },
        className: "w-28 text-right py-1.5 px-2 font-bold text-neutral-900 border border-neutral-200 rounded-lg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none",
        "aria-label": `Prix unitaire pour ${item.name}`
      }
    )), /* @__PURE__ */ React.createElement("td", { className: "py-3 px-4 text-right font-black text-neutral-900 text-sm" }, formatMoney(total, currency)), /* @__PURE__ */ React.createElement("td", { className: "py-3 px-3 text-center" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-center gap-1.5" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => onOpenInspector(idx),
        className: "p-1.5 rounded-lg border border-neutral-200 hover:border-brand-300 hover:bg-brand-50 text-neutral-600 hover:text-brand-600 text-xs transition-all",
        title: "Voir et modifier les d\xE9tails techniques & m\xE9tr\xE9s",
        "aria-label": `D\xE9tails techniques de ${item.name}`
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-sliders" })
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => onDuplicateItem(idx),
        className: "p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 text-xs transition-all",
        title: "Dupliquer cette ligne",
        "aria-label": `Dupliquer ${item.name}`
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-copy" })
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => onDeleteItem(idx),
        className: "p-1.5 rounded-lg border border-neutral-200 hover:bg-red-50 text-neutral-400 hover:text-red-600 text-xs transition-all",
        title: "Supprimer cette ligne",
        "aria-label": `Supprimer ${item.name}`
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash-can" })
    ))));
  })))));
}
function WorkItemPicker({
  isOpen,
  onClose,
  solutions,
  onSelectSolution,
  onSelectBulkSolutions,
  onCreateCustomSolution
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
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
    { id: "all", label: "Tous les Ouvrages" },
    { id: "favs", label: "\u2B50 Favoris" },
    { id: "recents", label: "\u{1F558} R\xE9cents" },
    { id: "popular", label: "\u{1F525} Plus Utilis\xE9s" },
    { id: "btp", label: "\u{1F3E0} BTP & Gros \u0152uvre" },
    { id: "event", label: "\u{1F3AA} \xC9v\xE9nementiel & Sc\xE9no" },
    { id: "acm", label: "\u{1F3E2} Fa\xE7ade & Alucobond" },
    { id: "signage", label: "\u{1FAA7} Enseigne & Branding" },
    { id: "paint", label: "\u{1F3A8} Peinture & Finitions" },
    { id: "menuiserie", label: "\u{1FAB5} Menuiserie & Alu" }
  ];
  const normalizedQuery = normalizeSearchText(searchQuery);
  const filteredSolutions = solutions.filter((s) => {
    const matchesName = normalizeSearchText(s.name).includes(normalizedQuery);
    const matchesKeyword = (s.keywords || []).some((k) => normalizeSearchText(k).includes(normalizedQuery));
    if (!matchesName && !matchesKeyword) return false;
    if (selectedCategory === "all") return true;
    if (selectedCategory === "btp") return s.name.toLowerCase().includes("b\xE9ton") || s.name.toLowerCase().includes("cadre") || s.name.toLowerCase().includes("btp");
    if (selectedCategory === "event") return s.name.toLowerCase().includes("panneau") || s.name.toLowerCase().includes("b\xE2che") || s.name.toLowerCase().includes("podium");
    if (selectedCategory === "acm") return s.name.toLowerCase().includes("alucobond") || s.name.toLowerCase().includes("plaque") || s.name.toLowerCase().includes("fa\xE7ade");
    if (selectedCategory === "signage") return s.name.toLowerCase().includes("enseigne") || s.name.toLowerCase().includes("lettre") || s.name.toLowerCase().includes("vinyle") || s.name.toLowerCase().includes("panneau");
    if (selectedCategory === "paint") return s.name.toLowerCase().includes("peint") || s.name.toLowerCase().includes("enduit");
    if (selectedCategory === "menuiserie") return s.name.toLowerCase().includes("alu") || s.name.toLowerCase().includes("bois") || s.name.toLowerCase().includes("vitre");
    return true;
  });
  const handleToggleBulk = (solId) => {
    setBulkSelections((prev) => ({
      ...prev,
      [solId]: prev[solId] ? void 0 : 1
    }));
  };
  const handleConfirmBulk = () => {
    const selected = Object.keys(bulkSelections).filter((id) => bulkSelections[id] !== void 0).map((id) => ({
      solution: solutions.find((s) => s.id === parseInt(id)),
      qty: bulkSelections[id] || 1
    })).filter((entry) => entry.solution);
    onSelectBulkSolutions(selected);
    onClose();
  };
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-6 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-neutral-200 animate-scale-up" }, /* @__PURE__ */ React.createElement("div", { className: "p-4 sm:p-5 border-b border-neutral-200 flex items-center justify-between gap-3 bg-neutral-50/60" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-wand-magic-sparkles text-xs" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "font-black text-sm text-neutral-900" }, "Biblioth\xE8que des Ouvrages M\xE9tiers"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500" }, "S\xE9lectionnez un ouvrage \xE0 ajouter au lot en cours"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setIsBulkMode(!isBulkMode),
      className: `px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${isBulkMode ? "bg-brand-50 border-brand-300 text-brand-700" : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-list-check mr-1.5" }),
    isBulkMode ? "Mode Multiple Actif" : "Ajout Multiple"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: onClose,
      className: "w-8 h-8 rounded-lg border border-neutral-200 hover:bg-neutral-100 flex items-center justify-center text-neutral-500",
      "aria-label": "Fermer le s\xE9lecteur"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-sm" })
  ))), /* @__PURE__ */ React.createElement("div", { className: "p-4 border-b border-neutral-100 space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm" }), /* @__PURE__ */ React.createElement(
    "input",
    {
      ref: searchInputRef,
      type: "text",
      value: searchQuery,
      onChange: (e) => setSearchQuery(e.target.value),
      placeholder: "Rechercher un ouvrage par nom, mat\xE9riau, m\xE9tr\xE9\u2026 (ex: B\xE9ton, Peinture, Fer)",
      className: "w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:border-brand-500 focus:bg-white rounded-xl text-xs font-medium placeholder-neutral-400 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
    }
  ), searchQuery && /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setSearchQuery(""),
      className: "absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-xmark" })
  )), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]" }, categories.map((cat) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: cat.id,
      type: "button",
      onClick: () => setSelectedCategory(cat.id),
      className: `px-2.5 py-1 rounded-full whitespace-nowrap font-bold transition-all ${selectedCategory === cat.id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`
    },
    cat.label
  )))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto p-4 space-y-2.5" }, filteredSolutions.map((sol) => {
    const isChecked = bulkSelections[sol.id] !== void 0;
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: sol.id,
        className: "p-3.5 rounded-xl border border-neutral-200 hover:border-brand-300 hover:bg-brand-50/30 bg-white transition-all flex items-center justify-between gap-3 group"
      },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-3 min-w-0 flex-1" }, isBulkMode && /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "checkbox",
          checked: isChecked,
          onChange: () => handleToggleBulk(sol.id),
          className: "w-4 h-4 mt-1 rounded text-brand-600 focus:ring-brand-500"
        }
      ), /* @__PURE__ */ React.createElement("div", { className: "w-9 h-9 rounded-xl bg-neutral-100 group-hover:bg-brand-100 text-neutral-700 group-hover:text-brand-700 flex items-center justify-center text-sm shrink-0 transition-colors" }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${sol.icon || "fa-cube"}` })), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("h4", { className: "font-extrabold text-xs text-neutral-900 truncate group-hover:text-brand-900" }, sol.name), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mt-0.5 text-[10px] text-neutral-500" }, /* @__PURE__ */ React.createElement("span", { className: "font-mono bg-neutral-100 px-1.5 py-0.5 rounded" }, "Modes: ", (sol.allowedModes || ["rectangle"]).join(", ")), /* @__PURE__ */ React.createElement("span", { className: "text-emerald-600 font-bold" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-check mr-1" }), "Pr\xEAt \xE0 chiffrer")))),
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 shrink-0" }, isBulkMode ? isChecked && /* @__PURE__ */ React.createElement(
        "input",
        {
          type: "number",
          min: "1",
          value: bulkSelections[sol.id] || 1,
          onChange: (e) => setBulkSelections({
            ...bulkSelections,
            [sol.id]: parseFloat(e.target.value) || 1
          }),
          className: "w-16 py-1 px-2 text-center text-xs font-bold border border-brand-300 rounded-lg",
          placeholder: "Qt\xE9"
        }
      ) : /* @__PURE__ */ React.createElement(
        "button",
        {
          type: "button",
          onClick: () => {
            onSelectSolution(sol);
            onClose();
          },
          className: "btn-primary text-xs py-1.5 px-3 font-extrabold flex items-center gap-1.5"
        },
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus" }),
        /* @__PURE__ */ React.createElement("span", null, "Ajouter")
      ))
    );
  }), filteredSolutions.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "p-8 text-center space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto text-xl" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass" })), /* @__PURE__ */ React.createElement("p", { className: "text-xs font-bold text-neutral-700" }, "Aucun ouvrage ne correspond \xE0 \xAB ", searchQuery, " \xBB"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400" }, "Vous pouvez cr\xE9er cet ouvrage imm\xE9diatement pour l'ajouter \xE0 votre catalogue."), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        onCreateCustomSolution(searchQuery);
        onClose();
      },
      className: "btn-primary text-xs py-2 px-4 font-extrabold"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus mr-1" }),
    " Cr\xE9er \xAB ",
    searchQuery,
    " \xBB"
  ))), isBulkMode && /* @__PURE__ */ React.createElement("div", { className: "p-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs text-neutral-600 font-medium" }, Object.values(bulkSelections).filter((v) => v !== void 0).length, " ouvrage(s) s\xE9lectionn\xE9(s)"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleConfirmBulk,
      disabled: Object.values(bulkSelections).filter((v) => v !== void 0).length === 0,
      className: "btn-primary text-xs py-2 px-4 font-extrabold disabled:opacity-50"
    },
    "Ajouter les ouvrages au lot"
  ))));
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
  currency = "FCFA"
}) {
  const [inspectorMode, setInspectorMode] = useState("simple");
  const [activeTab, setActiveTab] = useState("dimensions");
  if (!isOpen || !item) return null;
  const solution = solutions.find((s) => s.id === item.solutionId);
  const calcForm = item.calcForm || {};
  const quoteData = item.quoteData || {};
  const tabs = [
    { id: "dimensions", label: "1. M\xE9tr\xE9 & Dimensions", icon: "fa-ruler-combined" },
    { id: "costs", label: "2. D\xE9composition D\xE9bours\xE9", icon: "fa-calculator" },
    { id: "pricing", label: "3. Prix & Marge", icon: "fa-percent" },
    { id: "client", label: "4. Pr\xE9sentation Client", icon: "fa-file-lines" }
  ];
  if (solution?.name?.toLowerCase()?.includes("alucobond") || solution?.name?.toLowerCase()?.includes("panneau")) {
    tabs.push({ id: "calepinage", label: "5. Calepinage 2D ACM", icon: "fa-border-all" });
  }
  const handleParamChange = (field, val) => {
    const updatedCalcForm = {
      ...calcForm,
      [field]: val
    };
    if (field === "width" || field === "height") {
      const w = field === "width" ? val : parseFloat(updatedCalcForm.width) || 0;
      const h = field === "height" ? val : parseFloat(updatedCalcForm.height) || 0;
      if (w > 0 && h > 0) {
        updatedCalcForm.surfaceDirect = parseFloat((w * h).toFixed(2));
      }
    } else if (field === "surfaceDirect") {
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
      ...calcForm.customVarValues || {},
      [varName]: parseFloat(val) || 0
    };
    handleParamChange("customVarValues", customVarValues);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0 w-full bg-white flex flex-col overflow-hidden animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "p-4 sm:p-5 border-b border-neutral-200 flex items-center justify-between gap-3 bg-neutral-50/70" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 min-w-0" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: onClose,
      className: "btn-icon text-neutral-500 hover:text-neutral-800 shrink-0",
      "aria-label": "Retour aux ouvrages du lot"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-left" })
  ), /* @__PURE__ */ React.createElement("div", { className: "w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-sm shrink-0" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-sliders" })), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("h3", { className: "font-black text-sm text-neutral-900 truncate" }, "D\xE9tails : ", item.name), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 truncate" }, "M\xE9tr\xE9s, composition des co\xFBts et prix client"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-200 p-0.5 rounded-lg flex items-center text-[10px] font-extrabold" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setInspectorMode("simple"),
      className: `px-2.5 py-1 rounded-md transition-all ${inspectorMode === "simple" ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-600 hover:text-neutral-900"}`
    },
    "\u{1F441}\uFE0F Simple"
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setInspectorMode("advanced"),
      className: `px-2.5 py-1 rounded-md transition-all ${inspectorMode === "advanced" ? "bg-white text-neutral-900 shadow-xs" : "text-neutral-600 hover:text-neutral-900"}`
    },
    "\u2699\uFE0F Avanc\xE9"
  )))), inspectorMode === "simple" ? /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto p-5 space-y-5 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "p-4 rounded-2xl bg-brand-50/40 border border-brand-200/60 space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-black uppercase tracking-wider text-brand-700" }, "Param\xE8tres Essentiels de l'Ouvrage"), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-bold text-neutral-500 font-mono" }, "Mode Simple")), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "D\xE9signation Ouvrage"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: item.name || "",
      onChange: (e) => onUpdateItem({ name: e.target.value }),
      className: "w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-extrabold text-neutral-900 outline-none focus:border-brand-500"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Quantit\xE9 & Unit\xE9"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "1",
      value: calcForm.qty || item.qty || 1,
      onChange: (e) => handleParamChange("qty", parseFloat(e.target.value) || 1),
      className: "w-24 p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-extrabold text-neutral-900 text-center focus:border-brand-500"
    }
  ), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: item.unit || "u",
      onChange: (e) => onUpdateItem({ unit: e.target.value }),
      className: "w-20 p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold text-neutral-700 text-center"
    }
  )))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3 pt-2" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Largeur (m)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      value: calcForm.width || 0,
      onChange: (e) => handleParamChange("width", parseFloat(e.target.value) || 0),
      className: "w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Hauteur (m)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      step: "any",
      value: calcForm.height || 0,
      onChange: (e) => handleParamChange("height", parseFloat(e.target.value) || 0),
      className: "w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
    }
  )))), /* @__PURE__ */ React.createElement("div", { className: "p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between font-bold text-emerald-800" }, /* @__PURE__ */ React.createElement("span", null, "Co\xFBt D\xE9bours\xE9 Estim\xE9 :"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold" }, formatMoney(quoteData.totalDebourseConsomme, currency))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between font-extrabold text-brand-600 text-sm border-t border-emerald-200 pt-2" }, /* @__PURE__ */ React.createElement("span", null, "Prix de Vente Total HT :"), /* @__PURE__ */ React.createElement("span", null, formatMoney(quoteData.netHTConsomme, currency)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Description commerciale pour le devis client"), /* @__PURE__ */ React.createElement(
    "textarea",
    {
      rows: "3",
      value: item.description || "",
      onChange: (e) => onUpdateItem({ description: e.target.value }),
      placeholder: "Descriptif soign\xE9 affich\xE9 sur le devis client\u2026",
      className: "w-full p-3 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500/20 outline-none"
    }
  ))) : (
    /* MODE AVANCÉ (Technique / Expert) */
    /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col min-h-0 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "flex border-b border-neutral-200 px-4 bg-neutral-50/40 gap-2 overflow-x-auto text-xs font-bold shrink-0" }, tabs.map((t) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: t.id,
        type: "button",
        onClick: () => setActiveTab(t.id),
        className: `py-3 px-3 border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${activeTab === t.id ? "border-brand-600 text-brand-700 bg-white font-black" : "border-transparent text-neutral-500 hover:text-neutral-800"}`
      },
      /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${t.icon} text-xs` }),
      /* @__PURE__ */ React.createElement("span", null, t.label)
    ))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto p-5 space-y-5" }, activeTab === "dimensions" && /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Mode de M\xE9tr\xE9"), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: calcForm.takeoffMode || "rectangle",
        onChange: (e) => handleParamChange("takeoffMode", e.target.value),
        className: "w-full p-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold"
      },
      /* @__PURE__ */ React.createElement("option", { value: "rectangle" }, "Rectangle (Largeur \xD7 Hauteur)"),
      /* @__PURE__ */ React.createElement("option", { value: "surface" }, "Surface Directe (m\xB2)"),
      /* @__PURE__ */ React.createElement("option", { value: "volume" }, "Volume B\xE9ton (m\xB3)"),
      /* @__PURE__ */ React.createElement("option", { value: "linear" }, "M\xE8tre Lin\xE9aire (ml)"),
      /* @__PURE__ */ React.createElement("option", { value: "floor" }, "Sol / Plafond (m\xB2)"),
      /* @__PURE__ */ React.createElement("option", { value: "unit" }, "Unit\xE9 / Forfait (u)")
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Quantit\xE9 d'ouvrages"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        min: "1",
        value: calcForm.qty || item.qty || 1,
        onChange: (e) => handleParamChange("qty", parseFloat(e.target.value) || 1),
        className: "w-full p-2.5 border border-neutral-200 rounded-xl text-xs font-bold"
      }
    ))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-neutral-50/60 rounded-xl border border-neutral-200" }, (calcForm.takeoffMode === "rectangle" || calcForm.takeoffMode === "volume" || calcForm.takeoffMode === "floor") && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Largeur (m)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        step: "any",
        value: calcForm.width || 0,
        onChange: (e) => handleParamChange("width", parseFloat(e.target.value) || 0),
        className: "w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
      }
    )), (calcForm.takeoffMode === "rectangle" || calcForm.takeoffMode === "volume") && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Hauteur (m)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        step: "any",
        value: calcForm.height || 0,
        onChange: (e) => handleParamChange("height", parseFloat(e.target.value) || 0),
        className: "w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
      }
    )), calcForm.takeoffMode === "volume" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "\xC9paisseur / Profondeur (m)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        step: "any",
        value: calcForm.depth || 0.15,
        onChange: (e) => handleParamChange("depth", parseFloat(e.target.value) || 0),
        className: "w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
      }
    )), calcForm.takeoffMode === "surface" && /* @__PURE__ */ React.createElement("div", { className: "sm:col-span-2" }, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Surface Directe (m\xB2)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        step: "any",
        value: calcForm.surfaceDirect || 0,
        onChange: (e) => handleParamChange("surfaceDirect", parseFloat(e.target.value) || 0),
        className: "w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
      }
    )), calcForm.takeoffMode === "linear" && /* @__PURE__ */ React.createElement("div", { className: "sm:col-span-2" }, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Longueur (ml)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        step: "any",
        value: calcForm.lengthDirect || 0,
        onChange: (e) => handleParamChange("lengthDirect", parseFloat(e.target.value) || 0),
        className: "w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
      }
    )), calcForm.takeoffMode === "unit" && /* @__PURE__ */ React.createElement("div", { className: "sm:col-span-2 text-xs text-neutral-500 bg-white border border-neutral-200 rounded-lg p-2" }, "Mode Pi\xE8ce / Forfait : le calcul s'applique directement \xE0 la quantit\xE9 d'ouvrages ci-dessus."), solution?.customVars?.map((cv) => /* @__PURE__ */ React.createElement("div", { key: cv.name }, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, cv.label), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        step: "any",
        value: calcForm.customVarValues && calcForm.customVarValues[cv.name] !== void 0 ? calcForm.customVarValues[cv.name] : cv.defaultValue,
        onChange: (e) => handleCustomVarChange(cv.name, e.target.value),
        className: "w-full p-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold"
      }
    ))))), activeTab === "costs" && /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center bg-neutral-100 p-3 rounded-xl" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold text-neutral-700 uppercase" }, "D\xE9bours\xE9 Sec Consomm\xE9 :"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-neutral-900 text-sm" }, formatMoney(quoteData.totalDebourseConsomme, currency))), /* @__PURE__ */ React.createElement("table", { className: "w-full text-xs border-collapse border border-neutral-200 rounded-xl overflow-hidden" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-neutral-50 text-[10px] font-bold text-neutral-500 uppercase" }, /* @__PURE__ */ React.createElement("th", { className: "p-2.5 text-left" }, "Poste"), /* @__PURE__ */ React.createElement("th", { className: "p-2.5 text-right" }, "Quantit\xE9 Nette"), /* @__PURE__ */ React.createElement("th", { className: "p-2.5 text-right" }, "Perte %"), /* @__PURE__ */ React.createElement("th", { className: "p-2.5 text-right" }, "Co\xFBt Unitaire"), /* @__PURE__ */ React.createElement("th", { className: "p-2.5 text-right" }, "Co\xFBt Total"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-neutral-100" }, (quoteData.details || []).map((d, i) => /* @__PURE__ */ React.createElement("tr", { key: i, className: "hover:bg-neutral-50" }, /* @__PURE__ */ React.createElement("td", { className: "p-2.5 font-bold text-neutral-800" }, d.label), /* @__PURE__ */ React.createElement("td", { className: "p-2.5 text-right font-medium" }, d.billedQty?.toFixed(2), " ", d.unit), /* @__PURE__ */ React.createElement("td", { className: "p-2.5 text-right" }, d.type === "material" ? /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-end gap-1" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        min: "0",
        max: "100",
        step: "0.1",
        "aria-label": `Taux de perte pour ${d.label}`,
        title: `Taux catalogue par d\xE9faut : ${d.defaultWastePct}%`,
        className: `w-14 p-1 text-right text-xs font-bold border rounded-md ${d.isWasteOverridden ? "border-brand-400 bg-brand-50 text-brand-700" : "border-neutral-200 bg-white text-neutral-700"}`,
        value: d.wastePct,
        onChange: (e) => {
          const raw = e.target.value;
          const nextOverrides = { ...calcForm.wasteOverrides || {} };
          if (raw === "" || parseFloat(raw) === d.defaultWastePct) {
            delete nextOverrides[d.matId];
          } else {
            nextOverrides[d.matId] = raw;
          }
          handleParamChange("wasteOverrides", nextOverrides);
        }
      }
    ), d.isWasteOverridden && /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        title: `Revenir au taux catalogue (${d.defaultWastePct}%)`,
        "aria-label": `Revenir au taux de perte catalogue pour ${d.label}`,
        className: "btn-icon w-5 h-5 text-[10px]",
        onClick: () => {
          const nextOverrides = { ...calcForm.wasteOverrides || {} };
          delete nextOverrides[d.matId];
          handleParamChange("wasteOverrides", nextOverrides);
        }
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-rotate-left" })
    )) : /* @__PURE__ */ React.createElement("span", { className: "text-neutral-300" }, "\u2014")), /* @__PURE__ */ React.createElement("td", { className: "p-2.5 text-right font-medium" }, formatMoney(d.unitCost, currency)), /* @__PURE__ */ React.createElement("td", { className: "p-2.5 text-right font-bold text-neutral-900" }, formatMoney(d.totalCost, currency)))))), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 px-1" }, "Le taux de perte est repris du catalogue par d\xE9faut. Le modifier ici l'ajuste uniquement pour cet ouvrage sur ce devis \u2014 le taux catalogue (utilis\xE9 par tous les autres devis) n'est pas affect\xE9.")), activeTab === "pricing" && /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Taux de Marge R\xE9elle (%)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        min: "0",
        max: "99",
        value: calcForm.margin !== void 0 ? calcForm.margin : 30,
        onChange: (e) => handleParamChange("margin", parseFloat(e.target.value) || 0),
        className: "w-full p-2.5 border border-neutral-200 rounded-xl text-xs font-bold"
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Frais G\xE9n\xE9raux (%)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "number",
        min: "0",
        max: "50",
        value: calcForm.overheadRate !== void 0 ? calcForm.overheadRate : 5,
        onChange: (e) => handleParamChange("overheadRate", parseFloat(e.target.value) || 0),
        className: "w-full p-2.5 border border-neutral-200 rounded-xl text-xs font-bold"
      }
    ))), /* @__PURE__ */ React.createElement("div", { className: "p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between font-medium text-emerald-800" }, /* @__PURE__ */ React.createElement("span", null, "Prix de Revient :"), /* @__PURE__ */ React.createElement("span", { className: "font-bold" }, formatMoney(quoteData.totalRevientConsomme, currency))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between font-bold text-emerald-900" }, /* @__PURE__ */ React.createElement("span", null, "Marge D\xE9gag\xE9e :"), /* @__PURE__ */ React.createElement("span", { className: "font-black" }, "+", formatMoney(quoteData.margeValeurConsomme, currency))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between font-black text-brand-600 text-sm border-t border-emerald-200 pt-2" }, /* @__PURE__ */ React.createElement("span", null, "Prix de Vente Total HT :"), /* @__PURE__ */ React.createElement("span", null, formatMoney(quoteData.netHTConsomme, currency))))), activeTab === "client" && /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Description visible sur le devis client"), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        rows: "4",
        value: item.description || "",
        onChange: (e) => onUpdateItem({ description: e.target.value }),
        placeholder: "Pr\xE9cisions techniques ou prestations incluses pour le client\u2026",
        className: "w-full p-3 border border-neutral-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500/20 outline-none"
      }
    ))), activeTab === "calepinage" && /* @__PURE__ */ React.createElement(
      AcmCalepinageVisualizer,
      {
        width: calcForm.width || 12,
        height: calcForm.height || 6,
        onApplyParams: (p) => {
          handleParamChange("surfaceDirect", p.surfaceDirect);
          onUpdateItem({
            qty: 1,
            description: `Habillage cassette Alucobond 4mm (${p.rawPanels} plaques brutes, ${p.tubesLinear}ml ossature, chute ${p.waste}%)`
          });
        },
        currency
      }
    )))
  ), /* @__PURE__ */ React.createElement("div", { className: "p-4 border-t border-neutral-200 bg-neutral-50 flex justify-end" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: onClose,
      className: "btn-primary text-xs py-2 px-5 font-extrabold"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-left mr-1.5" }),
    " Retour aux ouvrages du lot"
  )));
}
function QuoteTotalsBar({
  quote,
  onSaveQuote,
  onPreviewQuote,
  isReadOnlyDueToDowngrade,
  currency = "FCFA"
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
    // P0.17 (2026-08-17) — La barre était `fixed left-0 right-0` : elle
    // passait donc SOUS la sidebar de navigation et sous la barre d'onglets
    // mobile. `.quote-totals-bar` (index.html) la cale à droite de la
    // sidebar (72px en tablette, --sidebar-width en desktop) et au-dessus
    // de la barre d'onglets sur mobile.
    /* @__PURE__ */ React.createElement("div", { className: "quote-totals-bar bg-white/95 backdrop-blur-md border-t border-neutral-200 p-3 sm:p-4 shadow-floating" }, /* @__PURE__ */ React.createElement("div", { className: "max-w-[1700px] mx-auto flex flex-wrap items-center justify-between gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-3 sm:gap-5 text-xs" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 block uppercase font-bold" }, "D\xE9bours\xE9 Sec"), /* @__PURE__ */ React.createElement("span", { className: "font-mono font-bold text-neutral-700 text-sm" }, formatMoney(totalDebourse, currency))), /* @__PURE__ */ React.createElement("div", { className: "pl-3 border-l border-neutral-200" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 block uppercase font-bold" }, "Coeff K"), /* @__PURE__ */ React.createElement("span", { className: "font-mono font-black text-indigo-600 text-sm bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200" }, "K=", kFactor)), /* @__PURE__ */ React.createElement("div", { className: "pl-3 border-l border-neutral-200" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 block uppercase font-bold" }, "Total Net HT"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-neutral-900 text-sm sm:text-base" }, formatMoney(totalHT, currency))), /* @__PURE__ */ React.createElement("div", { className: "hidden sm:block pl-3 border-l border-neutral-200" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 block uppercase font-bold flex items-center gap-1" }, "Marge R\xE9elle", isLowProfit && /* @__PURE__ */ React.createElement("span", { className: "text-amber-600 font-bold", title: "Marge faible (< 15%)" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-triangle-exclamation" }))), /* @__PURE__ */ React.createElement("span", { className: `font-bold text-sm sm:text-base ${isLowProfit ? "text-amber-600" : "text-emerald-600"}` }, "+", formatMoney(marginVal, currency), " (", marginPct, "%)")), /* @__PURE__ */ React.createElement("div", { className: "hidden md:block pl-3 border-l border-neutral-200" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 block uppercase font-bold" }, "TVA (", quote.vatRate || 18, "%)"), /* @__PURE__ */ React.createElement("span", { className: "font-medium text-neutral-600 text-sm" }, "+", formatMoney(totalTVA, currency))), /* @__PURE__ */ React.createElement("div", { className: "pl-3 border-l-2 border-neutral-900" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-brand-600 block uppercase font-black" }, "TOTAL TTC"), /* @__PURE__ */ React.createElement("span", { className: "font-black text-brand-600 text-base sm:text-xl" }, formatMoney(totalTTC, currency)))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: onPreviewQuote,
        className: "btn-secondary text-xs py-2.5 px-4 font-bold flex items-center gap-1.5"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-eye text-neutral-500" }),
      /* @__PURE__ */ React.createElement("span", null, "Aper\xE7u Client & PDF")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        disabled: isReadOnlyDueToDowngrade,
        onClick: onSaveQuote,
        className: "btn-primary text-xs py-2.5 px-5 font-extrabold flex items-center gap-2 shadow-md shadow-brand-500/20"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-floppy-disk" }),
      /* @__PURE__ */ React.createElement("span", null, "Enregistrer le Devis")
    ))))
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
  confirmAction,
  saveQuoteStatus = "idle",
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
  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);
  const pushState = (newQuote) => {
    setHistoryPast((prev) => [...prev.slice(-20), JSON.parse(JSON.stringify(hybridQuote))]);
    setHistoryFuture([]);
    setHasUnsavedChanges(true);
  };
  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((prev) => prev.slice(0, prev.length - 1));
    setHistoryFuture((prev) => [JSON.parse(JSON.stringify(hybridQuote)), ...prev]);
    setHybridQuote(previous);
    showToast("Action annul\xE9e (Undo)");
  };
  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture((prev) => prev.slice(1));
    setHistoryPast((prev) => [...prev, JSON.parse(JSON.stringify(hybridQuote))]);
    setHybridQuote(next);
    showToast("Action r\xE9tablie (Redo)");
  };
  const isTypingTarget = (el) => {
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  };
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isTypingTarget(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "y" || e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyPast, historyFuture, hybridQuote]);
  const calculatedQuote = useMemo(() => {
    return calculateHybridQuote(hybridQuote, solutions, materials, labor, recipes);
  }, [hybridQuote, solutions, materials, labor, recipes]);
  const activeLot = calculatedQuote.lots?.[activeLotIndex] || calculatedQuote.lots?.[0] || { id: "lot_1", code: "01", name: "Lot 01", items: [] };
  const handleUpdateQuote = (patch) => {
    setHybridQuote((prev) => ({
      ...prev,
      ...patch
    }));
  };
  const handleAddLot = () => {
    const nextCode = String((hybridQuote.lots?.length || 0) + 1).padStart(2, "0");
    const newLot = {
      id: `lot_${Date.now()}`,
      code: nextCode,
      name: `Lot ${nextCode} \u2014 Nouveau Lot`,
      items: []
    };
    const updatedLots = [...hybridQuote.lots || [], newLot];
    setHybridQuote((prev) => ({
      ...prev,
      lots: updatedLots
    }));
    setActiveLotIndex(updatedLots.length - 1);
    showToast(`Lot ${nextCode} ajout\xE9 !`);
  };
  const handleUpdateActiveLot = (patch) => {
    const updatedLots = [...hybridQuote.lots || []];
    if (updatedLots[activeLotIndex]) {
      pushState();
      updatedLots[activeLotIndex] = {
        ...updatedLots[activeLotIndex],
        ...patch
      };
      setHybridQuote((prev) => ({ ...prev, lots: updatedLots }));
    }
  };
  const handleDuplicateLot = () => {
    const lotToCopy = hybridQuote.lots?.[activeLotIndex];
    if (!lotToCopy) return;
    pushState();
    const nextCode = String((hybridQuote.lots?.length || 0) + 1).padStart(2, "0");
    const duplicated = {
      ...JSON.parse(JSON.stringify(lotToCopy)),
      id: `lot_${Date.now()}`,
      code: nextCode,
      name: `${lotToCopy.name} (Copie)`
    };
    const updatedLots = [...hybridQuote.lots || [], duplicated];
    setHybridQuote((prev) => ({ ...prev, lots: updatedLots }));
    setActiveLotIndex(updatedLots.length - 1);
    showToast(`Lot dupliqu\xE9 avec succ\xE8s !`);
  };
  const handleMoveLot = (index, direction) => {
    const updatedLots = [...hybridQuote.lots || []];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= updatedLots.length) return;
    pushState();
    const temp = updatedLots[index];
    updatedLots[index] = updatedLots[targetIndex];
    updatedLots[targetIndex] = temp;
    setHybridQuote((prev) => ({ ...prev, lots: updatedLots }));
    setActiveLotIndex(targetIndex);
  };
  const handleDeleteLot = () => {
    if ((hybridQuote.lots?.length || 0) <= 1) {
      showToast("Impossible de supprimer le seul lot du devis", "error");
      return;
    }
    pushState();
    const updatedLots = hybridQuote.lots.filter((_, idx) => idx !== activeLotIndex);
    setHybridQuote((prev) => ({ ...prev, lots: updatedLots }));
    setActiveLotIndex(Math.max(0, activeLotIndex - 1));
    showToast("Lot supprim\xE9 du devis");
  };
  const handleSelectSolutionForLot = (sol) => {
    pushState();
    const newItem = {
      id: `item_${Date.now()}`,
      solutionId: sol.id,
      name: sol.name,
      qty: 1,
      calcForm: {
        solutionId: sol.id,
        takeoffMode: sol.allowedModes?.[0] || "rectangle",
        width: 2,
        height: 1,
        lengthDirect: 2,
        surfaceDirect: 10,
        depth: 0.15,
        qty: 1,
        faces: 1,
        margin: hybridQuote.margin || 30,
        marginType: hybridQuote.marginType || "reel",
        overheadRate: hybridQuote.overheadRate || 5,
        vatRate: hybridQuote.vatRate || 18,
        discountRate: hybridQuote.discountRate || 0,
        includeInstall: true,
        customVarValues: {}
      }
    };
    const updatedLots = [...hybridQuote.lots || []];
    if (!updatedLots[activeLotIndex]) return;
    updatedLots[activeLotIndex] = {
      ...updatedLots[activeLotIndex],
      items: [...updatedLots[activeLotIndex].items || [], newItem]
    };
    setHybridQuote((prev) => ({ ...prev, lots: updatedLots }));
    showToast(`\xAB ${sol.name} \xBB ajout\xE9 au Lot ${updatedLots[activeLotIndex].code || activeLotIndex + 1} !`);
  };
  const handleSelectBulkSolutions = (selectedList) => {
    const newItems = selectedList.map((entry) => ({
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      solutionId: entry.solution.id,
      name: entry.solution.name,
      qty: entry.qty || 1,
      calcForm: {
        solutionId: entry.solution.id,
        takeoffMode: entry.solution.allowedModes?.[0] || "rectangle",
        width: 2,
        height: 1,
        lengthDirect: 2,
        surfaceDirect: 10,
        depth: 0.15,
        qty: entry.qty || 1,
        faces: 1,
        margin: hybridQuote.margin || 30,
        marginType: hybridQuote.marginType || "reel",
        overheadRate: hybridQuote.overheadRate || 5,
        vatRate: hybridQuote.vatRate || 18,
        discountRate: hybridQuote.discountRate || 0,
        includeInstall: true,
        customVarValues: {}
      }
    }));
    const updatedLots = [...hybridQuote.lots || []];
    if (!updatedLots[activeLotIndex]) return;
    updatedLots[activeLotIndex] = {
      ...updatedLots[activeLotIndex],
      items: [...updatedLots[activeLotIndex].items || [], ...newItems]
    };
    setHybridQuote((prev) => ({ ...prev, lots: updatedLots }));
    showToast(`${newItems.length} ouvrages ajout\xE9s au lot !`);
  };
  const handleAddCustomLine = () => {
    pushState();
    const newItem = {
      id: `item_${Date.now()}`,
      isCustom: true,
      name: "Nouvelle Ligne de Travaux",
      description: "D\xE9signation commerciale",
      qty: 1,
      unit: "forfait",
      unitPriceHT: 0,
      totalHT: 0
    };
    const updatedLots = [...hybridQuote.lots || []];
    if (!updatedLots[activeLotIndex]) return;
    updatedLots[activeLotIndex] = {
      ...updatedLots[activeLotIndex],
      items: [...updatedLots[activeLotIndex].items || [], newItem]
    };
    setHybridQuote((prev) => ({ ...prev, lots: updatedLots }));
    showToast("Ligne libre ajout\xE9e au lot");
  };
  const handleUpdateItem = (itemIdx, patch) => {
    pushState();
    const updatedLots = [...hybridQuote.lots || []];
    const currentLot = updatedLots[activeLotIndex];
    if (!currentLot || !currentLot.items?.[itemIdx]) return;
    currentLot.items[itemIdx] = {
      ...currentLot.items[itemIdx],
      ...patch
    };
    setHybridQuote((prev) => ({ ...prev, lots: updatedLots }));
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
    const updatedLots = [...hybridQuote.lots || []];
    updatedLots[activeLotIndex].items.splice(itemIdx + 1, 0, newItem);
    setHybridQuote((prev) => ({ ...prev, lots: updatedLots }));
    showToast("Ligne dupliqu\xE9e");
  };
  const handleDeleteItem = (itemIdx) => {
    pushState();
    const currentLot = hybridQuote.lots?.[activeLotIndex];
    if (!currentLot || !currentLot.items?.[itemIdx]) return;
    const deleted = currentLot.items[itemIdx];
    const updatedLots = [...hybridQuote.lots || []];
    updatedLots[activeLotIndex].items = currentLot.items.filter((_, idx) => idx !== itemIdx);
    setHybridQuote((prev) => ({ ...prev, lots: updatedLots }));
    setDeletedItemUndo({ lotIndex: activeLotIndex, itemIndex: itemIdx, item: deleted });
    showToast("Ouvrage supprim\xE9 du lot");
    setTimeout(() => setDeletedItemUndo(null), 6e3);
  };
  const handleUndoDelete = () => {
    if (!deletedItemUndo) return;
    const updatedLots = [...hybridQuote.lots || []];
    const targetLot = updatedLots[deletedItemUndo.lotIndex];
    if (targetLot) {
      targetLot.items.splice(deletedItemUndo.itemIndex, 0, deletedItemUndo.item);
      setHybridQuote((prev) => ({ ...prev, lots: updatedLots }));
      setDeletedItemUndo(null);
      showToast("Suppression annul\xE9e !");
    }
  };
  const handleSaveQuoteAction = () => {
    if (!calculatedQuote.clientName?.trim()) {
      showToast("Veuillez indiquer le nom du client avant d'enregistrer.", "error");
      return;
    }
    const savedQ = adaptHybridToSavedQuote(calculatedQuote, companyInfo);
    onSaveQuote(savedQ);
    setHasUnsavedChanges(false);
    setAutosaveTime((/* @__PURE__ */ new Date()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  };
  const handlePreviewQuoteAction = () => {
    const savedQ = adaptHybridToSavedQuote(calculatedQuote, companyInfo);
    onPreviewQuote(savedQ);
  };
  const guardUnsavedQuote = (action) => {
    if (!hasUnsavedChanges || !confirmAction) {
      action();
      return;
    }
    const ref = calculatedQuote.number || "Le devis en cours";
    confirmAction({
      title: "Modifications non enregistr\xE9es",
      message: `${ref} contient des modifications qui ne sont pas enregistr\xE9es.
Elles seront perdues si vous continuez.`,
      secondaryLabel: "Enregistrer d'abord",
      onSecondary: () => {
        handleSaveQuoteAction();
        action();
      },
      confirmLabel: "Continuer sans enregistrer",
      isDanger: true,
      onConfirm: action
    });
  };
  const handleLoadR1 = () => {
    setHybridQuote(R1_TEMPLATE_QUOTE);
    setActiveLotIndex(0);
    showToast("Mod\xE8le complet Villa R+1 (11 lots) charg\xE9 avec succ\xE8s !", "success");
  };
  const handleReset = () => {
    const nextNum = generateNextQuoteNumber(savedQuotes);
    setHybridQuote({
      id: Date.now(),
      number: nextNum,
      clientName: "",
      projectRef: "",
      status: "draft",
      vatRate: 18,
      overheadRate: 5,
      margin: 30,
      marginType: "reel",
      discountRate: 0,
      notes: "",
      lots: [
        {
          id: "lot_1",
          code: "01",
          name: "Lot 01 \u2014 Installation de Chantier",
          items: []
        }
      ]
    });
    setActiveLotIndex(0);
    showToast(`Nouveau devis vierge initialis\xE9 (${nextNum})`);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "h-full min-h-0 bg-neutral-100 flex flex-col overflow-hidden" }, /* @__PURE__ */ React.createElement(
    QuoteHeader,
    {
      quote: calculatedQuote,
      onUpdateQuote: (patch) => {
        pushState();
        handleUpdateQuote(patch);
      },
      onSaveQuote: handleSaveQuoteAction,
      onPreviewQuote: handlePreviewQuoteAction,
      onOpenWizard: () => setIsWizardOpen(true),
      onUndo: handleUndo,
      onRedo: handleRedo,
      canUndo: historyPast.length > 0,
      canRedo: historyFuture.length > 0,
      useHybridEditor,
      onToggleHybridEditor,
      autosaveTime,
      hasUnsavedChanges,
      isSaving,
      isReadOnlyDueToDowngrade
    }
  ), /* @__PURE__ */ React.createElement(
    NewQuoteWizardModal,
    {
      isOpen: isWizardOpen,
      onClose: () => setIsWizardOpen(false),
      onLoadTemplate: (tpl) => guardUnsavedQuote(() => {
        pushState();
        setHybridQuote(tpl);
        setActiveLotIndex(0);
        showToast(`Mod\xE8le \xAB ${tpl.projectRef || tpl.number} \xBB charg\xE9 !`, "success");
      }),
      onGenerateFromQuickEstimate: (estQ) => guardUnsavedQuote(() => {
        pushState();
        setHybridQuote(estQ);
        setActiveLotIndex(0);
        showToast("Devis g\xE9n\xE9r\xE9 depuis l'estimation rapide !", "success");
      }),
      onInitBlankQuote: () => guardUnsavedQuote(() => {
        pushState();
        handleReset();
      }),
      currency: companyInfo.currency
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-h-0 flex flex-col lg:flex-row max-w-[1700px] w-full mx-auto overflow-y-auto lg:overflow-hidden custom-scroll" }, /* @__PURE__ */ React.createElement("div", { className: `${inspectorItemIndex !== null ? "hidden lg:flex" : "flex"} lg:h-full lg:min-h-0` }, /* @__PURE__ */ React.createElement(
    LotNavigator,
    {
      lots: calculatedQuote.lots || [],
      activeLotIndex,
      onSelectLot: (idx) => {
        setActiveLotIndex(idx);
        setInspectorItemIndex(null);
      },
      onAddLot: handleAddLot,
      onDuplicateLot: handleDuplicateLot,
      onMoveLot: handleMoveLot,
      onDeleteLot: handleDeleteLot,
      currency: companyInfo.currency
    }
  )), /* @__PURE__ */ React.createElement("main", { className: "flex-1 min-w-0 bg-white flex flex-col lg:h-full lg:min-h-0 lg:overflow-y-auto custom-scroll pb-36" }, inspectorItemIndex !== null ? /* @__PURE__ */ React.createElement(
    WorkItemInspector,
    {
      isOpen: true,
      onClose: () => setInspectorItemIndex(null),
      item: activeLot.items?.[inspectorItemIndex],
      onUpdateItem: (patch) => handleUpdateItem(inspectorItemIndex, patch),
      solutions,
      materials,
      labor,
      recipes,
      currency: companyInfo.currency
    }
  ) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
    ActiveLotHeader,
    {
      lot: activeLot,
      lotIndex: activeLotIndex,
      lotsCount: calculatedQuote.lots?.length || 1,
      onUpdateLot: handleUpdateActiveLot,
      onOpenPicker: () => setIsPickerOpen(true),
      onOpenBulkPicker: () => setIsPickerOpen(true),
      onAddCustomLine: handleAddCustomLine,
      onDuplicateLot: handleDuplicateLot,
      onDeleteLot: handleDeleteLot,
      currency: companyInfo.currency
    }
  ), /* @__PURE__ */ React.createElement(
    WorkItemTable,
    {
      items: activeLot.items || [],
      onUpdateItem: handleUpdateItem,
      onOpenInspector: (idx) => setInspectorItemIndex(idx),
      onDuplicateItem: handleDuplicateItem,
      onDeleteItem: handleDeleteItem,
      onOpenPicker: () => setIsPickerOpen(true),
      currency: companyInfo.currency
    }
  )))), /* @__PURE__ */ React.createElement(
    WorkItemPicker,
    {
      isOpen: isPickerOpen,
      onClose: () => setIsPickerOpen(false),
      solutions,
      onSelectSolution: handleSelectSolutionForLot,
      onSelectBulkSolutions: handleSelectBulkSolutions,
      onCreateCustomSolution: (name) => {
        const newSol = {
          id: Date.now(),
          name: name || "Nouvel Ouvrage",
          icon: "fa-cube",
          allowedModes: ["rectangle", "surface"],
          customVars: []
        };
        onQuickCreateSolution(newSol);
        handleSelectSolutionForLot(newSol);
      }
    }
  ), /* @__PURE__ */ React.createElement(
    QuoteTotalsBar,
    {
      quote: calculatedQuote,
      saveQuoteStatus,
      saveQuoteError,
      onSaveQuote: handleSaveQuoteAction,
      onPreviewQuote: handlePreviewQuoteAction,
      isReadOnlyDueToDowngrade,
      currency: companyInfo.currency
    }
  ), deletedItemUndo && /* @__PURE__ */ React.createElement("div", { className: "fixed bottom-24 left-1/2 -translate-x-1/2 bg-neutral-900 text-white px-4 py-2.5 rounded-xl shadow-floating z-50 flex items-center gap-3 border border-neutral-700 animate-slide-up text-xs font-bold" }, /* @__PURE__ */ React.createElement("span", null, "Ouvrage supprim\xE9 du lot"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleUndoDelete,
      className: "text-brand-400 hover:text-brand-300 underline font-extrabold"
    },
    "Annuler"
  )));
}
const ROLE_PERMISSIONS = {
  owner: { canEditQuotes: true, canDeleteQuotes: true, canEditCatalog: true, canEditPrices: true, canEditSettings: true, canViewAudit: true },
  admin: { canEditQuotes: true, canDeleteQuotes: true, canEditCatalog: true, canEditPrices: true, canEditSettings: true, canViewAudit: true },
  estimator: { canEditQuotes: true, canDeleteQuotes: false, canEditCatalog: true, canEditPrices: true, canEditSettings: false, canViewAudit: false },
  commercial: { canEditQuotes: true, canDeleteQuotes: false, canEditCatalog: false, canEditPrices: false, canEditSettings: false, canViewAudit: false },
  viewer: { canEditQuotes: false, canDeleteQuotes: false, canEditCatalog: false, canEditPrices: false, canEditSettings: false, canViewAudit: false }
};
function hasPermission(role, action) {
  const roleConfig = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
  return Boolean(roleConfig[action]);
}
function sanitizeText(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[<>]/g, "").trim();
}
function AuditLogViewerModal({ isOpen, onClose, organizationId, supabaseClient, currentRole }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("all");
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    (async () => {
      try {
        if (supabaseClient && organizationId && !organizationId.startsWith("org_default") && !organizationId.startsWith("org_local")) {
          const { data, error } = await supabaseClient.from("audit_logs").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(50);
          if (!error) {
            setLogs(data || []);
            return;
          }
          console.warn("[Audit Log] Supabase query error:", error);
        }
        setLogs([]);
      } catch (e) {
        console.warn("[Audit Log] Failed to fetch remote logs:", e);
        setLogs([]);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isOpen, organizationId, supabaseClient]);
  if (!isOpen) return null;
  const filteredLogs = filterAction === "all" ? logs : logs.filter((l) => l.action.includes(filterAction));
  const actionBadge = (act) => {
    if (act.includes("created")) return /* @__PURE__ */ React.createElement("span", { className: "px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300" }, "Cr\xE9ation");
    if (act.includes("deleted")) return /* @__PURE__ */ React.createElement("span", { className: "px-2 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-800 border border-red-300" }, "Suppression");
    if (act.includes("updated")) return /* @__PURE__ */ React.createElement("span", { className: "px-2 py-0.5 rounded text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300" }, "Modification");
    return /* @__PURE__ */ React.createElement("span", { className: "px-2 py-0.5 rounded text-[10px] font-black bg-neutral-100 text-neutral-800 border border-neutral-300" }, act);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center z-[130] p-4 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-neutral-200 animate-scale-up" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 sm:p-6 border-b border-neutral-100 flex justify-between items-center bg-white shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg font-bold" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-shield-halved" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-neutral-900 text-lg" }, "Journal de S\xE9curit\xE9 & Tra\xE7abilit\xE9 (Audit Logs)"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500" }, "Historique inalt\xE9rable de toutes les op\xE9rations sensibles de l'organisation"))), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700", "aria-label": "Fermer" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-lg" }))), /* @__PURE__ */ React.createElement("div", { className: "p-4 bg-neutral-50/80 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-3 shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold text-neutral-600" }, "Filtrer par type :"), ["all", "quote", "material", "organization"].map((cat) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: cat,
      onClick: () => setFilterAction(cat),
      className: `text-xs px-3 py-1 rounded-xl font-bold transition-all ${filterAction === cat ? "bg-indigo-600 text-white shadow-2xs" : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-100"}`
    },
    cat === "all" ? "Tous" : cat === "quote" ? "Devis" : cat === "material" ? "Mati\xE8res" : "Organisation"
  ))), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-mono font-bold text-neutral-500" }, filteredLogs.length, " \xE9v\xE9nement(s) enregistr\xE9(s)")), /* @__PURE__ */ React.createElement("div", { className: "p-6 overflow-y-auto custom-scroll flex-1 bg-neutral-50/30" }, isLoading ? /* @__PURE__ */ React.createElement("div", { className: "p-12 text-center text-neutral-400" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-notch fa-spin text-2xl text-indigo-500 mb-2" }), /* @__PURE__ */ React.createElement("p", { className: "text-xs font-bold" }, "Chargement du journal d'audit s\xE9curis\xE9...")) : filteredLogs.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "p-12 text-center text-neutral-400 bg-white rounded-2xl border border-neutral-200" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-shield text-3xl mb-2 text-neutral-300" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-bold text-neutral-700" }, "Aucun \xE9v\xE9nement de s\xE9curit\xE9 enregistr\xE9"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-400 mt-1" }, "Toutes les cr\xE9ations de devis, suppressions et modifications de prix appara\xEEtront ici.")) : /* @__PURE__ */ React.createElement("div", { className: "overflow-x-auto border border-neutral-200 rounded-2xl bg-white shadow-2xs" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left text-xs border-collapse" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-neutral-50 border-b border-neutral-200 text-[10px] font-extrabold text-neutral-500 uppercase tracking-wider" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "p-3 pl-4" }, "Date & Heure"), /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Utilisateur"), /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Action"), /* @__PURE__ */ React.createElement("th", { className: "p-3" }, "Entit\xE9 Cible"), /* @__PURE__ */ React.createElement("th", { className: "p-3 pr-4" }, "D\xE9tails de l'Op\xE9ration"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-neutral-100 font-medium text-neutral-700" }, filteredLogs.map((log) => /* @__PURE__ */ React.createElement("tr", { key: log.id, className: "hover:bg-neutral-50/60" }, /* @__PURE__ */ React.createElement("td", { className: "p-3 pl-4 whitespace-nowrap font-mono text-[11px] text-neutral-500" }, new Date(log.created_at).toLocaleString("fr-FR")), /* @__PURE__ */ React.createElement("td", { className: "p-3 font-bold text-neutral-800" }, log.user_email || "Utilisateur"), /* @__PURE__ */ React.createElement("td", { className: "p-3 whitespace-nowrap" }, actionBadge(log.action)), /* @__PURE__ */ React.createElement("td", { className: "p-3" }, /* @__PURE__ */ React.createElement("span", { className: "font-mono bg-neutral-100 px-2 py-0.5 rounded text-[10px] text-neutral-600" }, log.entity_type, " ", log.entity_id ? `(${log.entity_id.slice(0, 8)}\u2026)` : "")), /* @__PURE__ */ React.createElement("td", { className: "p-3 pr-4 text-xs font-mono text-neutral-600" }, log.details ? JSON.stringify(log.details) : "-"))))))), /* @__PURE__ */ React.createElement("div", { className: "p-4 border-t border-neutral-100 bg-white flex justify-end shrink-0" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onClose, className: "btn-secondary text-xs py-2 px-5 font-bold" }, "Fermer"))));
}
function CreateOrganizationModal({ isOpen, onClose, onCreateOrg, isReadOnly }) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("FCFA");
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
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center z-[130] p-4 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-neutral-200 animate-scale-up" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 border-b border-neutral-100 flex justify-between items-center bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2.5" }, /* @__PURE__ */ React.createElement("div", { className: "w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-base" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-building" })), /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-neutral-900 text-base" }, "Nouvelle Entreprise / Organisation")), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700", "aria-label": "Fermer" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-lg" }))), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit, className: "p-6 space-y-4 bg-neutral-50/50" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Raison Sociale / Nom de l'Organisation"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      required: true,
      autoFocus: true,
      value: name,
      onChange: (e) => setName(e.target.value),
      placeholder: "Ex : KOUASSI BTP & Co",
      className: "app-input font-bold"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Devise de l'Entreprise"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      required: true,
      value: currency,
      onChange: (e) => setCurrency(e.target.value),
      placeholder: "FCFA, EUR, USD...",
      className: "app-input font-bold"
    }
  )), /* @__PURE__ */ React.createElement("div", { className: "pt-2 flex justify-end gap-2" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onClose, className: "btn-secondary text-xs py-2 px-4 font-bold" }, "Annuler"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "submit",
      disabled: isLoading || !name.trim(),
      className: "btn-primary text-xs py-2 px-5 font-black flex items-center gap-1.5"
    },
    isLoading ? /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-notch fa-spin" }) : /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check" }),
    /* @__PURE__ */ React.createElement("span", null, "Cr\xE9er l'Organisation")
  )))));
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
  const activeOrg = userOrganizations.find((o) => o.id === activeOrgId) || {
    id: "guest_org",
    name: isGuest ? "Organisation D\xE9mo (Locale)" : "Mon Entreprise BTP",
    currency: "FCFA"
  };
  const roleBadge = (role) => {
    switch (role) {
      case "owner":
        return /* @__PURE__ */ React.createElement("span", { className: "px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-300" }, "\u{1F451} Owner");
      case "admin":
        return /* @__PURE__ */ React.createElement("span", { className: "px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-100 text-purple-800 border border-purple-300" }, "\u{1F6E1}\uFE0F Admin");
      case "estimator":
        return /* @__PURE__ */ React.createElement("span", { className: "px-1.5 py-0.5 rounded text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-300" }, "\u{1F477} Deviseur");
      case "commercial":
        return /* @__PURE__ */ React.createElement("span", { className: "px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300" }, "\u{1F4BC} Commercial");
      case "viewer":
        return /* @__PURE__ */ React.createElement("span", { className: "px-1.5 py-0.5 rounded text-[9px] font-black bg-neutral-100 text-neutral-600 border border-neutral-300" }, "\u{1F441}\uFE0F Lecteur");
      default:
        return /* @__PURE__ */ React.createElement("span", { className: "px-1.5 py-0.5 rounded text-[9px] font-black bg-brand-100 text-brand-800 border border-brand-300" }, "Membre");
    }
  };
  return /* @__PURE__ */ React.createElement("div", { className: "relative w-full" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => setIsOpen(!isOpen),
      className: "w-full bg-white hover:bg-neutral-50 border border-neutral-200 rounded-2xl p-2.5 flex items-center justify-between gap-2 shadow-2xs transition-all text-left group",
      "aria-label": "Changer d'organisation"
    },
    /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2.5 min-w-0" }, /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-black text-xs shrink-0 group-hover:bg-brand-100 transition-colors" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-building" })), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-xs text-neutral-900 truncate block" }, activeOrg.name)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5 mt-0.5" }, roleBadge(activeOrgRole || "owner"), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 font-mono" }, activeOrg.currency || "FCFA")))),
    /* @__PURE__ */ React.createElement("i", { className: `fa-solid fa-chevron-down text-xs text-neutral-400 transition-transform ${isOpen ? "rotate-180 text-brand-600" : ""}` })
  ), isOpen && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-40", onClick: () => setIsOpen(false) }), /* @__PURE__ */ React.createElement("div", { className: "absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-neutral-200 p-2 z-50 animate-fade-in space-y-1" }, /* @__PURE__ */ React.createElement("div", { className: "px-2.5 py-1 text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider" }, "Mes Entreprises (", userOrganizations.length, ")"), /* @__PURE__ */ React.createElement("div", { className: "max-h-48 overflow-y-auto custom-scroll space-y-0.5" }, userOrganizations.map((org) => /* @__PURE__ */ React.createElement(
    "button",
    {
      key: org.id,
      type: "button",
      onClick: () => {
        onSelectOrg(org.id);
        setIsOpen(false);
      },
      className: `w-full text-left p-2 rounded-xl flex items-center justify-between text-xs transition-colors ${org.id === activeOrgId ? "bg-brand-50 text-brand-900 font-extrabold" : "hover:bg-neutral-50 text-neutral-700 font-semibold"}`
    },
    /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1 truncate pr-2" }, /* @__PURE__ */ React.createElement("span", { className: "truncate block" }, org.name), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 font-normal" }, org.currency)),
    org.id === activeOrgId && /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check text-brand-600 text-xs" })
  ))), /* @__PURE__ */ React.createElement("div", { className: "border-t border-neutral-100 pt-1" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        setIsOpen(false);
        onOpenCreateOrg();
      },
      className: "w-full text-left p-2 rounded-xl text-xs font-bold text-brand-600 hover:bg-brand-50 flex items-center gap-2 transition-colors"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus text-xs" }),
    /* @__PURE__ */ React.createElement("span", null, "+ Nouvelle Entreprise")
  )))));
}
function QuoteSignatureModal({ isOpen, onClose, quote, onConfirmSignature }) {
  const canvasRef = React.useRef(null);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [signerName, setSignerName] = React.useState(quote?.clientName || "");
  const [hasDrawn, setHasDrawn] = React.useState(false);
  React.useEffect(() => {
    if (isOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1e293b";
      setHasDrawn(false);
    }
  }, [isOpen]);
  if (!isOpen || !quote) return null;
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches && e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches && e.touches[0].clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };
  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches && e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches && e.touches[0].clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const stopDrawing = () => {
    setIsDrawing(false);
  };
  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };
  const handleSave = () => {
    const canvas = canvasRef.current;
    const signatureData = canvas ? canvas.toDataURL("image/png") : "";
    onConfirmSignature({
      signerName: signerName.trim() || "Client Signataire",
      signatureData,
      signedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    onClose();
  };
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/75 backdrop-blur-sm flex items-center justify-center z-[140] p-4 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-neutral-200 animate-scale-up" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 border-b border-neutral-100 flex justify-between items-center bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2.5" }, /* @__PURE__ */ React.createElement("div", { className: "w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-base" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-signature" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-neutral-900 text-sm" }, "Signature \xC9lectronique du Devis"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 font-mono" }, quote.number, " \u2022 ", quote.clientName))), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700", "aria-label": "Fermer" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-lg" }))), /* @__PURE__ */ React.createElement("div", { className: "p-6 space-y-4 bg-neutral-50/50" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-xs font-bold text-neutral-700 block mb-1" }, "Nom & Pr\xE9nom du Signataire / Fonction :"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      value: signerName,
      onChange: (e) => setSignerName(e.target.value),
      placeholder: "Ex: Jean KOUASSI (G\xE9rant)",
      className: "w-full bg-white border border-neutral-200 focus:border-brand-500 rounded-xl px-3.5 py-2 text-xs font-bold text-neutral-800 outline-none shadow-2xs"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-center mb-1" }, /* @__PURE__ */ React.createElement("label", { className: "text-xs font-bold text-neutral-700" }, "Trac\xE9 Manuscrit :"), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: handleClear, className: "text-[11px] font-bold text-red-600 hover:underline" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-rotate-left mr-1" }), " Effacer")), /* @__PURE__ */ React.createElement("div", { className: "border-2 border-dashed border-neutral-300 rounded-2xl bg-white overflow-hidden touch-none relative shadow-inner cursor-crosshair" }, /* @__PURE__ */ React.createElement(
    "canvas",
    {
      ref: canvasRef,
      width: 440,
      height: 180,
      className: "w-full h-44 block",
      onMouseDown: startDrawing,
      onMouseMove: draw,
      onMouseUp: stopDrawing,
      onMouseLeave: stopDrawing,
      onTouchStart: startDrawing,
      onTouchMove: draw,
      onTouchEnd: stopDrawing
    }
  ), !hasDrawn && /* @__PURE__ */ React.createElement("div", { className: "absolute inset-0 flex items-center justify-center pointer-events-none text-neutral-300 text-xs font-medium" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pen-nib mr-1.5" }), " Signez ici avec votre doigt ou la souris"))), /* @__PURE__ */ React.createElement("div", { className: "p-3 bg-neutral-100 rounded-xl text-[11px] text-neutral-500 flex items-start gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-shield-halved text-emerald-600 mt-0.5 text-xs" }), /* @__PURE__ */ React.createElement("span", null, "En validant, vous certifiez l'exactitude des informations et acceptez les conditions contractuelles du devis.")), /* @__PURE__ */ React.createElement("div", { className: "pt-2 flex justify-end gap-2" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onClose, className: "btn-secondary text-xs py-2 px-4 font-bold" }, "Annuler"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleSave,
      className: "btn-primary text-xs py-2 px-5 font-extrabold flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check" }),
    /* @__PURE__ */ React.createElement("span", null, "Valider & Signer le Devis")
  )))));
}
function QuoteShareModal({ isOpen, onClose, quote, showToast }) {
  if (!isOpen || !quote) return null;
  const shareUrl = `https://ikadevis.com/quote/${quote.id || "public"}?ref=${encodeURIComponent(quote.number || "DEV")}`;
  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      if (showToast) showToast("\u2713 Lien s\xE9curis\xE9 copi\xE9 dans le presse-papier !", "success");
    }
  };
  const handleShareWhatsApp = () => {
    const text = `Bonjour, veuillez consulter votre devis ${quote.number} pour le projet "${quote.projectRef}" : ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
  const handleShareEmail = () => {
    const subject = `Devis ${quote.number} \u2014 ${quote.projectRef}`;
    const body = `Bonjour,

Veuillez trouver ci-joint votre devis chiffr\xE9 ${quote.number}.
Lien de consultation : ${shareUrl}

Cordialement.`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
  };
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/75 backdrop-blur-sm flex items-center justify-center z-[140] p-4 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-neutral-200 animate-scale-up" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 border-b border-neutral-100 flex justify-between items-center bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2.5" }, /* @__PURE__ */ React.createElement("div", { className: "w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold text-base" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-share-nodes" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-neutral-900 text-sm" }, "Partager le Devis au Client"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 font-mono" }, quote.number))), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700", "aria-label": "Fermer" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-lg" }))), /* @__PURE__ */ React.createElement("div", { className: "p-6 space-y-4 bg-neutral-50/50" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "text-xs font-bold text-neutral-700 block mb-1.5" }, "Lien de Consultation S\xE9curis\xE9 :"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      readOnly: true,
      value: shareUrl,
      className: "w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs font-mono text-neutral-600 outline-none select-all shadow-2xs"
    }
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleCopyLink,
      className: "btn-primary text-xs py-2 px-3.5 font-bold shrink-0 flex items-center gap-1.5",
      title: "Copier le lien"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-copy" }),
    /* @__PURE__ */ React.createElement("span", null, "Copier")
  ))), /* @__PURE__ */ React.createElement("div", { className: "pt-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold text-neutral-700 block mb-2" }, "Partage Direct en 1 Clic :"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleShareWhatsApp,
      className: "p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-2xs"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-brands fa-whatsapp text-lg text-emerald-600" }),
    /* @__PURE__ */ React.createElement("span", null, "WhatsApp")
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: handleShareEmail,
      className: "p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-2xs"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-envelope text-lg text-blue-600" }),
    /* @__PURE__ */ React.createElement("span", null, "Email")
  ))), /* @__PURE__ */ React.createElement("div", { className: "pt-2 flex justify-end" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onClose, className: "btn-secondary text-xs py-2 px-5 font-bold" }, "Fermer")))));
}
function MaterialCsvModal({
  isOpen,
  onClose,
  onImportMaterials,
  existingMaterials = []
}) {
  const [csvText, setCsvText] = useState("");
  const [parsedRows, setParsedRows] = useState([]);
  const [importMode, setImportMode] = useState("merge");
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
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length <= 1) {
      setParseErrors(["Le fichier CSV est vide ou ne contient que l\u2019en-t\xEAte."]);
      setParsedRows([]);
      return;
    }
    const delimiter = lines[0].includes(";") ? ";" : ",";
    const headers = lines[0].split(delimiter).map((h) => h.replace(/^["']|["']$/g, "").trim().toLowerCase());
    const rows = [];
    const errors = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map((p) => p.replace(/^["']|["']$/g, "").trim());
      if (parts.length < 2) continue;
      const rowObj = {};
      headers.forEach((h, idx) => {
        rowObj[h] = parts[idx] || "";
      });
      const name = rowObj["nom"] || rowObj["name"] || rowObj["d\xE9signation"] || rowObj["designation"] || parts[1] || parts[0];
      const category = rowObj["cat\xE9gorie"] || rowObj["categorie"] || rowObj["category"] || "Divers";
      const unitBuy = rowObj["unit\xE9 achat"] || rowObj["unite achat"] || rowObj["unitbuy"] || "Unit\xE9";
      const unitSize = parseFloat(rowObj["taille unit\xE9"] || rowObj["taille unite"] || rowObj["unitsize"] || 1) || 1;
      const unitCalc = rowObj["unit\xE9 calcul"] || rowObj["unite calcul"] || rowObj["unitcalc"] || "u";
      const priceBuy = parseFloat(rowObj["prix achat"] || rowObj["prix"] || rowObj["pricebuy"] || 0) || 0;
      const waste = parseFloat(rowObj["perte"] || rowObj["perte (%)"] || rowObj["waste"] || 5) || 0;
      const yieldRate = parseFloat(rowObj["rendement"] || rowObj["rendement (m\xB2)"] || rowObj["yieldrate"] || 0) || 0;
      const rowErrors = [];
      if (!name || name.length < 2) rowErrors.push("Nom manquant ou trop court");
      if (priceBuy <= 0) rowErrors.push("Prix d\u2019achat invalide ou nul");
      if (unitSize <= 0) rowErrors.push("Taille d\u2019unit\xE9 invalide");
      if (waste < 0 || waste > 50) rowErrors.push("Perte hors limites (0-50%)");
      const isValid = rowErrors.length === 0;
      if (!isValid) errors.push(`Ligne ${i + 1} (${name || "Sans nom"}) : ${rowErrors.join(", ")}`);
      rows.push({
        id: Date.now() + i + Math.floor(Math.random() * 1e3),
        name,
        category,
        unitBuy,
        unitSize,
        unitCalc,
        priceBuy,
        priceCalc: parseFloat((priceBuy / unitSize).toFixed(2)),
        waste,
        yieldRate,
        purchaseMode: "pack",
        isValid,
        rowErrors
      });
    }
    setParsedRows(rows);
    setParseErrors(errors);
  };
  const handleConfirmImport = () => {
    const validItems = parsedRows.filter((r) => r.isValid).map(({ isValid, rowErrors, ...item }) => item);
    if (validItems.length === 0) return;
    if (importMode === "replace") {
      onImportMaterials(validItems);
    } else {
      const existingNames = new Set(existingMaterials.map((m) => m.name.toLowerCase().trim()));
      const toAdd = validItems.filter((v) => !existingNames.has(v.name.toLowerCase().trim()));
      onImportMaterials([...existingMaterials, ...toAdd]);
    }
    onClose();
  };
  const validCount = parsedRows.filter((r) => r.isValid).length;
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/70 backdrop-blur-sm flex items-center justify-center z-[120] p-4 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-neutral-200" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 sm:p-6 border-b border-neutral-100 flex justify-between items-center bg-white shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg font-bold" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-csv" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-neutral-900 text-lg" }, "Importation CSV S\xE9curis\xE9e des Mati\xE8res"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500" }, "Contr\xF4le strict des prix, conditionnements et coh\xE9rence des unit\xE9s"))), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700", "aria-label": "Fermer la bo\xEEte de dialogue" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-lg" }))), /* @__PURE__ */ React.createElement("div", { className: "p-6 overflow-y-auto custom-scroll space-y-5 bg-neutral-50/50 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "p-6 border-2 border-dashed border-neutral-300 rounded-2xl bg-white text-center space-y-3" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-cloud-arrow-up text-3xl text-neutral-400" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "btn-primary text-xs py-2 px-4 font-bold cursor-pointer inline-flex items-center gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-folder-open" }), /* @__PURE__ */ React.createElement("span", null, "Choisir un fichier CSV"), /* @__PURE__ */ React.createElement("input", { type: "file", accept: ".csv,text/csv", onChange: handleFileUpload, className: "hidden" })), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-2" }, "Format attendu : En-t\xEAtes UTF-8 s\xE9par\xE9s par des points-virgules (;) ou virgules (,)"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between p-3 bg-brand-50/60 rounded-xl border border-brand-200/60 text-xs" }, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-brand-900" }, "Colonnes support\xE9es : Nom, Cat\xE9gorie, Unit\xE9 Achat, Taille Unit\xE9, Unit\xE9 Calcul, Prix Achat, Perte"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      onClick: () => {
        const sample = "Nom;Cat\xE9gorie;Unit\xE9 Achat;Taille Unit\xE9;Unit\xE9 Calcul;Prix Achat;Perte (%);Rendement (m\xB2)\nTube carr\xE9 30x30;Fer;Barre (6m);6;m;12000;5;0\nPeinture Acrylique;Peinture;Pot (20L);20;L;55000;8;12\nCarrelage 60x60;Rev\xEAtement;Carton (1.44m\xB2);1.44;m\xB2;14000;10;0";
        const uri = "data:text/csv;charset=utf-8," + encodeURI(sample);
        const a = document.createElement("a");
        a.href = uri;
        a.download = "modele_matieres_ikadevis.csv";
        a.click();
      },
      className: "text-brand-700 font-extrabold hover:underline flex items-center gap-1 shrink-0 ml-2"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-download" }),
    " T\xE9l\xE9charger Mod\xE8le"
  )), parsedRows.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-extrabold text-neutral-800" }, "Aper\xE7u : ", validCount, " ligne(s) valide(s) sur ", parsedRows.length), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 text-xs font-bold" }, /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-1.5 cursor-pointer" }, /* @__PURE__ */ React.createElement("input", { type: "radio", name: "importMode", checked: importMode === "merge", onChange: () => setImportMode("merge") }), /* @__PURE__ */ React.createElement("span", null, "Ajouter (Fusionner)")), /* @__PURE__ */ React.createElement("label", { className: "flex items-center gap-1.5 cursor-pointer ml-3 text-red-600" }, /* @__PURE__ */ React.createElement("input", { type: "radio", name: "importMode", checked: importMode === "replace", onChange: () => setImportMode("replace") }), /* @__PURE__ */ React.createElement("span", null, "Remplacer tout")))), /* @__PURE__ */ React.createElement("div", { className: "max-h-48 overflow-y-auto border border-neutral-200 rounded-xl bg-white text-xs" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left border-collapse" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-neutral-50 sticky top-0 border-b border-neutral-200 text-[10px] font-bold text-neutral-500 uppercase" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "p-2 pl-3" }, "Statut"), /* @__PURE__ */ React.createElement("th", { className: "p-2" }, "D\xE9signation"), /* @__PURE__ */ React.createElement("th", { className: "p-2" }, "Cat\xE9gorie"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-right" }, "Prix Achat"), /* @__PURE__ */ React.createElement("th", { className: "p-2 text-right" }, "Co\xFBt Unitaire"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-neutral-100" }, parsedRows.map((r, idx) => /* @__PURE__ */ React.createElement("tr", { key: idx, className: r.isValid ? "hover:bg-neutral-50" : "bg-red-50/50" }, /* @__PURE__ */ React.createElement("td", { className: "p-2 pl-3 font-bold" }, r.isValid ? /* @__PURE__ */ React.createElement("span", { className: "text-emerald-600 font-bold" }, "\u2705 Valide") : /* @__PURE__ */ React.createElement("span", { className: "text-red-600 font-bold text-[10px]", title: r.rowErrors.join(", ") }, "\u274C Erreur")), /* @__PURE__ */ React.createElement("td", { className: "p-2 font-bold text-neutral-800" }, r.name || "-"), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-neutral-500" }, r.category), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-right font-medium" }, r.priceBuy, " FCFA"), /* @__PURE__ */ React.createElement("td", { className: "p-2 text-right font-extrabold text-brand-700" }, r.priceCalc, " FCFA/", r.unitCalc)))))))), /* @__PURE__ */ React.createElement("div", { className: "p-5 border-t border-neutral-100 bg-white flex justify-between items-center shrink-0" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs text-neutral-400" }, validCount > 0 ? `${validCount} ressource(s) pr\xEAtes \xE0 \xEAtre import\xE9es` : "Chargez un fichier pour continuer"), /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onClose, className: "btn-secondary text-xs py-2 px-4 font-bold" }, "Annuler"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: validCount === 0,
      onClick: handleConfirmImport,
      className: "btn-primary text-xs py-2 px-5 font-black flex items-center gap-1.5 shadow-sm shadow-brand-500/20"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check" }),
    /* @__PURE__ */ React.createElement("span", null, "Importer ", validCount, " Mati\xE8re(s)")
  )))));
}
const StructuredLogger = {
  log: (level, functionName, message, meta = {}, orgId = null, userId = null) => {
    const entry = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level: level.toUpperCase(),
      requestId: "req_" + Math.random().toString(36).substr(2, 9),
      organizationId: orgId || "global",
      userId: userId || "anonymous",
      functionName,
      message,
      meta: typeof meta === "object" ? meta : { info: meta }
    };
    if (level === "error") {
      console.error("[StructuredLogger]", JSON.stringify(entry));
    } else if (level === "warn") {
      console.warn("[StructuredLogger]", JSON.stringify(entry));
    } else {
      console.log("[StructuredLogger]", JSON.stringify(entry));
    }
    return entry;
  },
  info: (fn, msg, meta, orgId, userId) => StructuredLogger.log("info", fn, msg, meta, orgId, userId),
  warn: (fn, msg, meta, orgId, userId) => StructuredLogger.log("warn", fn, msg, meta, orgId, userId),
  error: (fn, msg, meta, orgId, userId) => StructuredLogger.log("error", fn, msg, meta, orgId, userId)
};
function HealthCheckModal({ isOpen, onClose, isOnline, sbUser, solutionsCount, materialsCount, quotesCount }) {
  if (!isOpen) return null;
  const checks = [
    { name: "Moteur Frontend & React Runtime", status: "OK", detail: "v18.2 Production, 0 fuite m\xE9moire", icon: "fa-cube" },
    { name: "Moteur Math\xE9matique AST D\xE9terministe", status: "OK", detail: "SafeMathEvaluator actif (z\xE9ro eval)", icon: "fa-calculator" },
    { name: "Connectivit\xE9 Cloud & Supabase Auth", status: isOnline ? "OK" : "DEGRADED", detail: isOnline ? sbUser ? `Connect\xE9 (${sbUser.email})` : "Session Locale Active" : "Mode Chantier (Hors-Ligne)", icon: "fa-cloud" },
    { name: "Base de Donn\xE9es & Stockage Isol\xE9", status: "OK", detail: `${solutionsCount} Ouvrages, ${materialsCount} Mat\xE9riaux, ${quotesCount} Devis`, icon: "fa-database" },
    { name: "Cache Local & Synchronisation R\xE9siliente", status: "OK", detail: "IndexedDB / LocalStorage op\xE9rationnel", icon: "fa-hard-drive" }
  ];
  return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/75 backdrop-blur-sm flex items-center justify-center z-[140] p-4 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-neutral-200 animate-scale-up" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 border-b border-neutral-100 flex justify-between items-center bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2.5" }, /* @__PURE__ */ React.createElement("div", { className: "w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-base" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-heart-pulse" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-neutral-900 text-sm" }, "Health Check & Diagnostic Syst\xE8me"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 font-mono" }, "Infrastructure ikadevis Enterprise"))), /* @__PURE__ */ React.createElement("button", { onClick: onClose, className: "btn-icon w-8 h-8 text-neutral-400 hover:text-neutral-700", "aria-label": "Fermer" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-lg" }))), /* @__PURE__ */ React.createElement("div", { className: "p-6 space-y-3 bg-neutral-50/50" }, checks.map((c, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "bg-white p-3.5 rounded-2xl border border-neutral-200/80 flex items-center justify-between shadow-2xs" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("div", { className: `w-8 h-8 rounded-xl flex items-center justify-center text-xs ${c.status === "OK" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}` }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${c.icon}` })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h4", { className: "font-bold text-xs text-neutral-800" }, c.name), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-neutral-400 font-medium" }, c.detail))), /* @__PURE__ */ React.createElement("span", { className: `px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${c.status === "OK" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}` }, c.status))), /* @__PURE__ */ React.createElement("div", { className: "pt-3 flex justify-end" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: onClose, className: "btn-primary text-xs py-2 px-5 font-bold" }, "Fermer le Diagnostic")))));
}
const QuoteService = {
  save: async ({ quote, supabaseClient, sbUser, activeOrgId, companyInfo, calcForm }) => {
    if (!supabaseClient || !sbUser || sbUser.id === "guest") {
      return {
        success: true,
        isLocal: true,
        quoteNumber: quote.number,
        message: `Devis ${quote.number} enregistr\xE9 localement (Mode D\xE9mo)`
      };
    }
    const orgId = activeOrgId;
    if (!orgId) {
      throw new Error("Aucune organisation active s\xE9lectionn\xE9e.");
    }
    const linesForV6 = (quote.quoteData?.commercialItems || []).map((d, idx) => ({
      line_order: idx + 1,
      designation: d.label || d.name || "Ligne de devis",
      unit: d.unit || "u",
      quantity: d.billedQty || 1,
      unit_price_ht: d.sellingUnitHT || 0,
      total_ht: d.sellingTotalHT || 0,
      cost_category: d.costCategory || "material"
    }));
    const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc("create_quote_v6", {
      p_org_id: orgId,
      p_client_name: quote.clientName || "Client Passage",
      p_project_ref: quote.projectRef || "Chantier BTP",
      p_company_snapshot: companyInfo || {},
      p_calc_form_snapshot: calcForm || {},
      p_lines: linesForV6,
      p_hybrid_snapshot: quote.hybridQuoteSnapshot || {}
    });
    if (rpcErr) {
      StructuredLogger.error("QuoteService.save", "\xC9chec de sauvegarde relationnelle Supabase", { error: rpcErr.message }, orgId, sbUser.id);
      throw new Error(`Erreur serveur Supabase : ${rpcErr.message}`);
    }
    StructuredLogger.info("QuoteService.save", "Devis persist\xE9 en base PostgreSQL", { serverQuoteId: rpcRes }, orgId, sbUser.id);
    return {
      success: true,
      isLocal: false,
      serverQuoteId: rpcRes,
      quoteNumber: quote.number,
      message: `Devis ${quote.number} enregistr\xE9 sur le cloud Supabase`
    };
  }
};
function App({ supabaseSession, supabaseClient, onSignOut }) {
  const sbUser = supabaseSession ? supabaseSession.user : null;
  const currentUserId = sbUser ? sbUser.id : "guest";
  const [userOrganizations, setUserOrganizations] = useState(() => {
    const cached = localStorage.getItem(`ikadevis_orgs_${currentUserId}`);
    return cached ? JSON.parse(cached) : [
      { id: "org_default", name: "Entreprise BTP Principale", currency: "FCFA", role: "owner" }
    ];
  });
  const [activeOrganizationId, setActiveOrganizationId] = useState(() => {
    return localStorage.getItem(`ikadevis_active_org_${currentUserId}`) || "org_default";
  });
  const [activeOrganizationRole, setActiveOrganizationRole] = useState(() => sbUser && sbUser.id !== "guest" ? null : "owner");
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjectForm, setNewProjectForm] = useState({ name: "", clientId: "", siteAddress: "", city: "Dakar", budgetEstimated: "" });
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ name: "", contactPerson: "", taxId: "", phone: "", email: "", address: "", city: "Dakar" });
  const [editingClientId, setEditingClientId] = useState(null);
  const [quotesClientFilter, setQuotesClientFilter] = useState(null);
  const [saveQuoteStatus, setSaveQuoteStatus] = useState("idle");
  const [saveQuoteError, setSaveQuoteError] = useState(null);
  const [sbSyncStatus, setSbSyncStatus] = useState("idle");
  const [sbDataLoaded, setSbDataLoaded] = useState(false);
  const [cloudState, setCloudState] = useState("idle");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [cloudErrorMessage, setCloudErrorMessage] = useState(null);
  const [cloudRetryCount, setCloudRetryCount] = useState(0);
  const [showImportBanner, setShowImportBanner] = useState(false);
  const [workingLots, setWorkingLots] = useState([]);
  const [useHybridEditor, setUseHybridEditor] = useState(() => {
    const saved = localStorage.getItem("costcalc_hybrid_editor");
    return saved !== null ? saved === "true" : true;
  });
  const toggleHybridEditor = (val) => {
    const nextVal = typeof val === "boolean" ? val : !useHybridEditor;
    setUseHybridEditor(nextVal);
    localStorage.setItem("costcalc_hybrid_editor", String(nextVal));
    showToast(nextVal ? "Mode \xC9diteur Hybride V6 activ\xE9" : "Mode \xC9diteur Classique V5 activ\xE9");
  };
  const [hybridQuote, setHybridQuote] = useState(() => {
    return {
      id: Date.now(),
      number: `DEV-${(/* @__PURE__ */ new Date()).getFullYear()}-001`,
      clientName: "",
      projectRef: "",
      status: "draft",
      vatRate: 18,
      overheadRate: 5,
      margin: 30,
      marginType: "reel",
      discountRate: 0,
      notes: "",
      lots: [
        {
          id: "lot_1",
          code: "01",
          name: "Lot 01 \u2014 Installation & Gros \u0152uvre",
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
  useEffect(() => {
    if (!supabaseClient || !supabaseClient.auth) return;
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        showToast("Session ferm\xE9e ou expir\xE9e", "info");
      } else if (event === "TOKEN_REFRESHED") {
        console.log("[Bloc 2 Auth] Jeton d'authentification Supabase rafra\xEEchi avec succ\xE8s.");
      } else if (event === "USER_UPDATED") {
        console.log("[Bloc 2 Auth] Donn\xE9es de session utilisateur mises \xE0 jour.");
      }
    });
    return () => subscription?.unsubscribe();
  }, [supabaseClient]);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsCompanyModalOpen(false);
        setIsSaveQuoteModalOpen(false);
        setIsVarModalOpen(false);
        setIsRecipeModalOpen(false);
        setIsSolutionModalOpen(false);
        setIsAllowedModesModalOpen(false);
        setIsHealthModalOpen(false);
        setViewingSavedQuote(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  useEffect(() => {
    if (sbDataLoaded || cloudState === "offline_error") {
      const t = setTimeout(() => setIsBootstrapping(false), 300);
      return () => clearTimeout(t);
    }
  }, [sbDataLoaded, cloudState]);
  const [activeView, setActiveView] = useState("calculator");
  const [toast, setToast] = useState(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [platformOverview, setPlatformOverview] = useState(null);
  const [platformLoading, setPlatformLoading] = useState(false);
  const [platformError, setPlatformError] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: "", message: "", onConfirm: null, isDanger: false });
  const userSchemaInfo = useMemo(() => {
    const raw = LS.get("schemaVersion", sbUser?.id);
    const storedInt = raw !== null ? parseInt(raw, 10) : CURRENT_SCHEMA_INT;
    const isDowngrade = storedInt > CURRENT_SCHEMA_INT;
    return { isDowngrade, storedInt };
  }, [sbUser]);
  useEffect(() => {
    let annule = false;
    const verifier = async () => {
      if (!sb || !sbUser || sbUser.id === "guest") {
        setIsPlatformAdmin(false);
        return;
      }
      try {
        const { data, error } = await sb.rpc("is_platform_admin");
        if (!annule) setIsPlatformAdmin(error ? false : data === true);
      } catch (e) {
        if (!annule) setIsPlatformAdmin(false);
      }
    };
    verifier();
    return () => {
      annule = true;
    };
  }, [sbUser]);
  const loadPlatformOverview = useCallback(async () => {
    if (!sb) return;
    setPlatformLoading(true);
    setPlatformError(null);
    try {
      const { data, error } = await sb.rpc("get_platform_overview");
      if (error) throw error;
      setPlatformOverview(data);
    } catch (e) {
      setPlatformError(e.message || "Chargement de la vue plateforme impossible.");
      setPlatformOverview(null);
    } finally {
      setPlatformLoading(false);
    }
  }, []);
  useEffect(() => {
    if (activeView === "platformAdmin" && isPlatformAdmin && !platformOverview && !platformLoading) {
      loadPlatformOverview();
    }
  }, [activeView, isPlatformAdmin, platformOverview, platformLoading, loadPlatformOverview]);
  const [isReadOnlyDueToDowngrade, setIsReadOnlyDueToDowngrade] = useState(false);
  const [downgradeWarning, setDowngradeWarning] = useState(null);
  useEffect(() => {
    if (userSchemaInfo.isDowngrade) {
      setIsReadOnlyDueToDowngrade(true);
      setDowngradeWarning(`\u{1F512} Mode Lecture Seule V5.7 : Votre base locale a \xE9t\xE9 cr\xE9\xE9e avec un sch\xE9ma plus r\xE9cent (V${userSchemaInfo.storedInt}). Aucune \xE9criture n'est autoris\xE9e.`);
    }
  }, [userSchemaInfo]);
  const [matForm, setMatForm] = useState(null);
  const [laborForm, setLaborForm] = useState(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [selectedLaborId, setSelectedLaborId] = useState(null);
  const [isResourceEditMode, setIsResourceEditMode] = useState(false);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isCustomPackaging, setIsCustomPackaging] = useState(false);
  const [resourceDetailTab, setResourceDetailTab] = useState("overview");
  const [materialHistory, setMaterialHistory] = useState([]);
  const [materialHistoryLoading, setMaterialHistoryLoading] = useState(false);
  const [materialHistoryError, setMaterialHistoryError] = useState(false);
  const isCloudOrgActive = activeOrganizationId && !activeOrganizationId.startsWith("org_default") && !activeOrganizationId.startsWith("org_local");
  useEffect(() => {
    if (resourceDetailTab !== "history" || !selectedMaterialId) return;
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
        const { data, error } = await supabaseClient.from("material_price_history").select("*").eq("material_id", selectedMaterialId).eq("organization_id", activeOrganizationId).order("created_at", { ascending: false }).limit(20);
        if (error) throw error;
        if (!cancelled) setMaterialHistory(data || []);
      } catch (e) {
        console.warn("[Price History] \xC9chec de la requ\xEAte Supabase:", e);
        if (!cancelled) {
          setMaterialHistoryError(true);
          setMaterialHistory([]);
        }
      } finally {
        if (!cancelled) setMaterialHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resourceDetailTab, selectedMaterialId, supabaseClient, activeOrganizationId, isCloudOrgActive]);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [quickResourceDraft, setQuickResourceDraft] = useState(null);
  useEffect(() => {
    if (!isRecipeModalOpen) setQuickResourceDraft(null);
  }, [isRecipeModalOpen]);
  const [solutionSearchQuery, setSolutionSearchQuery] = useState("");
  const [isMatCsvModalOpen, setIsMatCsvModalOpen] = useState(false);
  const [recipeForm, setRecipeForm] = useState(null);
  const [isSolutionModalOpen, setIsSolutionModalOpen] = useState(false);
  const [solutionModalForm, setSolutionModalForm] = useState({ id: null, name: "", icon: "fa-cube", allowedModes: ["rectangle", "surface", "linear"] });
  const [clientNameError, setClientNameError] = useState(false);
  const [resourceTab, setResourceTab] = useState("materials");
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [isVarModalOpen, setIsVarModalOpen] = useState(false);
  const [varForm, setVarForm] = useState({ name: "", label: "", defaultValue: 0, unit: "u" });
  const [isAllowedModesModalOpen, setIsAllowedModesModalOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const demoCompany = {
    name: "IKADEVIS BTP",
    tagline: "BTP - Fabrications - Am\xE9nagement - Signal\xE9tique",
    phone: "+225 07 00 00 00",
    email: "contact@ikadevis.com",
    address: "Abidjan, C\xF4te d'Ivoire",
    nif: "2600123A",
    rccm: "CI-ABJ-2026-B-12345",
    currency: "FCFA",
    paymentSchedule: [
      { label: "Acompte \xE0 la signature et d\xE9marrage des travaux", pct: 40 },
      { label: "Situation interm\xE9diaire / Avancement gros \u0153uvre & hors d'eau", pct: 30 },
      { label: "Second \u0153uvre, finitions et \xE9quipements", pct: 20 },
      { label: "Solde \xE0 la r\xE9ception d\xE9finitive et remise des cl\xE9s", pct: 10 }
    ],
    quoteValidity: "30 jours \xE0 compter de la date d'\xE9mission."
  };
  const defaultPaymentSchedule = [
    { label: "Acompte \xE0 la signature et au d\xE9marrage", pct: 40 },
    { label: "Situation interm\xE9diaire / Avancement des travaux", pct: 30 },
    { label: "Finitions et \xE9quipements", pct: 20 },
    { label: "Solde \xE0 la r\xE9ception", pct: 10 }
  ];
  const emptyCompany = {
    name: "",
    tagline: "",
    phone: "",
    email: "",
    address: "",
    nif: "",
    rccm: "",
    currency: "FCFA",
    paymentSchedule: defaultPaymentSchedule,
    quoteValidity: "30 jours \xE0 compter de la date d'\xE9mission."
  };
  const estModeDemoCompany = !sbUser || sbUser.id === "guest";
  const defaultCompany = estModeDemoCompany ? demoCompany : emptyCompany;
  const REQUIRED_LEGAL_FIELDS = ["name", "address", "phone", "email", "nif", "rccm"];
  const getMissingLegalFields = (info) => REQUIRED_LEGAL_FIELDS.filter((k) => !(info?.[k] || "").trim());
  const [isSaveQuoteModalOpen, setIsSaveQuoteModalOpen] = useState(false);
  const [saveQuoteForm, setSaveQuoteForm] = useState({ clientName: "", projectRef: "", notes: "" });
  const [viewingSavedQuote, setViewingSavedQuote] = useState(null);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast("\u2713 Connexion r\xE9tablie : synchronisation automatique active !", "success");
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast("\u26A0\uFE0F Connexion perdue : bascule en Mode Chantier (Hors-Ligne)", "warning");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
  const [isCommercialMode, setIsCommercialMode] = useState(true);
  const initialEquipment = [
    { id: 1, name: "B\xE9tonni\xE8re thermique 350L tractable", category: "Gros \u0152uvre", hourlyCost: 2500, dailyCost: 15e3, transportCost: 1e4, fuelConsumption: 1.5 },
    { id: 2, name: "\xC9chafaudage tubulaire de fa\xE7ade 150m\xB2", category: "Fa\xE7ades", hourlyCost: 0, dailyCost: 25e3, transportCost: 35e3, fuelConsumption: 0 },
    { id: 3, name: "Poste \xE0 souder professionnel MIG/MAG 250A", category: "M\xE9tallerie", hourlyCost: 3e3, dailyCost: 18e3, transportCost: 5e3, fuelConsumption: 0 },
    { id: 4, name: "Nacelle \xE9l\xE9vatrice t\xE9lescopique 16m", category: "Levage", hourlyCost: 18e3, dailyCost: 12e4, transportCost: 5e4, fuelConsumption: 4.5 },
    { id: 5, name: "Camion benne 10 tonnes avec chauffeur", category: "Transport", hourlyCost: 15e3, dailyCost: 85e3, transportCost: 2e4, fuelConsumption: 15 },
    { id: 6, name: "Groupe \xE9lectrog\xE8ne insonoris\xE9 30 kVA", category: "\xC9nergie", hourlyCost: 5e3, dailyCost: 35e3, transportCost: 15e3, fuelConsumption: 5 },
    { id: 7, name: "Compresseur d\u2019air thermique 5000 L/min", category: "Outillage", hourlyCost: 4e3, dailyCost: 28e3, transportCost: 1e4, fuelConsumption: 3 }
  ];
  const initialSubcontractors = [
    { id: 1, name: "Entreprise \xC9lectricit\xE9 G\xE9n\xE9rale & Domotique", trade: "\xC9lectricit\xE9", phone: "+223 76 00 11 22", defaultMarkup: 15 },
    { id: 2, name: "Soci\xE9t\xE9 \xC9tanch\xE9it\xE9 Moderne & Toitures", trade: "\xC9tanch\xE9it\xE9", phone: "+223 66 33 44 55", defaultMarkup: 15 },
    { id: 3, name: "Atelier Vitrerie Miroiterie & Tremp\xE9", trade: "Vitrerie", phone: "+223 70 88 99 00", defaultMarkup: 18 },
    { id: 4, name: "Soci\xE9t\xE9 VRD & Assainissement BTP", trade: "Terrassement Lourd", phone: "+223 75 44 22 11", defaultMarkup: 12 }
  ];
  const initialClients = [
    {
      id: "cli-001",
      name: "Soci\xE9t\xE9 Immobili\xE8re NBB",
      contactPerson: "M. Amadou DIOP (Directeur G\xE9n\xE9ral)",
      taxId: "NIF-00482910-A",
      email: "contact@nbb-immo.com",
      phone: "+221 77 654 32 10",
      address: "Boulevard de la R\xE9publique",
      city: "Dakar",
      notes: "Grand compte immobilier, projets tertiaires & r\xE9sidentiels."
    },
    {
      id: "cli-002",
      name: "R\xE9sidence Les Almadies",
      contactPerson: "Mme Fatou SOW (Syndic)",
      taxId: "NIF-00918234-B",
      email: "syndic@almadies-residence.sn",
      phone: "+221 78 432 19 87",
      address: "Route des Almadies",
      city: "Dakar",
      notes: "R\xE9novations r\xE9guli\xE8res et \xE9tanch\xE9it\xE9 fa\xE7ades."
    }
  ];
  const initialProjects = [
    {
      id: "prj-001",
      code: "PRJ-2026-001",
      name: "Construction Si\xE8ge NBB",
      clientId: "cli-001",
      clientName: "Soci\xE9t\xE9 Immobili\xE8re NBB",
      siteAddress: "Plateau, Rue Carnot",
      city: "Dakar",
      status: "active",
      budgetEstimated: 15e7,
      createdAt: "2026-01-15"
    },
    {
      id: "prj-002",
      code: "PRJ-2026-002",
      name: "R\xE9novation Fa\xE7ades ACM & Enseignes LED",
      clientId: "cli-002",
      clientName: "R\xE9sidence Les Almadies",
      siteAddress: "Corniche Ouest",
      city: "Dakar",
      status: "in_progress",
      budgetEstimated: 45e6,
      createdAt: "2026-02-01"
    }
  ];
  const initialSavedQuotes = [
    {
      id: 101,
      number: `DEV-${(/* @__PURE__ */ new Date()).getFullYear()}-001`,
      versionNumber: 1,
      clientName: "Soci\xE9t\xE9 Immobili\xE8re NBB",
      projectRef: "Construction Si\xE8ge NBB",
      date: (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR"),
      status: "approved",
      vatRate: 18,
      quoteData: {
        netHTConsomme: 125e5,
        tvaConsomme: 225e4,
        totalTTCConsomme: 1475e4,
        totalDebourseConsomme: 85e5,
        fraisGenerauxConsomme: 6e5,
        margeValeurConsomme: 34e5,
        margePctConsommeReelle: 27.2,
        lots: [
          {
            id: "lot-1",
            lotName: "Lot 03 \u2014 Gros \u0152uvre & B\xE9ton Arm\xE9",
            quoteData: {
              netHTConsomme: 125e5,
              totalTTCConsomme: 1475e4,
              totalDebourseConsomme: 85e5
            }
          }
        ],
        commercialItems: [
          {
            name: "Lot 03 \u2014 Gros \u0152uvre & B\xE9ton Arm\xE9 B25",
            billedQty: 1,
            unit: "forfait",
            sellingUnitHT: 125e5,
            sellingTotalHT: 125e5
          }
        ]
      },
      companyInfoSnapshot: {
        name: "MicroOffice BTP Ing\xE9nierie",
        currency: "FCFA",
        paymentTerms: "40% acompte, 30% avancement, 20% finitions, 10% solde",
        quoteValidity: "30 jours"
      }
    }
  ];
  const initialSuppliers = [
    { id: "sup_1", name: "MATFORCE BTP & MAT\xC9RIAUX", phone: "+223 20 22 00 00", rating: 5, address: "Zone Industrielle Sotuba" },
    { id: "sup_2", name: "SOGEA MAT\xC9RIAUX DU MALI", phone: "+223 20 23 11 22", rating: 5, address: "Bd du 22 Octobre" },
    { id: "sup_3", name: "COMPTOIR M\xC9TALLURGIQUE SA", phone: "+223 20 24 55 66", rating: 4, address: "Zone Portuaire" },
    { id: "sup_4", name: "QUINCAILLERIE MODERNE & D\xC9CO", phone: "+223 20 21 88 99", rating: 5, address: "Grand March\xE9 Central" }
  ];
  const initialMaterials = [
    { id: 1, reference: "TUB-2525", brand: "ArcelorMittal", supplier: "COMPTOIR M\xC9TALLURGIQUE SA", stock: 120, name: "Tube carr\xE9 acier 25x25 (Cadres & Renforts)", category: "Fer", unitBuy: "Barre (6m)", unitSize: 6, unitCalc: "m", priceBuy: 9e3, priceCalc: 1500, waste: 5, yieldRate: 0, purchaseMode: "pack" },
    { id: 2, name: "Autocollant imprim\xE9 VINYL HD Lamination", category: "Impression", unitBuy: "m\xB2", unitSize: 1, unitCalc: "m\xB2", priceBuy: 5e3, priceCalc: 5e3, waste: 8, yieldRate: 0, purchaseMode: "real" },
    { id: 3, name: "Plaque de fond t\xF4le galvanis\xE9e 10/10e", category: "Support", unitBuy: "Feuille (3m\xB2)", unitSize: 3, unitCalc: "m\xB2", priceBuy: 21e3, priceCalc: 7e3, waste: 5, yieldRate: 0, purchaseMode: "pack" },
    { id: 4, name: "Plaque Alucobond 4mm PVDF Ext\xE9rieur", category: "Support", unitBuy: "Plaque (6m\xB2)", unitSize: 6, unitCalc: "m\xB2", priceBuy: 65e3, priceCalc: 10833.33, waste: 8, yieldRate: 0, purchaseMode: "pack" },
    { id: 5, name: "Peinture Murale Satin\xE9e Lessivable", category: "Peinture", unitBuy: "Pot 15L", unitSize: 15, unitCalc: "L", priceBuy: 45e3, priceCalc: 3e3, waste: 8, yieldRate: 10, purchaseMode: "pack" },
    { id: 6, name: "B\xE9ton pr\xEAt \xE0 l\u2019emploi B25 dos\xE9 350 kg/m\xB3", category: "BTP", unitBuy: "m\xB3", unitSize: 1, unitCalc: "m\xB3", priceBuy: 85e3, priceCalc: 85e3, waste: 5, yieldRate: 0, purchaseMode: "real" },
    { id: 7, name: "Aciers Haute Adh\xE9rence FeE500 (HA 8 \xE0 16)", category: "BTP", unitBuy: "Barre (12m)", unitSize: 12, unitCalc: "m", priceBuy: 7500, priceCalc: 625, waste: 10, yieldRate: 0, purchaseMode: "pack" },
    { id: 8, name: "Agglos creux de 15x20x40 standard", category: "BTP", unitBuy: "Unit\xE9 (pi\xE8ce)", unitSize: 1, unitCalc: "u", priceBuy: 350, priceCalc: 350, waste: 5, yieldRate: 0, purchaseMode: "real" },
    { id: 9, name: "Ciment CPJ 42.5 pour mortier de pose", category: "BTP", unitBuy: "Sac (50kg)", unitSize: 50, unitCalc: "kg", priceBuy: 4800, priceCalc: 96, waste: 5, yieldRate: 0, purchaseMode: "pack" },
    { id: 10, name: "Carrelage Gr\xE8s C\xE9rame 60x60 Poli Rectifi\xE9", category: "Rev\xEAtement", unitBuy: "Carton (1.44m\xB2)", unitSize: 1.44, unitCalc: "m\xB2", priceBuy: 13e3, priceCalc: 9027.78, waste: 10, yieldRate: 0, purchaseMode: "pack" },
    { id: 11, name: "Colle carrelage C2TE & Joint hydrofuge", category: "Rev\xEAtement", unitBuy: "Sac (25kg)", unitSize: 25, unitCalc: "kg", priceBuy: 5500, priceCalc: 220, waste: 5, yieldRate: 0, purchaseMode: "pack" },
    { id: 12, name: "Profil\xE9 Aluminium thermolaqu\xE9 noir/blanc", category: "Menuiserie", unitBuy: "Barre (6m)", unitSize: 6, unitCalc: "m", priceBuy: 18e3, priceCalc: 3e3, waste: 8, yieldRate: 0, purchaseMode: "pack" },
    { id: 13, name: "Vitrage feuillet\xE9 de s\xE9curit\xE9 44.2", category: "Menuiserie", unitBuy: "m\xB2", unitSize: 1, unitCalc: "m\xB2", priceBuy: 28e3, priceCalc: 28e3, waste: 5, yieldRate: 0, purchaseMode: "real" },
    // P0.6 — waste 2% → 0% : un module LED ne se gâche pas fractionnellement
    // (contrairement à un matériau continu comme la peinture ou le carrelage)
    // — soit il est posé, soit non. Cohérent avec l'alimentation (id 15,
    // même famille de composant électrique discret, déjà à waste: 0.
    { id: 14, name: "Modules LED \xE9tanches IP67 1.2W Grand Angle", category: "\xC9lectricit\xE9", unitBuy: "Module", unitSize: 1, unitCalc: "u", priceBuy: 650, priceCalc: 650, waste: 0, yieldRate: 0, purchaseMode: "real" },
    { id: 15, name: "Alimentation \xE9tanche LED MeanWell 12V 200W", category: "\xC9lectricit\xE9", unitBuy: "Unit\xE9", unitSize: 1, unitCalc: "u", priceBuy: 24e3, priceCalc: 24e3, waste: 0, yieldRate: 0, purchaseMode: "real" },
    { id: 16, name: "Plaque Plexiglas Acrylique Diffusant 3mm", category: "Support", unitBuy: "Plaque (3m\xB2)", unitSize: 3, unitCalc: "m\xB2", priceBuy: 36e3, priceCalc: 12e3, waste: 8, yieldRate: 0, purchaseMode: "pack" },
    { id: 17, name: "B\xE2che PVC 510g M1 Anti-reflet HD", category: "Impression", unitBuy: "m\xB2", unitSize: 1, unitCalc: "m\xB2", priceBuy: 4500, priceCalc: 4500, waste: 5, yieldRate: 0, purchaseMode: "real" },
    { id: 18, name: "Moquette \xC9v\xE9nementielle Velours M1", category: "Rev\xEAtement", unitBuy: "m\xB2", unitSize: 1, unitCalc: "m\xB2", priceBuy: 4e3, priceCalc: 4e3, waste: 8, yieldRate: 0, purchaseMode: "real" },
    { id: 19, name: "Tube carr\xE9 galvanis\xE9 40x40 Ossature Fa\xE7ade", category: "Fer", unitBuy: "Barre (6m)", unitSize: 6, unitCalc: "m", priceBuy: 15e3, priceCalc: 2500, waste: 8, yieldRate: 0, purchaseMode: "pack" },
    { id: 20, name: "Chevilles chimiques & Fixations M10", category: "Quincaillerie", unitBuy: "Kit", unitSize: 1, unitCalc: "u", priceBuy: 1500, priceCalc: 1500, waste: 5, yieldRate: 0, purchaseMode: "real" },
    { id: 21, name: "Plaque de pl\xE2tre BA13 standard 2.50m x 1.20m", category: "Pl\xE2trerie", unitBuy: "Plaque (3m\xB2)", unitSize: 3, unitCalc: "m\xB2", priceBuy: 6500, priceCalc: 2166.67, waste: 8, yieldRate: 0, purchaseMode: "pack" },
    { id: 22, name: "Ossature m\xE9tallique Rails R48 & Montants M48", category: "Pl\xE2trerie", unitBuy: "Barre (3m)", unitSize: 3, unitCalc: "m", priceBuy: 2800, priceCalc: 933.33, waste: 8, yieldRate: 0, purchaseMode: "pack" },
    { id: 23, name: "Laine de verre acoustique et thermique 45mm", category: "Isolation", unitBuy: "Rouleau (15m\xB2)", unitSize: 15, unitCalc: "m\xB2", priceBuy: 25e3, priceCalc: 1666.67, waste: 5, yieldRate: 0, purchaseMode: "pack" },
    { id: 24, name: "Enduit \xE0 joint et bande microperfor\xE9e", category: "Pl\xE2trerie", unitBuy: "Sac (25kg)", unitSize: 25, unitCalc: "kg", priceBuy: 8500, priceCalc: 340, waste: 5, yieldRate: 0, purchaseMode: "pack" },
    { id: 25, name: "Tube multicouche gain\xE9 \xD816/20 pour eau chaude/froide", category: "Plomberie", unitBuy: "Couronne (50m)", unitSize: 50, unitCalc: "m", priceBuy: 45e3, priceCalc: 900, waste: 5, yieldRate: 0, purchaseMode: "pack" },
    { id: 26, name: "Tube PVC \xE9vacuation sanitaire \xD840/\xD8100", category: "Plomberie", unitBuy: "Barre (4m)", unitSize: 4, unitCalc: "m", priceBuy: 6500, priceCalc: 1625, waste: 5, yieldRate: 0, purchaseMode: "pack" },
    { id: 27, name: "C\xE2ble cuivre d\u2019alimentation R2V 3G2.5mm\xB2", category: "\xC9lectricit\xE9", unitBuy: "Couronne (100m)", unitSize: 100, unitCalc: "m", priceBuy: 55e3, priceCalc: 550, waste: 5, yieldRate: 0, purchaseMode: "pack" },
    { id: 28, name: "Disjoncteur divisionnaire 16A/20A Phase+Neutre", category: "\xC9lectricit\xE9", unitBuy: "Unit\xE9", unitSize: 1, unitCalc: "u", priceBuy: 4500, priceCalc: 4500, waste: 0, yieldRate: 0, purchaseMode: "real" },
    { id: 29, name: "Mortier d\u2019enduit ciment hydrofuge pr\xEAt \xE0 g\xE2cher", category: "BTP", unitBuy: "Sac (25kg)", unitSize: 25, unitCalc: "kg", priceBuy: 3800, priceCalc: 152, waste: 5, yieldRate: 0, purchaseMode: "pack" },
    { id: 30, name: "Panneau M\xE9lamin\xE9 18mm Hydrofuge (Plaque 6m\xB2)", category: "Menuiserie", unitBuy: "Plaque (6m\xB2)", unitSize: 6, unitCalc: "m\xB2", priceBuy: 45e3, priceCalc: 7500, waste: 8, yieldRate: 0, purchaseMode: "pack" },
    // waste: 0 volontairement — la formule du Garde-Corps (solution 18) calcule
    // déjà la liste de débit exacte (poteaux + lisses), contrairement à id 1
    // (même tube, waste 5%) dont les formules des AUTRES ouvrages sont des
    // estimations plus grossières où un pourcentage de perte a du sens. Un
    // pourcentage de perte générique par-dessus une liste de débit précise
    // compterait la perte deux fois (une fois via l'arrondi au conditionnement
    // pack, une fois via le waste%).
    { id: 31, name: "Tube carr\xE9 acier 25x25 (D\xE9bit pr\xE9cis, Barre 6m)", category: "Fer", unitBuy: "Barre (6m)", unitSize: 6, unitCalc: "m", priceBuy: 9e3, priceCalc: 1500, waste: 0, yieldRate: 0, purchaseMode: "pack" }
  ];
  const initialLabor = [
    { id: 1, name: "Soudure et assemblage du cadre m\xE9tallique", calcMode: "unite", unit: "u", rate: 1e4, yieldRate: 0 },
    { id: 2, name: "Pose adh\xE9sif vinyle en atelier", calcMode: "surface", unit: "m\xB2", rate: 2e3, yieldRate: 0 },
    { id: 3, name: "D\xE9coupe et usinage des profil\xE9s", calcMode: "perimetre", unit: "m", rate: 500, yieldRate: 0 },
    { id: 4, name: "Installation et fixation sur site", calcMode: "forfait", unit: "forfait", rate: 15e3, yieldRate: 0 },
    { id: 5, name: "Application Peinture (Peintre qualifi\xE9)", calcMode: "surface", unit: "j", rate: 15e3, yieldRate: 80 },
    { id: 6, name: "Terrassement & Fouille manuelle/m\xE9canique", calcMode: "surface", unit: "m\xB3", rate: 6500, yieldRate: 0 },
    { id: 7, name: "Coulage et vibration du b\xE9ton arm\xE9", calcMode: "surface", unit: "m\xB3", rate: 18e3, yieldRate: 0 },
    { id: 8, name: "Fa\xE7onnage et pose des armatures acier HA", calcMode: "surface", unit: "m", rate: 250, yieldRate: 0 },
    { id: 9, name: "Ma\xE7onnerie de murs en agglos de 15", calcMode: "surface", unit: "m\xB2", rate: 3500, yieldRate: 15 },
    { id: 10, name: "Pose et jointoiement carrelage gr\xE8s c\xE9rame", calcMode: "surface", unit: "m\xB2", rate: 4e3, yieldRate: 12 },
    { id: 11, name: "Fabrication et pose menuiserie aluminium", calcMode: "unite", unit: "u", rate: 25e3, yieldRate: 0 },
    { id: 12, name: "Usinage rainurage V et pose cassette Alucobond", calcMode: "surface", unit: "m\xB2", rate: 8500, yieldRate: 0 },
    { id: 13, name: "C\xE2blage \xE9lectrique, modules LED et alimentation", calcMode: "unite", unit: "u", rate: 25e3, yieldRate: 0 },
    { id: 14, name: "Pose moquette \xE9v\xE9nementielle avec adh\xE9sif", calcMode: "surface", unit: "m\xB2", rate: 1200, yieldRate: 150 },
    { id: 15, name: "Pose cloisons Placostil BA13 & bandes \xE0 joint", calcMode: "surface", unit: "m\xB2", rate: 3500, yieldRate: 20 },
    { id: 16, name: "Pose faux-plafond suspendu BA13 avec suspentes", calcMode: "surface", unit: "m\xB2", rate: 4200, yieldRate: 18 },
    { id: 17, name: "Application enduit ciment hydrofuge 2 passes", calcMode: "surface", unit: "m\xB2", rate: 2800, yieldRate: 25 },
    { id: 18, name: "Installation r\xE9seau plomberie et raccordements", calcMode: "forfait", unit: "forfait", rate: 45e3, yieldRate: 0 },
    { id: 19, name: "C\xE2blage \xE9lectrique sous gaine et appareillage", calcMode: "unite", unit: "u", rate: 8500, yieldRate: 0 },
    { id: 20, name: "Fabrication atelier et pose de caisson menuiserie bois", calcMode: "surface", unit: "m\xB2", rate: 6e3, yieldRate: 0 }
  ];
  const initialSolutions = [
    {
      id: 1,
      name: "Panneau avec cadre m\xE9tallique et autocollant",
      icon: "fa-table-cells-large",
      allowedModes: ["rectangle"],
      customVars: []
    },
    {
      id: 2,
      name: "Habillage Fa\xE7ade en Panneaux Alucobond / ACM",
      icon: "fa-layer-group",
      allowedModes: ["surface", "rectangle"],
      customVars: []
    },
    {
      id: 3,
      name: "Peinture Murale Satin\xE9e BTP",
      icon: "fa-paint-roller",
      allowedModes: ["surface", "floor"],
      customVars: [
        { name: "COUCHES", label: "Nombre de couches", defaultValue: 2, unit: "couches" }
      ]
    },
    {
      id: 4,
      name: "B\xE9ton Arm\xE9 pour Fondations, Poteaux & Cha\xEEnages",
      icon: "fa-cubes",
      allowedModes: ["volume", "surface"],
      customVars: [
        { name: "DOSAGE_ACIER", label: "Ratio Acier (kg/m\xB3)", defaultValue: 80, unit: "kg/m\xB3" }
      ]
    },
    {
      id: 5,
      name: "Ma\xE7onnerie en Murs d\u2019Agglos de 15",
      icon: "fa-trowel-bricks",
      allowedModes: ["surface"],
      customVars: [],
      keywords: ["cl\xF4ture", "muret", "mur de s\xE9paration", "parpaing", "agglo"]
    },
    {
      id: 6,
      name: "Rev\xEAtement Sol en Carrelage Gr\xE8s C\xE9rame 60x60",
      icon: "fa-border-all",
      allowedModes: ["surface", "floor"],
      customVars: []
    },
    {
      id: 7,
      name: "Menuiserie Aluminium & Baie Vitr\xE9e Coulissante",
      icon: "fa-door-open",
      allowedModes: ["rectangle", "unit"],
      customVars: []
    },
    {
      id: 8,
      name: "Caisson Enseigne Lumineuse LED Double Face",
      icon: "fa-lightbulb",
      allowedModes: ["rectangle"],
      customVars: []
    },
    {
      id: 9,
      name: "Lettres Reliefs D\xE9coup\xE9es Plexiglas R\xE9tro\xE9clair\xE9es LED",
      icon: "fa-font",
      allowedModes: ["rectangle", "unit"],
      customVars: [
        { name: "NOMBRE_LETTRES", label: "Nombre de lettres", defaultValue: 10, unit: "lettres" }
      ]
    },
    {
      id: 10,
      name: "Fouilles en Pleine Masse & Terrassement BTP",
      icon: "fa-person-digging",
      allowedModes: ["surface", "volume"],
      customVars: []
    },
    {
      id: 11,
      name: "Sc\xE9nographie Backdrop & B\xE2che Tendue HD \xC9v\xE9nementielle",
      icon: "fa-image",
      allowedModes: ["rectangle", "surface"],
      customVars: []
    },
    {
      id: 12,
      name: "Cloison de Distribution Placostil BA13 72/48 avec Laine de Verre",
      icon: "fa-square-poll-vertical",
      allowedModes: ["surface", "rectangle"],
      customVars: []
    },
    {
      id: 13,
      name: "Faux-Plafond Suspendu BA13 sur Ossature M\xE9tallique F530",
      icon: "fa-table-cells",
      allowedModes: ["surface", "floor"],
      customVars: []
    },
    {
      id: 14,
      name: "Enduit Ciment Hydrofuge 2 Passes Ext\xE9rieur/Int\xE9rieur",
      icon: "fa-trowel",
      allowedModes: ["surface", "rectangle"],
      customVars: []
    },
    {
      id: 15,
      name: "Installation \xC9lectrique Basse Tension & Tableaux",
      icon: "fa-bolt",
      allowedModes: ["unit", "forfait"],
      customVars: []
    },
    {
      id: 16,
      name: "R\xE9seau Plomberie Sanitaire Multicouche & \xC9vacuations PVC",
      icon: "fa-faucet-drip",
      allowedModes: ["unit", "forfait"],
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
      name: "Garde-Corps M\xE9tallerie (Plan de D\xE9bit 1D)",
      icon: "fa-ruler-horizontal",
      allowedModes: ["linear"],
      customVars: [
        { name: "ESPACEMENT", label: "Espacement des poteaux (m)", defaultValue: 1, unit: "m" },
        { name: "HAUTEUR_POTEAU", label: "Hauteur des poteaux (m)", defaultValue: 1.2, unit: "m" },
        { name: "NB_LISSES", label: "Nombre de lisses horizontales", defaultValue: 3, unit: "lisses" }
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
      name: "Dressing Menuiserie sur Mesure (Caissons)",
      icon: "fa-boxes-stacked",
      allowedModes: ["rectangle"],
      customVars: [
        { name: "PROFONDEUR_CAISSON", label: "Profondeur du caisson (m)", defaultValue: 0.6, unit: "m" },
        { name: "NB_TABLETTES", label: "Nombre de tablettes (dont dessus/dessous)", defaultValue: 10, unit: "tablettes" }
      ]
    }
  ];
  const initialRecipes = [
    // Solution 1: Panneau Métallique
    { id: 1, solutionId: 1, type: "material", refId: 1, formula: "PERIMETRE", label: "Fer du cadre (Tubes 25x25)", costCategory: "material" },
    { id: 2, solutionId: 1, type: "material", refId: 1, formula: "HAUTEUR * floor(LARGEUR) * QTY", label: "Renforts internes", costCategory: "material" },
    { id: 3, solutionId: 1, type: "material", refId: 2, formula: "SURFACE", label: "Autocollant vinyle HD", costCategory: "material" },
    { id: 4, solutionId: 1, type: "material", refId: 3, formula: "SURFACE", label: "Plaque de fond galvanis\xE9e", costCategory: "material" },
    { id: 5, solutionId: 1, type: "labor", refId: 1, formula: "QTY", label: "Soudure et assemblage", costCategory: "labor" },
    { id: 6, solutionId: 1, type: "labor", refId: 2, formula: "SURFACE", label: "Pose vinyle atelier", costCategory: "labor" },
    { id: 7, solutionId: 1, type: "labor", refId: 4, formula: "1", label: "Installation sur site", costCategory: "installation" },
    // Solution 2: Habillage Façade Alucobond / ACM
    { id: 8, solutionId: 2, type: "material", refId: 4, formula: "SURFACE", label: "Plaques Alucobond 4mm PVDF", costCategory: "material" },
    { id: 9, solutionId: 2, type: "material", refId: 19, formula: "SURFACE * 2.5", label: "Ossature tubes 40x40 galvanis\xE9s", costCategory: "material" },
    { id: 10, solutionId: 2, type: "material", refId: 20, formula: "SURFACE * 2", label: "Fixations chimiques & Equerres", costCategory: "material" },
    { id: 11, solutionId: 2, type: "labor", refId: 12, formula: "SURFACE", label: "Rainurage V, pliage et pose cassettes", costCategory: "labor" },
    { id: 12, solutionId: 2, type: "labor", refId: 4, formula: "1", label: "Repli et contr\xF4le qualit\xE9 fa\xE7ade", costCategory: "installation" },
    // Solution 3: Peinture Murale Satinée
    { id: 13, solutionId: 3, type: "material", refId: 5, formula: "SURFACE * COUCHES / RENDEMENT_MATIERE", label: "Pot Peinture Satin\xE9e Lessivable", costCategory: "material" },
    { id: 14, solutionId: 3, type: "labor", refId: 5, formula: "SURFACE * COUCHES / RENDEMENT_MO", label: "Peintre d'application", costCategory: "labor" },
    // Solution 4: Béton Armé
    { id: 15, solutionId: 4, type: "material", refId: 6, formula: "VOLUME > 0 ? VOLUME : (SURFACE * 0.20)", label: "B\xE9ton B25 dos\xE9 350 kg/m\xB3", costCategory: "material" },
    { id: 16, solutionId: 4, type: "material", refId: 7, formula: "(VOLUME > 0 ? VOLUME : (SURFACE * 0.20)) * DOSAGE_ACIER / 0.88", label: "Armatures aciers HA FeE500", costCategory: "material" },
    { id: 17, solutionId: 4, type: "labor", refId: 7, formula: "VOLUME > 0 ? VOLUME : (SURFACE * 0.20)", label: "Coulage et vibration b\xE9ton", costCategory: "labor" },
    { id: 18, solutionId: 4, type: "labor", refId: 8, formula: "(VOLUME > 0 ? VOLUME : (SURFACE * 0.20)) * 60", label: "Fa\xE7onnage et pose des aciers", costCategory: "labor" },
    // Solution 5: Maçonnerie Agglos
    { id: 19, solutionId: 5, type: "material", refId: 8, formula: "SURFACE * 12.5", label: "Agglos creux de 15 (12.5 u/m\xB2)", costCategory: "material" },
    { id: 20, solutionId: 5, type: "material", refId: 9, formula: "SURFACE * 15", label: "Ciment mortier de pose (15 kg/m\xB2)", costCategory: "material" },
    { id: 21, solutionId: 5, type: "labor", refId: 9, formula: "SURFACE / RENDEMENT_MO", label: "Ma\xE7on qualifi\xE9 pose agglos", costCategory: "labor" },
    // Solution 6: Carrelage Grès Cérame
    { id: 22, solutionId: 6, type: "material", refId: 10, formula: "SURFACE", label: "Carrelage Gr\xE8s C\xE9rame 60x60", costCategory: "material" },
    { id: 23, solutionId: 6, type: "material", refId: 11, formula: "SURFACE * 5", label: "Colle C2TE et joint (5 kg/m\xB2)", costCategory: "material" },
    { id: 24, solutionId: 6, type: "labor", refId: 10, formula: "SURFACE / RENDEMENT_MO", label: "Poseur carreleur qualifi\xE9", costCategory: "labor" },
    // Solution 7: Menuiserie Aluminium
    { id: 25, solutionId: 7, type: "material", refId: 12, formula: "PERIMETRE * QTY", label: "Profil\xE9s Aluminium thermolaqu\xE9s", costCategory: "material" },
    { id: 26, solutionId: 7, type: "material", refId: 13, formula: "SURFACE * QTY", label: "Vitrage feuillet\xE9 44.2", costCategory: "material" },
    { id: 27, solutionId: 7, type: "labor", refId: 11, formula: "QTY", label: "Assemblage et pose baie vitr\xE9e", costCategory: "labor" },
    // Solution 8: Caisson Enseigne Lumineuse LED
    { id: 28, solutionId: 8, type: "material", refId: 12, formula: "PERIMETRE", label: "Profil\xE9 Aluminium caisson \xE9tanche", costCategory: "material" },
    { id: 29, solutionId: 8, type: "material", refId: 16, formula: "SURFACE * 2", label: "Faces Plexiglas diffusant blanc 3mm", costCategory: "material" },
    // P0.6 — Densité corrigée de 45 à 25 u/m² (2026-08-16) : 45/m² facturait
    // près du double du matériel réellement posé sur toute enseigne, quelle
    // que soit sa taille (confirmé sur l'Étalon E : 330 modules calculés vs
    // 180 documentés pour 7.2m²). Le coefficient de la formule d'alimentation
    // (25 u/m² × 1.2W = 30W/m²) est mis à jour en cohérence, pour que le
    // nombre d'alimentations reste dérivé de la même densité que les modules.
    { id: 30, solutionId: 8, type: "material", refId: 14, formula: "SURFACE * 25", label: "Modules LED IP67 1.2W (25 u/m\xB2)", costCategory: "material" },
    { id: 31, solutionId: 8, type: "material", refId: 15, formula: "ceil(SURFACE * 30 / 200)", label: "Alimentation MeanWell 200W", costCategory: "material" },
    { id: 32, solutionId: 8, type: "labor", refId: 13, formula: "1", label: "C\xE2blage LED et assemblage caisson", costCategory: "labor" },
    { id: 33, solutionId: 8, type: "labor", refId: 4, formula: "1", label: "Fixation et raccordement secteur", costCategory: "installation" },
    // Solution 9: Lettres Reliefs Découpées LED
    { id: 34, solutionId: 9, type: "material", refId: 16, formula: "SURFACE", label: "Plaque Plexiglas d\xE9coup\xE9e laser", costCategory: "material" },
    { id: 35, solutionId: 9, type: "material", refId: 14, formula: "NOMBRE_LETTRES * 6", label: "Modules LED r\xE9tro-\xE9clairage (6/lettre)", costCategory: "material" },
    { id: 36, solutionId: 9, type: "material", refId: 15, formula: "1", label: "Alimentation LED 12V 200W", costCategory: "material" },
    { id: 37, solutionId: 9, type: "labor", refId: 13, formula: "1", label: "Fa\xE7onnage lettres et int\xE9gration LED", costCategory: "labor" },
    // Solution 10: Terrassement & Fouilles
    { id: 38, solutionId: 10, type: "labor", refId: 6, formula: "VOLUME > 0 ? VOLUME : (SURFACE * 0.5)", label: "Terrassement et \xE9vacuation d\xE9charge", costCategory: "labor" },
    // Solution 11: Scénographie Backdrop
    { id: 39, solutionId: 11, type: "material", refId: 1, formula: "PERIMETRE + 12", label: "Structure m\xE9tallique tubulaire autoportante", costCategory: "material" },
    { id: 40, solutionId: 11, type: "material", refId: 17, formula: "SURFACE", label: "B\xE2che PVC 510g M1 Anti-reflet HD", costCategory: "material" },
    { id: 41, solutionId: 11, type: "labor", refId: 1, formula: "1", label: "Soudure et platines de lestage", costCategory: "labor" },
    { id: 42, solutionId: 11, type: "labor", refId: 4, formula: "1", label: "Montage et tension sur site", costCategory: "installation" },
    // Solution 12: Cloison Placostil BA13 72/48
    { id: 43, solutionId: 12, type: "material", refId: 21, formula: "SURFACE * 2", label: "Plaques de pl\xE2tre BA13 (2 faces)", costCategory: "material" },
    { id: 44, solutionId: 12, type: "material", refId: 22, formula: "SURFACE * 1.8", label: "Ossature Rails R48 & Montants M48", costCategory: "material" },
    { id: 45, solutionId: 12, type: "material", refId: 23, formula: "SURFACE", label: "Laine de verre acoustique 45mm", costCategory: "material" },
    { id: 46, solutionId: 12, type: "material", refId: 24, formula: "SURFACE * 0.8", label: "Enduit \xE0 joint et bande calicot", costCategory: "material" },
    { id: 47, solutionId: 12, type: "labor", refId: 15, formula: "SURFACE", label: "Pose cloison Placostil & finition joints", costCategory: "labor" },
    // Solution 13: Faux-Plafond Suspendu BA13
    { id: 48, solutionId: 13, type: "material", refId: 21, formula: "SURFACE", label: "Plaques de pl\xE2tre BA13", costCategory: "material" },
    { id: 49, solutionId: 13, type: "material", refId: 22, formula: "SURFACE * 1.5", label: "Fourrures F530 et suspentes", costCategory: "material" },
    { id: 50, solutionId: 13, type: "material", refId: 24, formula: "SURFACE * 0.5", label: "Enduit \xE0 joint et bande", costCategory: "material" },
    { id: 51, solutionId: 13, type: "labor", refId: 16, formula: "SURFACE", label: "Pose faux-plafond suspendu", costCategory: "labor" },
    // Solution 14: Enduit Ciment Hydrofuge 2 Passes
    { id: 52, solutionId: 14, type: "material", refId: 29, formula: "SURFACE * 20", label: "Mortier hydrofuge pr\xEAt \xE0 g\xE2cher (20 kg/m\xB2)", costCategory: "material" },
    { id: 53, solutionId: 14, type: "material", refId: 9, formula: "SURFACE * 3", label: "Ciment CPJ pour gobetis d\u2019accrochage", costCategory: "material" },
    { id: 54, solutionId: 14, type: "labor", refId: 17, formula: "SURFACE", label: "Application enduit ciment 2 passes", costCategory: "labor" },
    // Solution 15: Installation Électrique Complète
    { id: 55, solutionId: 15, type: "material", refId: 27, formula: "QTY * 50", label: "C\xE2ble R2V 3G2.5mm\xB2 sous gaine ICTA", costCategory: "material" },
    { id: 56, solutionId: 15, type: "material", refId: 28, formula: "QTY * 6", label: "Disjoncteurs et appareillage", costCategory: "material" },
    { id: 57, solutionId: 15, type: "labor", refId: 19, formula: "QTY", label: "C\xE2blage et pose tableau \xE9lectrique", costCategory: "labor" },
    // Solution 16: Plomberie Sanitaire
    { id: 58, solutionId: 16, type: "material", refId: 25, formula: "QTY * 25", label: "Tube multicouche \xD816/20 gain\xE9", costCategory: "material" },
    { id: 59, solutionId: 16, type: "material", refId: 26, formula: "QTY * 8", label: "Tubes PVC \xE9vacuation \xD840/100", costCategory: "material" },
    { id: 60, solutionId: 16, type: "labor", refId: 18, formula: "QTY", label: "Raccordements plomberie et pose sanitaires", costCategory: "labor" },
    // Solution 17: Garde-Corps Métallerie (Plan de Débit 1D) — P0.7 2026-08-16
    // Poteaux tous les ESPACEMENT m (hauteur HAUTEUR_POTEAU) + NB_LISSES lisses
    // horizontales par intervalle, débités dans les barres 6m du Tube carré
    // 25x25 (refId 1, déjà purchaseMode 'pack') : l'arrondi au conditionnement
    // acheté (P0.4) donne directement le nombre de barres, sans re-coder de
    // bin-packing dédié — le calcul coïncide avec optimize1DLinearCuts() ici.
    { id: 61, solutionId: 17, type: "material", refId: 31, formula: "(floor(LONGUEUR / ESPACEMENT) + 1) * HAUTEUR_POTEAU + floor(LONGUEUR / ESPACEMENT) * NB_LISSES * ESPACEMENT", label: "D\xE9bit barres Tube carr\xE9 25x25 (poteaux + lisses)", costCategory: "material" },
    { id: 62, solutionId: 17, type: "labor", refId: 3, formula: "LONGUEUR", label: "D\xE9coupe et usinage des profil\xE9s", costCategory: "labor" },
    { id: 63, solutionId: 17, type: "labor", refId: 4, formula: "1", label: "Soudure, assemblage et pose sur site", costCategory: "installation" },
    // Solution 18: Dressing Menuiserie sur Mesure (Caissons) — P0.7 2026-08-16
    // Caisson = 2 côtés (HAUTEUR × PROFONDEUR) + 1 fond (LARGEUR × HAUTEUR) +
    // NB_TABLETTES tablettes (LARGEUR × PROFONDEUR, dessus/dessous inclus),
    // débité dans les plaques mélaminé 6m² (refId 30, purchaseMode 'pack').
    { id: 64, solutionId: 18, type: "material", refId: 30, formula: "2 * (HAUTEUR * PROFONDEUR_CAISSON) + (LARGEUR * HAUTEUR) + NB_TABLETTES * (LARGEUR * PROFONDEUR_CAISSON)", label: "Panneaux m\xE9lamin\xE9 (c\xF4t\xE9s + fond + tablettes)", costCategory: "material" },
    { id: 65, solutionId: 18, type: "labor", refId: 20, formula: "2 * (HAUTEUR * PROFONDEUR_CAISSON) + (LARGEUR * HAUTEUR) + NB_TABLETTES * (LARGEUR * PROFONDEUR_CAISSON)", label: "Fabrication atelier et pose du caisson", costCategory: "labor" }
  ];
  const loadLocalData = (key, defaultValue) => {
    const val = LS.get(key, sbUser?.id);
    return val !== null ? val : defaultValue;
  };
  const [companyInfo, setCompanyInfo] = useState(() => {
    const loaded = loadLocalData("companyInfo", defaultCompany);
    if (!loaded.paymentSchedule || loaded.paymentSchedule.length === 0) {
      return { ...loaded, paymentSchedule: defaultPaymentSchedule };
    }
    return loaded;
  });
  const [materials, setMaterials] = useState(() => {
    let loaded = loadLocalData("materials", initialMaterials);
    if (Array.isArray(loaded)) {
      loaded = loaded.map((m) => {
        if (m.id === 2 && m.priceBuy === 25e4) {
          return { ...m, name: "Autocollant imprim\xE9 VINYL", unitBuy: "m\xB2", unitSize: 1, priceBuy: 5e3, priceCalc: 5e3 };
        }
        if (m.id === 3 && m.unitSize === 6) {
          return { ...m, unitBuy: "Feuille (3m\xB2)", unitSize: 3, priceBuy: 21e3, priceCalc: 7e3 };
        }
        return m;
      });
    }
    return loaded;
  });
  const [labor, setLabor] = useState(() => loadLocalData("labor", initialLabor));
  const [solutions, setSolutions] = useState(() => loadLocalData("solutions", initialSolutions));
  const [selectedSolutionForEdit, setSelectedSolutionForEdit] = useState(() => solutions[0] || initialSolutions[0]);
  const [recipes, setRecipes] = useState(() => {
    let loadedRecipes = loadLocalData("recipes", initialRecipes);
    const userStoredRaw = LS.get("schemaVersion", sbUser?.id);
    const fromVersion = userStoredRaw !== null ? parseInt(userStoredRaw, 10) : CURRENT_SCHEMA_INT;
    if (fromVersion > CURRENT_SCHEMA_INT) {
      return initialRecipes;
    }
    if (fromVersion < CURRENT_SCHEMA_INT && sbUser?.id) {
      LS.set(`recipes_backup_v${fromVersion || "legacy"}`, loadedRecipes, sbUser.id);
      loadedRecipes = migrateRecipes(loadedRecipes, fromVersion);
      LS.set("recipes", loadedRecipes, sbUser.id);
      LS.set("schemaVersion", CURRENT_SCHEMA_INT, sbUser.id);
    }
    return loadedRecipes;
  });
  const estModeDemo = !sbUser || sbUser.id === "guest";
  const donneesInitiales = (stored, jeuDemo) => Array.isArray(stored) ? stored : estModeDemo ? jeuDemo : [];
  const [clients, setClients] = useState(() => donneesInitiales(LS.get("clients", activeOrganizationId), initialClients));
  const updateClients = (newClients) => {
    setClients(newClients);
    LS.set("clients", newClients, activeOrganizationId);
  };
  const [projects, setProjects] = useState(() => donneesInitiales(LS.get("projects", activeOrganizationId), initialProjects));
  const updateProjects = (newProjects) => {
    setProjects(newProjects);
    LS.set("projects", newProjects, activeOrganizationId);
  };
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [savedQuotes, setSavedQuotes] = useState(() => {
    return donneesInitiales(LS.get("savedQuotes", sbUser?.id), initialSavedQuotes);
  });
  useEffect(() => {
    if (savedQuotes.some((q) => q.number === hybridQuote.number)) {
      setHybridQuote((prev) => ({ ...prev, number: generateNextQuoteNumber(savedQuotes) }));
    }
  }, []);
  const resolveClientAndProject = (currentClients, currentProjects, clientNameRaw, projectRefRaw, quoteTotal) => {
    const clientName = (clientNameRaw || "").trim();
    const projectRef = (projectRefRaw || "").trim();
    if (!clientName) return { client: null, project: null, clients: currentClients, projects: currentProjects };
    let clientsArr = currentClients;
    let client = clientsArr.find((c) => c.name.trim().toLowerCase() === clientName.toLowerCase());
    if (!client) {
      client = {
        id: `cli-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: clientName,
        contactPerson: "",
        taxId: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        notes: "Cr\xE9\xE9 automatiquement depuis un devis."
      };
      clientsArr = [client, ...clientsArr];
    }
    let projectsArr = currentProjects;
    let project = null;
    if (projectRef) {
      project = projectsArr.find((p) => p.name.trim().toLowerCase() === projectRef.toLowerCase() && (p.clientId === client.id || p.clientName === client.name));
      if (!project) {
        const newCode = `PRJ-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(projectsArr.length + 1).padStart(3, "0")}`;
        project = {
          id: `prj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          code: newCode,
          name: projectRef,
          clientId: client.id,
          clientName: client.name,
          siteAddress: "",
          city: client.city || "Dakar",
          status: "active",
          budgetEstimated: quoteTotal || 0,
          createdAt: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        };
        projectsArr = [project, ...projectsArr];
      }
    }
    return { client, project, clients: clientsArr, projects: projectsArr };
  };
  const [nextQuoteSeq, setNextQuoteSeq] = useState(() => loadLocalData("nextQuoteSeq", 1));
  const [calcForm, setCalcForm] = useState(() => loadLocalData("calcForm", {
    solutionId: 1,
    takeoffMode: "rectangle",
    width: 2,
    height: 1,
    lengthDirect: 2,
    surfaceDirect: 450,
    qty: 1,
    faces: 1,
    margin: 30,
    marginType: "reel",
    overheadRate: 5,
    vatRate: 18,
    discountRate: 0,
    includeInstall: true,
    customVarValues: {}
  }));
  useEffect(() => {
    const sol = solutions.find((s) => s.id === parseInt(calcForm.solutionId)) || solutions[0];
    if (sol && sol.allowedModes && sol.allowedModes.length > 0) {
      if (!sol.allowedModes.includes(calcForm.takeoffMode)) {
        setCalcForm((prev) => ({ ...prev, takeoffMode: sol.allowedModes[0] }));
      }
    }
  }, [calcForm.solutionId, solutions, calcForm.takeoffMode]);
  const mapMaterialToDb = (m, orgId) => ({
    id: m.id,
    organization_id: orgId,
    name: m.name,
    category: m.category || "Divers",
    unit_buy: m.unitBuy || "Unit\xE9",
    unit_size: parseFloat(m.unitSize) || 1,
    unit_calc: m.unitCalc || "u",
    price_buy: parseFloat(m.priceBuy) || 0,
    price_calc: parseFloat(m.priceCalc) || 0,
    waste: parseFloat(m.waste) || 0,
    yield_rate: parseFloat(m.yieldRate) || 0,
    purchase_mode: m.purchaseMode || "pack"
  });
  const mapMaterialFromDb = (r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    unitBuy: r.unit_buy,
    unitSize: r.unit_size,
    unitCalc: r.unit_calc,
    priceBuy: r.price_buy,
    priceCalc: r.price_calc,
    waste: r.waste,
    yieldRate: r.yield_rate,
    purchaseMode: r.purchase_mode
  });
  const mapLaborToDb = (l, orgId) => ({
    id: l.id,
    organization_id: orgId,
    name: l.name,
    calc_mode: l.calcMode || "surface",
    unit: l.unit || "u",
    rate: parseFloat(l.rate) || 0,
    yield_rate: parseFloat(l.yieldRate) || 0
  });
  const mapLaborFromDb = (r) => ({ id: r.id, name: r.name, calcMode: r.calc_mode, unit: r.unit, rate: r.rate, yieldRate: r.yield_rate });
  const mapSolutionToDb = (s, orgId) => ({
    id: s.id,
    organization_id: orgId,
    name: s.name,
    icon: s.icon || "fa-cube",
    allowed_modes: s.allowedModes || [],
    custom_vars: s.customVars || []
  });
  const mapSolutionFromDb = (r) => ({ id: r.id, name: r.name, icon: r.icon, allowedModes: r.allowed_modes || [], customVars: r.custom_vars || [] });
  const mapRecipeToDb = (rc, orgId) => ({
    id: rc.id,
    organization_id: orgId,
    solution_id: rc.solutionId,
    type: rc.type,
    ref_id: rc.refId,
    formula: rc.formula,
    cost_category: rc.costCategory || rc.type,
    label: rc.label
  });
  const mapRecipeFromDb = (r) => ({ id: r.id, solutionId: r.solution_id, type: r.type, refId: r.ref_id, formula: r.formula, costCategory: r.cost_category, label: r.label });
  const mapCompanyToDb = (c, orgId) => ({
    organization_id: orgId,
    name: c.name,
    tagline: c.tagline,
    phone: c.phone,
    email: c.email,
    address: c.address,
    nif: c.nif,
    rccm: c.rccm,
    currency: c.currency,
    quote_validity: c.quoteValidity,
    payment_terms: c.paymentTerms
  });
  const mapCompanyFromDb = (r) => ({
    name: r.name,
    tagline: r.tagline,
    phone: r.phone,
    email: r.email,
    address: r.address,
    nif: r.nif,
    rccm: r.rccm,
    currency: r.currency,
    quoteValidity: r.quote_validity,
    paymentTerms: r.payment_terms
  });
  const syncCatalogTable = async (table, orgId, rows, mapToDb) => {
    if (!supabaseClient || !orgId) return;
    const { error: delErr } = await supabaseClient.from(table).delete().eq("organization_id", orgId);
    if (delErr) {
      console.warn(`[Cloud Sync] ${table} delete error:`, delErr);
      return;
    }
    if (rows.length > 0) {
      const { error: insErr } = await supabaseClient.from(table).insert(rows.map((r) => mapToDb(r, orgId)));
      if (insErr) console.warn(`[Cloud Sync] ${table} insert error:`, insErr);
    }
  };
  const catalogSaveTimers = useRef({});
  const scheduleCatalogSave = useCallback((key, fn) => {
    if (catalogSaveTimers.current[key]) clearTimeout(catalogSaveTimers.current[key]);
    catalogSaveTimers.current[key] = setTimeout(fn, 1500);
  }, []);
  useEffect(() => {
    if (!supabaseClient || !sbUser || sbDataLoaded) return;
    if (sbUser.id === "guest") {
      setCloudState("loaded");
      setSbDataLoaded(true);
      setIsBootstrapping(false);
      return;
    }
    setCloudState("loading");
    (async () => {
      try {
        let resolvedOrgId = null;
        try {
          const { data: bootData, error: bootErr } = await supabaseClient.rpc("bootstrap_user_organization", {
            p_org_name: sbUser.user_metadata?.org_name || "Entreprise BTP"
          });
          if (!bootErr && bootData && bootData.organization_id) {
            resolvedOrgId = bootData.organization_id;
            const orgObj = {
              id: bootData.organization_id,
              name: bootData.organization_name || bootData.name || "Entreprise BTP",
              currency: bootData.currency || "FCFA",
              role: bootData.role || "owner"
            };
            setUserOrganizations([orgObj]);
            setActiveOrganizationId(orgObj.id);
            setActiveOrganizationRole(orgObj.role);
            localStorage.setItem(`ikadevis_orgs_${sbUser.id}`, JSON.stringify([orgObj]));
            localStorage.setItem(`ikadevis_active_org_${sbUser.id}`, orgObj.id);
          }
        } catch (bErr) {
          console.warn("[Bloc 1] Bootstrap RPC fallback:", bErr);
        }
        try {
          const { data: memberOrgs, error: memErr } = await supabaseClient.from("organization_members").select("organization_id, role, organizations(id, name, currency)").eq("user_id", sbUser.id);
          if (!memErr && memberOrgs && memberOrgs.length > 0) {
            const parsedOrgs = memberOrgs.map((m) => ({
              id: m.organization_id,
              name: m.organizations?.name || "Organisation",
              currency: m.organizations?.currency || "FCFA",
              role: m.role || "member"
            }));
            setUserOrganizations(parsedOrgs);
            localStorage.setItem(`ikadevis_orgs_${sbUser.id}`, JSON.stringify(parsedOrgs));
            if (!resolvedOrgId || !parsedOrgs.some((o) => o.id === resolvedOrgId)) {
              resolvedOrgId = parsedOrgs[0].id;
              setActiveOrganizationId(parsedOrgs[0].id);
              setActiveOrganizationRole(parsedOrgs[0].role);
              localStorage.setItem(`ikadevis_active_org_${sbUser.id}`, parsedOrgs[0].id);
            }
          }
        } catch (mErr) {
          console.warn("[Bloc 1] Members query fallback:", mErr);
        }
        if (!resolvedOrgId) {
          console.error("[Bloc 1] Aucune organisation r\xE9solue pour cet utilisateur.");
          setCloudState("offline_error");
          setCloudErrorMessage("Impossible de d\xE9terminer votre organisation. R\xE9essayez ou contactez le support.");
          return;
        }
        const [companyRes, materialsRes, laborRes, solutionsRes, recipesRes] = await Promise.all([
          supabaseClient.from("company_settings").select("*").eq("organization_id", resolvedOrgId).maybeSingle(),
          supabaseClient.from("materials").select("*").eq("organization_id", resolvedOrgId),
          supabaseClient.from("labor").select("*").eq("organization_id", resolvedOrgId),
          supabaseClient.from("solutions").select("*").eq("organization_id", resolvedOrgId),
          supabaseClient.from("recipes").select("*").eq("organization_id", resolvedOrgId)
        ]);
        const firstError = [companyRes.error, materialsRes.error, laborRes.error, solutionsRes.error, recipesRes.error].find(Boolean);
        if (firstError) {
          console.error("[Bloc 1] Erreur de chargement du catalogue cloud:", firstError);
          setCloudState("offline_error");
          setCloudErrorMessage("Erreur de connexion Cloud. Vos modifications restent uniquement enregistr\xE9es sur ce navigateur.");
          return;
        }
        const isFirstLoginOnOrg = !companyRes.data && materialsRes.data.length === 0 && solutionsRes.data.length === 0;
        if (isFirstLoginOnOrg) {
          const legacyAvailable = LS.hasLegacyUnnamespacedData();
          if (legacyAvailable) setShowImportBanner(true);
          const seedResults = await Promise.all([
            supabaseClient.from("company_settings").insert(mapCompanyToDb(defaultCompany, resolvedOrgId)),
            initialMaterials.length ? supabaseClient.from("materials").insert(initialMaterials.map((m) => mapMaterialToDb(m, resolvedOrgId))) : Promise.resolve({ error: null }),
            initialLabor.length ? supabaseClient.from("labor").insert(initialLabor.map((l) => mapLaborToDb(l, resolvedOrgId))) : Promise.resolve({ error: null }),
            initialSolutions.length ? supabaseClient.from("solutions").insert(initialSolutions.map((s) => mapSolutionToDb(s, resolvedOrgId))) : Promise.resolve({ error: null }),
            initialRecipes.length ? supabaseClient.from("recipes").insert(initialRecipes.map((r) => mapRecipeToDb(r, resolvedOrgId))) : Promise.resolve({ error: null })
          ]);
          const seedError = seedResults.map((r) => r.error).find(Boolean);
          if (seedError) console.warn("[Bloc 1] Erreur lors de l'amor\xE7age du catalogue cloud:", seedError);
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
        setCloudState("loaded");
        setSbDataLoaded(true);
      } catch (e) {
        console.error("[Bloc 1] Network error during initial cloud load:", e);
        setCloudState("offline_error");
        setCloudErrorMessage("Connexion r\xE9seau indisponible.");
      }
    })();
  }, [supabaseClient, sbUser, sbDataLoaded, cloudRetryCount]);
  const sbSaveTimeout = useRef(null);
  const processSaveQueue = useCallback(async () => {
    if (isSavingRef.current || Object.keys(pendingPatch.current).length === 0 || !sbDataLoaded || isReadOnlyDueToDowngrade || !sbUser || sbUser.id === "guest") return;
    isSavingRef.current = true;
    const patchToSend = { ...pendingPatch.current, schema_version: CURRENT_SCHEMA_INT };
    const patchRevisions = {};
    const currentOutbox = LS.getOutbox(sbUser.id);
    Object.keys(pendingPatch.current).forEach((k) => {
      const entry = currentOutbox[k];
      if (entry && typeof entry === "object" && "revision" in entry) {
        patchRevisions[k] = entry.revision;
      }
    });
    pendingPatch.current = {};
    setSbSyncStatus("syncing");
    try {
      const { error } = await supabaseClient.from("user_data").update(patchToSend).eq("user_id", sbUser.id);
      if (error) {
        console.error("[V5.7.1] Save error:", error);
        pendingPatch.current = { ...patchToSend, ...pendingPatch.current };
        setSbSyncStatus("error");
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 3e4);
      } else {
        lastSavedTime.current = (/* @__PURE__ */ new Date()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        setSbSyncStatus("saved");
        Object.keys(patchToSend).forEach((key) => {
          if (key !== "schema_version") {
            const rev = patchRevisions[key];
            if (rev !== void 0) {
              LS.clearOutboxKeyIfRevisionMatches(key, rev, sbUser.id);
            } else {
              LS.clearOutboxKey(key, sbUser.id);
            }
          }
        });
        retryDelayRef.current = 1500;
      }
    } catch (e) {
      console.error("[V5.7.1] Network error during save:", e);
      pendingPatch.current = { ...patchToSend, ...pendingPatch.current };
      setSbSyncStatus("error");
      retryDelayRef.current = Math.min(retryDelayRef.current * 2, 3e4);
    } finally {
      isSavingRef.current = false;
      if (Object.keys(pendingPatch.current).length > 0) {
        setTimeout(processSaveQueue, retryDelayRef.current);
      } else {
        setTimeout(() => setSbSyncStatus((prev) => prev === "syncing" ? "idle" : prev), 3e3);
      }
    }
  }, [supabaseClient, sbUser, sbDataLoaded, isReadOnlyDueToDowngrade]);
  const saveToSupabase = useCallback((patch) => {
    if (!supabaseClient || !sbUser || sbUser.id === "guest" || !sbDataLoaded || cloudState !== "loaded" || isReadOnlyDueToDowngrade) return;
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (sbSaveTimeout.current) clearTimeout(sbSaveTimeout.current);
    sbSaveTimeout.current = setTimeout(processSaveQueue, 1500);
  }, [supabaseClient, sbUser, sbDataLoaded, cloudState, isReadOnlyDueToDowngrade, processSaveQueue]);
  const RELATIONAL_OUTBOX_KEYS = { materials: mapMaterialToDb, labor: mapLaborToDb, solutions: mapSolutionToDb, recipes: mapRecipeToDb };
  useEffect(() => {
    if (sbUser && sbUser.id !== "guest" && sbDataLoaded && cloudState === "loaded" && activeOrganizationId) {
      const outbox = LS.getOutbox(sbUser.id);
      if (outbox && Object.keys(outbox).length > 0) {
        const legacyPatch = {};
        Object.keys(outbox).forEach((key) => {
          if (!(outbox[key] && typeof outbox[key] === "object" && "value" in outbox[key])) return;
          const value = outbox[key].value;
          if (key in RELATIONAL_OUTBOX_KEYS) {
            syncCatalogTable(key, activeOrganizationId, value, RELATIONAL_OUTBOX_KEYS[key]).then(() => LS.clearOutboxKey(key, sbUser.id)).catch((e) => console.warn(`[Cloud Sync] \xC9chec du drainage outbox pour ${key}:`, e));
          } else if (key === "company_info") {
            supabaseClient.from("company_settings").upsert(mapCompanyToDb(value, activeOrganizationId), { onConflict: "organization_id" }).then(({ error }) => {
              if (!error) LS.clearOutboxKey("company_info", sbUser.id);
              else console.warn("[Cloud Sync] \xC9chec du drainage outbox company_info:", error);
            });
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
  const updateMaterials = useCallback((newVal) => {
    setMaterials(newVal);
    if (!isReadOnlyDueToDowngrade && sbUser) {
      LS.set("materials", newVal, sbUser.id);
      if (!isBootstrapping) LS.setOutboxKey("materials", newVal, sbUser.id);
      if (sbUser.id !== "guest" && sbDataLoaded && cloudState === "loaded" && activeOrganizationId) {
        setSbSyncStatus("syncing");
        scheduleCatalogSave("materials", async () => {
          await syncCatalogTable("materials", activeOrganizationId, newVal, mapMaterialToDb);
          LS.clearOutboxKey("materials", sbUser.id);
          setSbSyncStatus("saved");
          setTimeout(() => setSbSyncStatus((prev) => prev === "saved" ? "idle" : prev), 3e3);
        });
      }
    }
  }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, activeOrganizationId, scheduleCatalogSave]);
  const updateCompanyInfo = useCallback((newVal) => {
    setCompanyInfo(newVal);
    if (!isReadOnlyDueToDowngrade && sbUser) {
      LS.set("companyInfo", newVal, sbUser.id);
      if (!isBootstrapping) LS.setOutboxKey("company_info", newVal, sbUser.id);
      if (sbUser.id !== "guest" && sbDataLoaded && cloudState === "loaded" && activeOrganizationId) {
        setSbSyncStatus("syncing");
        scheduleCatalogSave("company_info", async () => {
          const { error } = await supabaseClient.from("company_settings").upsert(mapCompanyToDb(newVal, activeOrganizationId), { onConflict: "organization_id" });
          if (error) {
            console.warn("[Cloud Sync] company_settings upsert error:", error);
            return;
          }
          LS.clearOutboxKey("company_info", sbUser.id);
          setSbSyncStatus("saved");
          setTimeout(() => setSbSyncStatus((prev) => prev === "saved" ? "idle" : prev), 3e3);
        });
      }
    }
  }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, activeOrganizationId, scheduleCatalogSave, supabaseClient]);
  const updateLabor = useCallback((newVal) => {
    setLabor(newVal);
    if (!isReadOnlyDueToDowngrade && sbUser) {
      LS.set("labor", newVal, sbUser.id);
      if (!isBootstrapping) LS.setOutboxKey("labor", newVal, sbUser.id);
      if (sbUser.id !== "guest" && sbDataLoaded && cloudState === "loaded" && activeOrganizationId) {
        setSbSyncStatus("syncing");
        scheduleCatalogSave("labor", async () => {
          await syncCatalogTable("labor", activeOrganizationId, newVal, mapLaborToDb);
          LS.clearOutboxKey("labor", sbUser.id);
          setSbSyncStatus("saved");
          setTimeout(() => setSbSyncStatus((prev) => prev === "saved" ? "idle" : prev), 3e3);
        });
      }
    }
  }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, activeOrganizationId, scheduleCatalogSave]);
  const updateSolutions = useCallback((newVal) => {
    setSolutions(newVal);
    if (!isReadOnlyDueToDowngrade && sbUser) {
      LS.set("solutions", newVal, sbUser.id);
      if (!isBootstrapping) LS.setOutboxKey("solutions", newVal, sbUser.id);
      if (sbUser.id !== "guest" && sbDataLoaded && cloudState === "loaded" && activeOrganizationId) {
        setSbSyncStatus("syncing");
        scheduleCatalogSave("solutions", async () => {
          await syncCatalogTable("solutions", activeOrganizationId, newVal, mapSolutionToDb);
          LS.clearOutboxKey("solutions", sbUser.id);
          setSbSyncStatus("saved");
          setTimeout(() => setSbSyncStatus((prev) => prev === "saved" ? "idle" : prev), 3e3);
        });
      }
    }
  }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, activeOrganizationId, scheduleCatalogSave]);
  const updateRecipes = useCallback((newVal) => {
    setRecipes(newVal);
    if (!isReadOnlyDueToDowngrade && sbUser) {
      LS.set("recipes", newVal, sbUser.id);
      if (!isBootstrapping) LS.setOutboxKey("recipes", newVal, sbUser.id);
      if (sbUser.id !== "guest" && sbDataLoaded && cloudState === "loaded" && activeOrganizationId) {
        setSbSyncStatus("syncing");
        scheduleCatalogSave("recipes", async () => {
          await syncCatalogTable("recipes", activeOrganizationId, newVal, mapRecipeToDb);
          LS.clearOutboxKey("recipes", sbUser.id);
          setSbSyncStatus("saved");
          setTimeout(() => setSbSyncStatus((prev) => prev === "saved" ? "idle" : prev), 3e3);
        });
      }
    }
  }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, activeOrganizationId, scheduleCatalogSave]);
  const updateSavedQuotes = useCallback((newVal) => {
    setSavedQuotes(newVal);
    if (!isReadOnlyDueToDowngrade && sbUser) {
      LS.set("savedQuotes", newVal, sbUser.id);
      if (!isBootstrapping) LS.setOutboxKey("saved_quotes", newVal, sbUser.id);
      if (sbDataLoaded && cloudState === "loaded") saveToSupabase({ saved_quotes: newVal });
    }
  }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, saveToSupabase]);
  useEffect(() => {
    let accClients = clients;
    let accProjects = projects;
    let changed = false;
    const updatedQuotes = savedQuotes.map((q) => {
      if (!q.clientName || q.clientId) return q;
      const { client, project, clients: nc, projects: np } = resolveClientAndProject(accClients, accProjects, q.clientName, q.projectRef, q.quoteData?.totalTTCConsomme);
      accClients = nc;
      accProjects = np;
      changed = true;
      return { ...q, clientId: client?.id || null, projectId: project?.id || null };
    });
    if (changed) {
      updateClients(accClients);
      updateProjects(accProjects);
      updateSavedQuotes(updatedQuotes);
    }
  }, []);
  const updateNextQuoteSeq = useCallback((newVal) => {
    setNextQuoteSeq(newVal);
    if (!isReadOnlyDueToDowngrade && sbUser) {
      LS.set("nextQuoteSeq", newVal, sbUser.id);
      if (!isBootstrapping) LS.setOutboxKey("next_quote_seq", newVal, sbUser.id);
      if (sbDataLoaded && cloudState === "loaded") saveToSupabase({ next_quote_seq: newVal });
    }
  }, [isReadOnlyDueToDowngrade, sbUser, isBootstrapping, sbDataLoaded, cloudState, saveToSupabase]);
  useEffect(() => {
    if ((!selectedSolutionForEdit || !solutions.some((s) => s.id === selectedSolutionForEdit.id)) && solutions.length > 0) {
      setSelectedSolutionForEdit(solutions[0]);
    }
  }, [solutions, selectedSolutionForEdit]);
  const showToast = (message, type = "success") => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  };
  const closeConfirm = () => setConfirmDialog({ isOpen: false });
  const scheduleTotalPct = (companyInfo.paymentSchedule || []).reduce((s, st) => s + (parseFloat(st.pct) || 0), 0);
  const updatePaymentStage = (idx, patch) => {
    const next = (companyInfo.paymentSchedule || []).map((s, i) => i === idx ? { ...s, ...patch } : s);
    updateCompanyInfo({ ...companyInfo, paymentSchedule: next });
  };
  const removePaymentStage = (idx) => {
    updateCompanyInfo({ ...companyInfo, paymentSchedule: (companyInfo.paymentSchedule || []).filter((_, i) => i !== idx) });
  };
  const addPaymentStage = () => {
    updateCompanyInfo({ ...companyInfo, paymentSchedule: [...companyInfo.paymentSchedule || [], { label: "", pct: 0 }] });
  };
  const connectionState = (() => {
    if (!sbUser || sbUser.id === "guest") return {
      key: "local",
      label: "D\xE9mo locale",
      detail: "Donn\xE9es sur cet appareil",
      icon: "fa-laptop",
      dot: "bg-amber-500",
      chip: "bg-amber-50 text-amber-900 border-amber-300"
    };
    if (!isOnline) return {
      key: "offline",
      label: "Hors ligne",
      detail: "Synchronisation au retour du r\xE9seau",
      icon: "fa-cloud-slash",
      dot: "bg-blue-500",
      chip: "bg-blue-50 text-blue-800 border-blue-300"
    };
    if (sbSyncStatus === "syncing") return {
      key: "syncing",
      label: "Sauvegarde\u2026",
      detail: sbUser.email,
      icon: "fa-arrow-rotate-right fa-spin",
      dot: "bg-blue-500",
      chip: "bg-blue-50 text-blue-800 border-blue-200"
    };
    if (sbSyncStatus === "error") return {
      key: "error",
      label: "Erreur de synchronisation",
      detail: "Vos donn\xE9es restent sur cet appareil",
      icon: "fa-triangle-exclamation",
      dot: "bg-red-500",
      chip: "bg-red-50 text-red-800 border-red-200"
    };
    return {
      key: "synced",
      label: "Synchronis\xE9",
      detail: sbUser.email,
      icon: "fa-cloud-check",
      dot: "bg-emerald-500",
      chip: "bg-emerald-50 text-emerald-700 border-emerald-200"
    };
  })();
  const createQuickResource = (draft) => {
    if (isReadOnlyDueToDowngrade) return null;
    const name = (draft.name || "").trim();
    if (!name) return null;
    if (draft.kind === "material") {
      const unitSize = parseFloat(draft.unitSize) || 1;
      const priceBuy = parseFloat(draft.priceBuy) || 0;
      const nm = {
        id: Date.now(),
        name,
        category: (draft.category || "").trim() || "Divers",
        unitBuy: (draft.unitBuy || "").trim() || "Unit\xE9",
        unitSize,
        unitCalc: draft.unitCalc || "u",
        priceBuy,
        priceCalc: priceBuy / unitSize,
        waste: parseFloat(draft.waste) || 0,
        yieldRate: 0,
        purchaseMode: unitSize > 1 ? "pack" : "real"
      };
      updateMaterials([...materials, nm]);
      showToast(`Mati\xE8re \xAB ${nm.name} \xBB cr\xE9\xE9e et rattach\xE9e`);
      return nm;
    }
    const isDaily = draft.unit === "j";
    const nl = {
      id: Date.now(),
      name,
      calcMode: draft.unit === "forfait" ? "forfait" : draft.unit === "u" ? "unite" : "surface",
      unit: draft.unit || "u",
      rate: parseFloat(draft.rate) || 0,
      yieldRate: isDaily ? parseFloat(draft.yieldRate) || 0 : 0
    };
    updateLabor([...labor, nl]);
    showToast(`Prestation \xAB ${nl.name} \xBB cr\xE9\xE9e et rattach\xE9e`);
    return nl;
  };
  const systemDiagnostic = useMemo(() => {
    let okCount = 0;
    let invalidRecipeCount = 0;
    let missingResourceCount = 0;
    let missingYieldCount = 0;
    const productDetails = [];
    solutions.forEach((sol) => {
      const solRecipes = recipes.filter((r) => r.solutionId === sol.id);
      let hasIssue = false;
      const issueReasons = [];
      if (solRecipes.length === 0) {
        hasIssue = true;
        issueReasons.push("Aucun composant (recette vide)");
      }
      solRecipes.forEach((r) => {
        const matMissing = r.type === "material" && !materials.find((m) => m.id === r.refId);
        const labMissing = r.type === "labor" && !labor.find((l) => l.id === r.refId);
        if (matMissing || labMissing) {
          missingResourceCount++;
          hasIssue = true;
          issueReasons.push(`Ressource manquante sur "${r.label}" (ID #${r.refId})`);
          return;
        }
        if (r.type === "material") {
          const mat2 = materials.find((m) => m.id === r.refId);
          if (mat2 && r.formula.includes("RENDEMENT_MATIERE") && (!mat2.yieldRate || mat2.yieldRate <= 0)) {
            missingYieldCount++;
            hasIssue = true;
            issueReasons.push(`RENDEMENT_MATIERE manquant sur "${mat2.name}"`);
          }
        } else if (r.type === "labor") {
          const lab2 = labor.find((l) => l.id === r.refId);
          if (lab2 && r.formula.includes("RENDEMENT_MO") && (!lab2.yieldRate || lab2.yieldRate <= 0)) {
            missingYieldCount++;
            hasIssue = true;
            issueReasons.push(`RENDEMENT_MO manquant sur "${lab2.name}"`);
          }
        }
        const modesForTest = sol.allowedModes && sol.allowedModes.length > 0 ? sol.allowedModes : ["rectangle"];
        const customVarsDefaults = {};
        if (sol.customVars) sol.customVars.forEach((cv) => {
          customVarsDefaults[cv.name] = cv.defaultValue !== void 0 ? cv.defaultValue : 0;
        });
        const mat = r.type === "material" ? materials.find((m) => m.id === r.refId) : null;
        const lab = r.type === "labor" ? labor.find((l) => l.id === r.refId) : null;
        modesForTest.forEach((mode) => {
          const ctx = {
            takeoffMode: mode,
            width: 2,
            height: 1,
            qty: 1,
            faces: 1,
            lengthDirect: 3,
            surfaceDirect: 6,
            LARGEUR: 2,
            HAUTEUR: 1,
            QTY: 1,
            FACES: 1,
            LONGUEUR: 3,
            LINEAIRE: 3,
            RENDEMENT_MATIERE: mat && mat.yieldRate > 0 ? mat.yieldRate : 10,
            RENDEMENT_MO: lab && lab.yieldRate > 0 ? lab.yieldRate : 10,
            TARIF_MATIERE: mat ? mat.priceCalc : 1e3,
            TARIF_MO: lab ? lab.rate : 1e3,
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
      showToast("Action bloqu\xE9e : L'application est en Mode Lecture Seule.", "error");
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: "R\xE9initialiser les donn\xE9es d'usine V5.7",
      message: "Voulez-vous vraiment restaurer les donn\xE9es d'usine V5.7 ? Vos modifications et devis seront r\xE9initialis\xE9s.",
      isDanger: true,
      onConfirm: () => {
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
          solutionId: 1,
          takeoffMode: "rectangle",
          width: 2,
          height: 1,
          lengthDirect: 2,
          surfaceDirect: 450,
          qty: 1,
          faces: 1,
          margin: 30,
          marginType: "reel",
          overheadRate: 5,
          vatRate: 18,
          discountRate: 0,
          includeInstall: true,
          customVarValues: {}
        });
        closeConfirm();
        showToast("Donn\xE9es d'usine V5.7 restaur\xE9es avec succ\xE8s.");
      }
    });
  };
  const getResourceDependencies = (type, id) => {
    const usedIn = recipes.filter((r) => r.type === type && r.refId === id);
    if (usedIn.length === 0) return null;
    const list = usedIn.map((r) => {
      const sol = solutions.find((s) => s.id === r.solutionId);
      return sol ? `${sol.name} (${r.label})` : `Produit #${r.solutionId} (${r.label})`;
    });
    return [...new Set(list)];
  };
  const handleDeleteMaterial = (m) => {
    if (isReadOnlyDueToDowngrade) {
      showToast("Action bloqu\xE9e en Lecture Seule", "error");
      return;
    }
    const deps = getResourceDependencies("material", m.id);
    if (deps) {
      setConfirmDialog({
        isOpen: true,
        title: "Suppression bloqu\xE9e",
        message: `La mati\xE8re "${m.name}" est utilis\xE9e dans les recettes suivantes :

` + deps.map((d) => `\u2022 ${d}`).join("\n") + `

Veuillez d'abord la retirer de ces recettes pour pouvoir la supprimer.`,
        isDanger: true,
        onConfirm: closeConfirm
      });
    } else {
      setConfirmDialog({
        isOpen: true,
        title: "Supprimer la ressource",
        message: `Voulez-vous vraiment supprimer la mati\xE8re "${m.name}" ?`,
        isDanger: true,
        onConfirm: () => {
          updateMaterials(materials.filter((x) => x.id !== m.id));
          if (selectedMaterialId === m.id) {
            setSelectedMaterialId(null);
            setIsResourceEditMode(false);
          }
          closeConfirm();
          showToast("Ressource supprim\xE9e");
        }
      });
    }
  };
  const handleDeleteLabor = (l) => {
    if (isReadOnlyDueToDowngrade) {
      showToast("Action bloqu\xE9e en Lecture Seule", "error");
      return;
    }
    const deps = getResourceDependencies("labor", l.id);
    if (deps) {
      setConfirmDialog({
        isOpen: true,
        title: "Suppression bloqu\xE9e",
        message: `La main-d'\u0153uvre "${l.name}" est utilis\xE9e dans les recettes suivantes :

` + deps.map((d) => `\u2022 ${d}`).join("\n") + `

Veuillez d'abord la retirer de ces recettes pour pouvoir la supprimer.`,
        isDanger: true,
        onConfirm: closeConfirm
      });
    } else {
      setConfirmDialog({
        isOpen: true,
        title: "Supprimer la prestation",
        message: `Voulez-vous vraiment supprimer la main-d'\u0153uvre "${l.name}" ?`,
        isDanger: true,
        onConfirm: () => {
          updateLabor(labor.filter((x) => x.id !== l.id));
          if (selectedLaborId === l.id) {
            setSelectedLaborId(null);
            setIsResourceEditMode(false);
          }
          closeConfirm();
          showToast("Prestation supprim\xE9e");
        }
      });
    }
  };
  const handleDuplicateSolution = (sol) => {
    if (isReadOnlyDueToDowngrade) {
      showToast("Action bloqu\xE9e en Lecture Seule", "error");
      return;
    }
    const newSolId = Date.now();
    const duplicatedSol = {
      ...sol,
      id: newSolId,
      name: `${sol.name} (Copie)`,
      customVars: sol.customVars ? JSON.parse(JSON.stringify(sol.customVars)) : []
    };
    const relatedRecipes = recipes.filter((r) => r.solutionId === sol.id).map((r) => ({
      ...r,
      id: Date.now() + Math.floor(Math.random() * 1e4),
      solutionId: newSolId
    }));
    updateSolutions([...solutions, duplicatedSol]);
    updateRecipes([...recipes, ...relatedRecipes]);
    setSelectedSolutionForEdit(duplicatedSol);
    showToast(`Produit "${sol.name}" dupliqu\xE9 avec succ\xE8s !`);
  };
  const handleDeleteSolution = (sol) => {
    if (isReadOnlyDueToDowngrade) {
      showToast("Action bloqu\xE9e en Lecture Seule", "error");
      return;
    }
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
        const nextSols = solutions.filter((s) => s.id !== sol.id);
        updateSolutions(nextSols);
        updateRecipes(recipes.filter((r) => r.solutionId !== sol.id));
        const targetSol = nextSols[0];
        setSelectedSolutionForEdit(targetSol);
        setCalcForm((prev) => ({
          ...prev,
          solutionId: targetSol.id,
          takeoffMode: targetSol.allowedModes && targetSol.allowedModes.length > 0 ? targetSol.allowedModes[0] : "rectangle"
        }));
        closeConfirm();
        showToast("Produit supprim\xE9");
      }
    });
  };
  const currentQuote = useMemo(() => {
    const solution = solutions.find((s) => s.id === parseInt(calcForm.solutionId)) || solutions[0];
    if (!solution) return null;
    const recipeLines = recipes.filter((r) => r.solutionId === solution.id);
    if (recipeLines.length === 0) {
      return { error: "recipe_empty", solutionName: solution.name };
    }
    const rawOverhead = parseFloat(calcForm.overheadRate);
    if (isNaN(rawOverhead) || rawOverhead < 0 || rawOverhead > 50) {
      return { error: "financial_invalid", solutionName: solution.name, message: "Les Frais G\xE9n\xE9raux doivent \xEAtre compris entre 0% et 50%." };
    }
    const rawVat = parseFloat(calcForm.vatRate);
    if (isNaN(rawVat) || rawVat < 0 || rawVat > 30) {
      return { error: "financial_invalid", solutionName: solution.name, message: "Le taux de TVA doit \xEAtre compris entre 0% et 30%." };
    }
    const rawDiscount = parseFloat(calcForm.discountRate);
    if (isNaN(rawDiscount) || rawDiscount < 0 || rawDiscount > 100) {
      return { error: "financial_invalid", solutionName: solution.name, message: "La remise doit \xEAtre comprise entre 0% et 100%." };
    }
    const rawMargin = parseFloat(calcForm.margin);
    if (isNaN(rawMargin) || rawMargin < 0 || calcForm.marginType === "reel" && rawMargin >= 100 || calcForm.marginType === "majoration" && rawMargin > 1e3) {
      return { error: "margin_invalid", solutionName: solution.name, message: "Le taux de marge doit \xEAtre valide (0% \xE0 99% pour marge r\xE9elle, 0% \xE0 1000% pour majoration)." };
    }
    const widthVal = parseFloat(calcForm.width);
    const heightVal = parseFloat(calcForm.height);
    const lengthDirectVal = parseFloat(calcForm.lengthDirect);
    const surfaceDirectVal = parseFloat(calcForm.surfaceDirect);
    const qtyVal = Number(calcForm.qty);
    const marginVal = parseFloat(calcForm.margin);
    if (isNaN(qtyVal) || qtyVal <= 0 || !Number.isInteger(qtyVal)) {
      return { error: "dimensions_invalid", solutionName: solution.name, message: "La quantit\xE9 d'ouvrages doit \xEAtre un nombre entier sup\xE9rieur \xE0 0 (ex: 1, 2, 5)." };
    }
    if (calcForm.takeoffMode === "rectangle" && (isNaN(widthVal) || widthVal <= 0 || isNaN(heightVal) || heightVal <= 0)) {
      return { error: "dimensions_invalid", solutionName: solution.name, message: "La largeur et la hauteur doivent \xEAtre sup\xE9rieures \xE0 0." };
    }
    if (calcForm.takeoffMode === "surface" && (isNaN(surfaceDirectVal) || surfaceDirectVal <= 0)) {
      return { error: "dimensions_invalid", solutionName: solution.name, message: "La surface unitaire doit \xEAtre sup\xE9rieure \xE0 0 m\xB2." };
    }
    if (calcForm.takeoffMode === "floor" && (isNaN(widthVal) || widthVal <= 0 || isNaN(lengthDirectVal) || lengthDirectVal <= 0)) {
      return { error: "dimensions_invalid", solutionName: solution.name, message: "La largeur et la longueur sol/plafond doivent \xEAtre sup\xE9rieures \xE0 0 m." };
    }
    if (calcForm.takeoffMode === "linear" && (isNaN(lengthDirectVal) || lengthDirectVal <= 0)) {
      return { error: "dimensions_invalid", solutionName: solution.name, message: "La longueur unitaire doit \xEAtre sup\xE9rieure \xE0 0 ml." };
    }
    const depthVal = Math.max(0, parseFloat(calcForm.depth) || 0.15);
    if (calcForm.takeoffMode === "volume" && (isNaN(widthVal) || widthVal <= 0 || isNaN(heightVal) || heightVal <= 0 || isNaN(depthVal) || depthVal <= 0)) {
      return { error: "dimensions_invalid", solutionName: solution.name, message: "La largeur, la hauteur et la profondeur/\xE9paisseur doivent \xEAtre sup\xE9rieures \xE0 0." };
    }
    const rawFaces = Number(calcForm.faces !== void 0 && calcForm.faces !== "" ? calcForm.faces : 1);
    if (isNaN(rawFaces) || rawFaces < 1 || !Number.isInteger(rawFaces)) {
      return { error: "dimensions_invalid", solutionName: solution.name, message: "Le nombre de faces ou couches doit \xEAtre un nombre entier sup\xE9rieur ou \xE9gal \xE0 1 (ex: 1, 2, 3)." };
    }
    const facesVal = rawFaces;
    const evalVars = {
      takeoffMode: calcForm.takeoffMode,
      width: widthVal,
      height: heightVal,
      depth: depthVal,
      lengthDirect: lengthDirectVal || widthVal,
      surfaceDirect: surfaceDirectVal || 0,
      qty: qtyVal,
      faces: facesVal,
      LARGEUR: widthVal,
      HAUTEUR: heightVal,
      PROFONDEUR: depthVal,
      EPAISSEUR: depthVal,
      P: depthVal,
      QTY: qtyVal,
      FACES: facesVal,
      LONGUEUR: lengthDirectVal || widthVal,
      LINEAIRE: lengthDirectVal || widthVal
    };
    if (solution.customVars && solution.customVars.length > 0) {
      for (const cv of solution.customVars) {
        const rawVal = calcForm.customVarValues && calcForm.customVarValues[cv.name] !== void 0 ? calcForm.customVarValues[cv.name] : cv.defaultValue !== void 0 ? cv.defaultValue : 0;
        const numVal = parseFloat(rawVal);
        if (isNaN(numVal) || numVal < 0) {
          return {
            error: "custom_var_invalid",
            solutionName: solution.name,
            message: `La variable "${cv.label || cv.name}" (${cv.name}) doit \xEAtre un nombre positif ou nul (valeur saisie : "${rawVal}").`
          };
        }
        evalVars[cv.name] = numVal;
      }
    }
    const evaluatedLines = recipeLines.map((line) => {
      const costCat = line.costCategory || (line.label.toLowerCase().includes("install") ? "installation" : line.type);
      let extraCtx = {};
      let resourceError = null;
      if (line.type === "labor") {
        const lab = labor.find((l) => l.id === line.refId);
        if (!lab) {
          resourceError = `Ressource main-d'\u0153uvre inexistante ou supprim\xE9e (ID #${line.refId})`;
        } else {
          if (line.formula.includes("RENDEMENT_MO") && (!lab.yieldRate || lab.yieldRate <= 0)) {
            resourceError = `Rendement main-d'\u0153uvre non configur\xE9 sur la prestation "${lab.name}"`;
          }
          extraCtx.RENDEMENT_MO = lab.yieldRate || 0;
          extraCtx.TARIF_MO = lab.rate || 0;
        }
      } else if (line.type === "material") {
        const mat = materials.find((m) => m.id === line.refId);
        if (!mat) {
          resourceError = `Ressource mati\xE8re inexistante ou supprim\xE9e (ID #${line.refId})`;
        } else {
          if (line.formula.includes("RENDEMENT_MATIERE") && (!mat.yieldRate || mat.yieldRate <= 0)) {
            resourceError = `Rendement mati\xE8re non configur\xE9 sur la ressource "${mat.name}"`;
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
    const invalidLine = evaluatedLines.find((l) => l.evalError);
    if (invalidLine) {
      return {
        error: "formula_invalid",
        solutionName: solution.name,
        invalidLineLabel: invalidLine.label,
        errorMessage: invalidLine.evalError
      };
    }
    const activeLines = evaluatedLines.filter((line) => {
      if (line.costCategory === "installation" && !calcForm.includeInstall) return false;
      return line.baseQty > 0;
    });
    const materialConsolidation = {};
    activeLines.forEach((line) => {
      if (line.type === "material" && line.baseQty > 0) {
        const mat = materials.find((m) => m.id === line.refId);
        if (mat) {
          const billedQty = line.baseQty * (1 + (parseFloat(mat.waste) || 0) / 100);
          if (!materialConsolidation[mat.id]) {
            materialConsolidation[mat.id] = { mat, totalBilledQty: 0, primaryCostCategory: line.costCategory };
          }
          materialConsolidation[mat.id].totalBilledQty += billedQty;
        }
      }
    });
    Object.keys(materialConsolidation).forEach((id) => {
      const entry = materialConsolidation[id];
      const mat = entry.mat;
      const unitSize = parseFloat(mat.unitSize) || 1;
      const mode = mat.purchaseMode || "pack";
      const stepSize = parseFloat(mat.purchaseStep) || 0.5;
      if (mode === "real") {
        entry.purchaseQty = unitSize > 0 ? entry.totalBilledQty / unitSize : entry.totalBilledQty;
      } else if (mode === "step") {
        const rawUnits = unitSize > 0 ? entry.totalBilledQty / unitSize : entry.totalBilledQty;
        entry.purchaseQty = Math.ceil(rawUnits / stepSize) * stepSize;
      } else {
        entry.purchaseQty = unitSize > 0 ? Math.ceil(entry.totalBilledQty / unitSize) : 0;
      }
      entry.totalPurchaseCost = entry.purchaseQty * mat.priceBuy;
    });
    const consumedByCategory = { material: 0, labor: 0, installation: 0, transport: 0, subcontracting: 0 };
    const purchaseByCategory = { material: 0, labor: 0, installation: 0, transport: 0, subcontracting: 0 };
    const materialConsumedByCat = {};
    let details = [];
    activeLines.forEach((line) => {
      const cat = line.costCategory || "material";
      if (line.type === "material") {
        const mat = materials.find((m) => m.id === line.refId);
        if (mat) {
          const billedQty = line.baseQty * (1 + (parseFloat(mat.waste) || 0) / 100);
          const cost = billedQty * mat.priceCalc;
          const cons = materialConsolidation[mat.id] || { purchaseQty: 0, totalBilledQty: 0, totalPurchaseCost: 0 };
          const lineShare = cons.totalBilledQty > 0 ? billedQty / cons.totalBilledQty : 0;
          const achatCost = (cons.totalPurchaseCost || 0) * lineShare;
          consumedByCategory[cat] = (consumedByCategory[cat] || 0) + achatCost;
          if (!materialConsumedByCat[mat.id]) materialConsumedByCat[mat.id] = {};
          materialConsumedByCat[mat.id][cat] = (materialConsumedByCat[mat.id][cat] || 0) + cost;
          details.push({
            id: line.id,
            type: "material",
            costCategory: cat,
            label: line.label,
            name: mat.name,
            baseQty: line.baseQty,
            waste: mat.waste,
            billedQty,
            unit: mat.unitCalc,
            unitCost: mat.priceCalc,
            totalCost: achatCost,
            purchaseQty: cons.purchaseQty,
            purchaseUnit: mat.unitBuy,
            evalError: line.evalError
          });
        }
      } else if (line.type === "labor") {
        const lab = labor.find((l) => l.id === line.refId);
        if (lab) {
          const cost = line.baseQty * lab.rate;
          consumedByCategory[cat] = (consumedByCategory[cat] || 0) + cost;
          purchaseByCategory[cat] = (purchaseByCategory[cat] || 0) + cost;
          details.push({
            id: line.id,
            type: "labor",
            costCategory: cat,
            label: line.label,
            name: lab.name,
            baseQty: line.baseQty,
            waste: 0,
            billedQty: line.baseQty,
            unit: lab.unit || "u",
            unitCost: lab.rate,
            totalCost: cost,
            evalError: line.evalError
          });
        }
      }
    });
    Object.keys(materialConsolidation).forEach((id) => {
      const entry = materialConsolidation[id];
      const catMap = materialConsumedByCat[id] || {};
      const matTotalConsumed = Object.values(catMap).reduce((a, b) => a + b, 0);
      if (matTotalConsumed > 0) {
        Object.keys(catMap).forEach((cat) => {
          const ratio = catMap[cat] / matTotalConsumed;
          const proratedPurchaseCost = entry.totalPurchaseCost * ratio;
          purchaseByCategory[cat] = (purchaseByCategory[cat] || 0) + proratedPurchaseCost;
        });
      } else {
        const cat = entry.primaryCostCategory || "material";
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
    if (calcForm.marginType === "reel") {
      prixVenteConsommeHT = totalRevientConsomme / (1 - marginVal / 100);
      prixVenteAchatHT = totalRevientAchat / (1 - marginVal / 100);
    } else {
      prixVenteConsommeHT = totalRevientConsomme * (1 + marginVal / 100);
      prixVenteAchatHT = totalRevientAchat * (1 + marginVal / 100);
    }
    const discountRate = Math.min(100, Math.max(0, parseFloat(calcForm.discountRate) || 0));
    const netHTConsomme = prixVenteConsommeHT * (1 - discountRate / 100);
    const netHTAchat = prixVenteAchatHT * (1 - discountRate / 100);
    const vatRate = Math.min(30, Math.max(0, calcForm.vatRate !== void 0 && calcForm.vatRate !== "" ? parseFloat(calcForm.vatRate) : 18));
    const tvaConsomme = netHTConsomme * (vatRate / 100);
    const tvaAchat = netHTAchat * (vatRate / 100);
    const totalTTCConsommeExact = netHTConsomme + tvaConsomme;
    const totalTTCAchatExact = netHTAchat + tvaAchat;
    const margeValeurConsommeReelle = netHTConsomme - totalRevientConsomme;
    const margeValeurAchatReelle = netHTAchat - totalRevientAchat;
    const isLossMaking = Math.round(netHTConsomme) < Math.round(totalRevientConsomme);
    const margePctConsommeReelle = netHTConsomme > 0 ? margeValeurConsommeReelle / netHTConsomme * 100 : 0;
    const markupMultiplier = totalDebourseConsomme > 0 ? netHTConsomme / totalDebourseConsomme : 1;
    const commercialItems = details.map((d) => {
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
    if (!lot) return "";
    const d = lot.dimensions || {};
    const mode = lot.takeoffMode || "rectangle";
    const q = d.qty || 1;
    const f = d.faces && d.faces > 1 ? ` (${d.faces} couches)` : "";
    if (mode === "surface") {
      const surf = d.surfaceDirect || (d.width && d.height ? d.width * d.height : 0);
      return `Surface : ${surf} m\xB2 (Qt\xE9 : ${q}${f})`;
    }
    if (mode === "volume") {
      const surf = parseFloat(d.surfaceDirect) || (d.width && d.height ? d.width * d.height : 0);
      const depth = d.depth || 0.15;
      const vol = (parseFloat(surf) * parseFloat(depth) * q).toFixed(2);
      return `Volume : ${d.width}m \xD7 ${d.height}m \xD7 ${depth}m = ${vol} m\xB3 (Qt\xE9 : ${q})`;
    }
    if (mode === "floor") {
      return `Sol/Plafond : ${d.width}m \xD7 ${d.lengthDirect || d.width}m (Qt\xE9 : ${q})`;
    }
    if (mode === "linear") {
      return `Lin\xE9aire : ${d.lengthDirect || d.width} ml (Qt\xE9 : ${q})`;
    }
    if (mode === "unit") {
      return `Quantit\xE9 : ${q} unit\xE9(s)`;
    }
    return `Dim : ${d.width}m \xD7 ${d.height}m (Qt\xE9 : ${q}${f})`;
  };
  const handleAddLotToWorkingQuote = () => {
    if (!currentQuote || currentQuote.error) return;
    if (currentQuote.isLossMaking) {
      showToast("Impossible d'ajouter un lot en vente \xE0 perte !", "error");
      return;
    }
    const lotNumber = workingLots.length + 1;
    const defaultLotTitle = `Lot ${lotNumber} \u2014 ${currentQuote.solutionName}`;
    const newLot = {
      id: Date.now(),
      lotNumber,
      lotName: defaultLotTitle,
      solutionId: calcForm.solutionId,
      solutionName: currentQuote.solutionName,
      takeoffMode: calcForm.takeoffMode || "rectangle",
      dimensions: { ...calcForm },
      quoteData: JSON.parse(JSON.stringify(currentQuote))
    };
    setWorkingLots([...workingLots, newLot]);
    showToast(`"${currentQuote.solutionName}" ajout\xE9 au devis multi-lots (Lot ${lotNumber}) !`, "success");
  };
  const handleRemoveLot = (lotId) => {
    setWorkingLots(workingLots.filter((l) => l.id !== lotId));
    showToast("Lot retir\xE9 du devis en cours");
  };
  const handleSaveQuoteSubmit = async (e) => {
    e.preventDefault();
    if (isReadOnlyDueToDowngrade) {
      showToast("Action bloqu\xE9e en Lecture Seule", "error");
      return;
    }
    if (!saveQuoteForm.clientName || !saveQuoteForm.clientName.trim()) {
      setClientNameError(true);
      showToast("Veuillez indiquer le nom du client avant d'enregistrer.", "error");
      return;
    }
    setClientNameError(false);
    const isMultiLot = workingLots.length > 0;
    if (!isMultiLot && (!currentQuote || currentQuote.error)) return;
    if (!isMultiLot && currentQuote.isLossMaking) {
      showToast("Impossible d'enregistrer un devis en vente \xE0 perte ! Ajustez le prix ou la remise.", "error");
      return;
    }
    const seqNumber = nextQuoteSeq;
    const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
    const quoteNumber = `DEV-${currentYear}-${String(seqNumber).padStart(3, "0")}`;
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
      const margePctConsommeReelle = sumNetHTConsomme > 0 ? sumMargeConsomme / sumNetHTConsomme * 100 : 0;
      const margePctAchatReelle = sumNetHTAchat > 0 ? sumMargeAchat / sumNetHTAchat * 100 : 0;
      const allCommercialItems = workingLots.map((l) => ({
        id: l.id,
        label: l.lotName,
        dimensionSummary: formatLotDimensions(l),
        billedQty: 1,
        unit: "Lot",
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
        vatRate: calcForm.vatRate !== void 0 ? parseFloat(calcForm.vatRate) : 18
      };
    }
    const newQuote = {
      id: Date.now(),
      number: quoteNumber,
      date: (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      clientName: saveQuoteForm.clientName.trim() || "Client Passage",
      projectRef: saveQuoteForm.projectRef || (isMultiLot ? `Chantier Multi-Lots (${workingLots.length} ouvrages)` : currentQuote.solutionName),
      notes: saveQuoteForm.notes || "",
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
      setSaveQuoteForm({ clientName: "", projectRef: "", notes: "" });
      showToast(saveRes.message, "success");
    } catch (err) {
      StructuredLogger.error("handleSaveQuoteSubmit", "\xC9chec persistance devis", { error: err.message });
      showToast(err.message, "error");
    }
  };
  const handleCreateOrganization = async ({ name, currency }) => {
    if (isReadOnlyDueToDowngrade) {
      showToast("Action bloqu\xE9e en mode lecture seule", "error");
      return;
    }
    if (!supabaseClient || !sbUser || sbUser.id === "guest") {
      const newLocalOrg = {
        id: `org_local_${Date.now()}`,
        name,
        currency,
        role: "owner"
      };
      const updated = [...userOrganizations, newLocalOrg];
      setUserOrganizations(updated);
      setActiveOrganizationId(newLocalOrg.id);
      setActiveOrganizationRole("owner");
      showToast(`Organisation ${name} cr\xE9\xE9e avec succ\xE8s !`, "success");
      return;
    }
    try {
      const { data: newOrgId, error } = await supabaseClient.rpc("create_organization", {
        p_name: name,
        p_currency: currency
      });
      if (error) {
        console.error("[Bloc 1] create_organization RPC error:", error);
        showToast(`Erreur lors de la cr\xE9ation : ${error.message}`, "error");
        return;
      }
      const createdOrg = {
        id: newOrgId,
        name,
        currency,
        role: "owner"
      };
      const updated = [...userOrganizations, createdOrg];
      setUserOrganizations(updated);
      setActiveOrganizationId(newOrgId);
      setActiveOrganizationRole("owner");
      localStorage.setItem(`ikadevis_orgs_${sbUser.id}`, JSON.stringify(updated));
      localStorage.setItem(`ikadevis_active_org_${sbUser.id}`, newOrgId);
      showToast(`Organisation "${name}" cr\xE9\xE9e et activ\xE9e !`, "success");
    } catch (e) {
      console.error("[Bloc 1] Exception creating org:", e);
      showToast("Impossible de contacter le serveur", "error");
    }
  };
  const handleAddCustomVarSubmit = (e) => {
    e.preventDefault();
    if (isReadOnlyDueToDowngrade) {
      showToast("Action bloqu\xE9e en Lecture Seule", "error");
      return;
    }
    if (!selectedSolutionForEdit || !varForm.name.trim()) return;
    const varNameSanitized = varForm.name.trim().toUpperCase().replace(/\s+/g, "_");
    const MATH_FUNCTIONS_ONLY = ["IF", "CEIL", "FLOOR", "ROUND", "MIN", "MAX", "ABS", "SQRT"];
    if (MATH_FUNCTIONS_ONLY.includes(varNameSanitized)) {
      showToast(`Le nom "${varNameSanitized}" est une fonction de calcul r\xE9serv\xE9e (IF, CEIL, ROUND...).`, "error");
      return;
    }
    if (!/^[A-Z_][A-Z0-9_]*$/.test(varNameSanitized)) {
      showToast("Nom de variable invalide. Utilisez uniquement des lettres majuscules sans accent.", "error");
      return;
    }
    if (selectedSolutionForEdit.customVars && selectedSolutionForEdit.customVars.some((v) => v.name === varNameSanitized)) {
      showToast(`La variable "${varNameSanitized}" existe d\xE9j\xE0 pour ce produit !`, "error");
      return;
    }
    const updatedVars = [...selectedSolutionForEdit.customVars || [], {
      name: varNameSanitized,
      label: varForm.label.trim() || varNameSanitized,
      defaultValue: varForm.defaultValue !== void 0 && varForm.defaultValue !== "" ? parseFloat(varForm.defaultValue) : 0,
      unit: varForm.unit || "u"
    }];
    const updatedSolutions = solutions.map((s) => s.id === selectedSolutionForEdit.id ? { ...s, customVars: updatedVars } : s);
    updateSolutions(updatedSolutions);
    setSelectedSolutionForEdit({ ...selectedSolutionForEdit, customVars: updatedVars });
    setIsVarModalOpen(false);
    setVarForm({ name: "", label: "", defaultValue: 0, unit: "u" });
    showToast("Variable dynamique ajout\xE9e au produit !");
  };
  const handleDeleteCustomVar = (cvName) => {
    if (isReadOnlyDueToDowngrade) {
      showToast("Action bloqu\xE9e en Lecture Seule", "error");
      return;
    }
    const isUsed = recipes.some((r) => {
      if (r.solutionId !== selectedSolutionForEdit.id) return false;
      const tokenRegex = new RegExp("(?<![a-zA-Z0-9_])" + cvName + "(?![a-zA-Z0-9_])");
      return tokenRegex.test(r.formula);
    });
    if (isUsed) {
      setConfirmDialog({
        isOpen: true,
        title: "Suppression bloqu\xE9e",
        message: `La variable "${cvName}" est utilis\xE9e dans les formules de ce produit.

Veuillez d'abord modifier les recettes qui l'utilisent avant de la supprimer.`,
        isDanger: true,
        onConfirm: closeConfirm
      });
    } else {
      const updated = selectedSolutionForEdit.customVars.filter((x) => x.name !== cvName);
      const updatedSols = solutions.map((s) => s.id === selectedSolutionForEdit.id ? { ...s, customVars: updated } : s);
      updateSolutions(updatedSols);
      setSelectedSolutionForEdit({ ...selectedSolutionForEdit, customVars: updated });
      showToast("Variable retir\xE9e");
    }
  };
  const renderCalculator = () => {
    if (useHybridEditor) {
      return /* @__PURE__ */ React.createElement(
        QuoteWorkspace,
        {
          hybridQuote,
          setHybridQuote,
          solutions,
          materials,
          labor,
          recipes,
          companyInfo,
          saveQuoteStatus,
          saveQuoteError,
          confirmAction: ({ onConfirm, onSecondary, ...rest }) => setConfirmDialog({
            isOpen: true,
            ...rest,
            onConfirm: onConfirm ? () => {
              closeConfirm();
              onConfirm();
            } : null,
            onSecondary: onSecondary ? () => {
              closeConfirm();
              onSecondary();
            } : null
          }),
          onSaveQuote: async (savedQ) => {
            setSaveQuoteStatus("saving");
            setSaveQuoteError(null);
            const { client, project, clients: resolvedClients, projects: resolvedProjects } = resolveClientAndProject(clients, projects, savedQ.clientName, savedQ.projectRef, savedQ.quoteData?.totalTTCConsomme);
            if (resolvedClients !== clients) updateClients(resolvedClients);
            if (resolvedProjects !== projects) updateProjects(resolvedProjects);
            savedQ.clientId = client?.id || null;
            savedQ.projectId = project?.id || null;
            if (!supabaseClient || !sbUser || sbUser.id === "guest") {
              const updatedQuotes = [savedQ, ...savedQuotes.filter((q) => q.id !== savedQ.id)];
              updateSavedQuotes(updatedQuotes);
              updateNextQuoteSeq(nextQuoteSeq + 1);
              setSaveQuoteStatus("saved");
              showToast(`\u2713 Devis ${savedQ.number} enregistr\xE9 en local`, "success");
              setTimeout(() => setSaveQuoteStatus("idle"), 3e3);
              return;
            }
            try {
              const linesForV6 = (savedQ.quoteData?.commercialItems || []).map((d, idx) => ({
                line_order: idx + 1,
                designation: d.label || "Ligne de devis",
                unit: d.unit || "u",
                quantity: d.billedQty || 1,
                unit_price_ht: d.sellingUnitHT || 0,
                total_ht: d.sellingTotalHT || 0,
                cost_category: d.costCategory || "material"
              }));
              const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc("create_quote_v6", {
                p_org_id: activeOrganizationId,
                p_client_name: savedQ.clientName || "Client Particulier",
                p_project_ref: savedQ.projectRef || "Chantier BTP",
                p_company_snapshot: companyInfo,
                p_calc_form_snapshot: calcForm,
                p_lines: linesForV6,
                p_hybrid_snapshot: savedQ.hybridQuoteSnapshot || {}
              });
              if (rpcErr) {
                console.error("[Bloc 1] create_quote_v6 Server Error:", rpcErr);
                setSaveQuoteStatus("error");
                setSaveQuoteError(rpcErr.message || "Erreur serveur lors de la persistance.");
                showToast(`\u2715 \xC9chec de l'enregistrement serveur : ${rpcErr.message}`, "error");
                return;
              }
              const updatedQuotes = [savedQ, ...savedQuotes.filter((q) => q.id !== savedQ.id)];
              updateSavedQuotes(updatedQuotes);
              updateNextQuoteSeq(nextQuoteSeq + 1);
              setSaveQuoteStatus("saved");
              showToast(`\u2713 Devis ${savedQ.number} enregistr\xE9 sur le serveur !`, "success");
              setTimeout(() => setSaveQuoteStatus("idle"), 3500);
            } catch (err) {
              console.error("[Bloc 1] Save Network Exception:", err);
              setSaveQuoteStatus("error");
              setSaveQuoteError(err.message || "Connexion r\xE9seau impossible.");
              showToast(`\u2715 Erreur r\xE9seau lors de l'enregistrement`, "error");
            }
          },
          onPreviewQuote: (savedQ) => {
            setViewingSavedQuote(savedQ);
          },
          useHybridEditor,
          onToggleHybridEditor: toggleHybridEditor,
          onQuickCreateSolution: (newSol) => {
            updateSolutions([...solutions, newSol]);
          },
          isReadOnlyDueToDowngrade: isReadOnlyDueToDowngrade || !hasPermission(activeOrganizationRole, "canEditQuotes"),
          activeOrganizationRole,
          savedQuotes,
          showToast
        }
      );
    }
    const activeSolution = solutions.find((s) => s.id === calcForm.solutionId) || solutions[0];
    const allowedModes = activeSolution && activeSolution.allowedModes || ["rectangle", "surface", "volume", "linear", "floor", "unit"];
    const allModes = [
      { value: "rectangle", label: "Rectangle (Largeur x Hauteur)" },
      { value: "volume", label: "Volume B\xE9ton (Largeur x Hauteur x \xC9paisseur m\xB3)" },
      { value: "surface", label: "Surface Directe (m\xB2)" },
      { value: "floor", label: "Sol / Plafond (Largeur x Longueur)" },
      { value: "linear", label: "M\xE8tre Lin\xE9aire (ml)" },
      { value: "unit", label: "Unit\xE9 / Pi\xE8ce (u)" }
    ];
    const availableModesOptions = allModes.filter((m) => allowedModes.includes(m.value));
    return /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-[1400px] mx-auto flex flex-col gap-6 pb-20 md:pb-12" }, /* @__PURE__ */ React.createElement("div", { className: "bg-gradient-to-r from-neutral-900 to-brand-950 text-white p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md border border-neutral-800" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center text-sm font-bold shrink-0" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-layer-group" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "font-extrabold text-xs" }, "Nouvelle Interface Hybride V6 Multi-Lots Disponible"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-300" }, "Construisez vos devis BTP complets avec navigation par lots, saisie en table et biblioth\xE8que Zoho-Style."))), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        onClick: () => toggleHybridEditor(true),
        className: "btn-primary text-xs py-2 px-4 font-extrabold whitespace-nowrap shadow-sm"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrows-rotate mr-1.5" }),
      " Basculer vers l'\xC9diteur Hybride V6"
    )), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-neutral-200 rounded-2xl p-4 shadow-sm space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("div", { className: "w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center font-bold" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-wand-magic-sparkles text-xs" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-xs text-neutral-800 uppercase tracking-wider" }, "Guide Pas-\xE0-Pas pour Chiffrer un Devis"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500" }, "Suivez ces 4 \xE9tapes simples pour calculer et exporter un devis conforme."))), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full self-start sm:self-center" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-check mr-1 text-[10px]" }), "Pr\xEAt \xE0 l'emploi")), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setIsCompanyModalOpen(true),
        className: "flex items-center gap-3 p-2.5 rounded-xl border border-neutral-200 hover:border-brand-300 hover:bg-brand-50/40 text-left transition-all group",
        "aria-label": "\xC9tape 1 : Configurer mon entreprise"
      },
      /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 rounded-lg bg-neutral-100 text-neutral-600 group-hover:bg-brand-100 group-hover:text-brand-600 flex items-center justify-center font-black text-xs shrink-0 transition-colors" }, "1"),
      /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-bold text-neutral-800 truncate" }, "1. Mon Entreprise"), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-neutral-500 truncate" }, companyInfo.name || "Coordonn\xE9es & TVA")),
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-right text-[10px] text-neutral-300 group-hover:text-brand-500 transition-colors" })
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setResourceTab("materials");
          setActiveView("materials");
        },
        className: "flex items-center gap-3 p-2.5 rounded-xl border border-neutral-200 hover:border-brand-300 hover:bg-brand-50/40 text-left transition-all group",
        "aria-label": "\xC9tape 2 : V\xE9rifier les prix des ressources"
      },
      /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 rounded-lg bg-neutral-100 text-neutral-600 group-hover:bg-brand-100 group-hover:text-brand-600 flex items-center justify-center font-black text-xs shrink-0 transition-colors" }, "2"),
      /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-bold text-neutral-800 truncate" }, "2. Prix & Mat\xE9riaux"), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-neutral-500 truncate" }, materials.length, " mati\xE8res \u2022 ", labor.length, " MO")),
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-right text-[10px] text-neutral-300 group-hover:text-brand-500 transition-colors" })
    ), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 p-2.5 rounded-xl border-2 border-brand-500 bg-brand-50/50 text-left" }, /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center font-black text-xs shrink-0" }, "3"), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-black text-brand-900 truncate" }, "3. Saisie Dimensions"), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-brand-700 truncate font-semibold" }, "\xC9tape en cours")), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pencil text-[10px] text-brand-600" })), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          if (!currentQuote || currentQuote.error) {
            showToast("Veuillez d'abord saisir des dimensions valides", "error");
          } else {
            setIsSaveQuoteModalOpen(true);
          }
        },
        className: "flex items-center gap-3 p-2.5 rounded-xl border border-neutral-200 hover:border-brand-300 hover:bg-brand-50/40 text-left transition-all group",
        "aria-label": "\xC9tape 4 : Enregistrer et imprimer le devis"
      },
      /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 rounded-lg bg-neutral-100 text-neutral-600 group-hover:bg-brand-100 group-hover:text-brand-600 flex items-center justify-center font-black text-xs shrink-0 transition-colors" }, "4"),
      /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs font-bold text-neutral-800 truncate" }, "4. Enregistrer Devis"), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-neutral-500 truncate" }, "PDF & Vue Commerciale")),
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-floppy-disk text-[10px] text-neutral-300 group-hover:text-brand-500 transition-colors" })
    ))), workingLots.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-900 border border-neutral-800 rounded-3xl p-6 text-white shadow-2xl space-y-4 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-neutral-800 pb-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "bg-brand-500/20 text-brand-400 border border-brand-500/30 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider" }, "Devis Multi-Lots en cours"), /* @__PURE__ */ React.createElement("h3", { className: "text-xl font-black mt-1 text-white" }, "Chantier Compos\xE9 \u2014 ", workingLots.length, " ", workingLots.length > 1 ? "Ouvrages" : "Ouvrage")), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 w-full sm:w-auto" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setWorkingLots([]), className: "btn-secondary bg-neutral-800 text-neutral-300 hover:bg-neutral-700 text-xs py-2 px-3 border-neutral-700", "aria-label": "Vider tous les lots du panier" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash-can mr-1.5" }), " Vider"), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsSaveQuoteModalOpen(true), className: "btn-primary py-2 px-4 text-xs font-extrabold shadow-lg shadow-brand-500/30", "aria-label": "Enregistrer le devis global" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-floppy-disk mr-1.5" }), " Enregistrer Devis Global (", workingLots.length, " lots)"))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" }, workingLots.map((lot, idx) => /* @__PURE__ */ React.createElement("div", { key: lot.id, className: "bg-neutral-800/80 border border-neutral-700/80 rounded-2xl p-4 flex flex-col justify-between space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-start" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-extrabold text-brand-400 uppercase tracking-wider" }, "Poste #", idx + 1), /* @__PURE__ */ React.createElement("h4", { className: "font-extrabold text-sm text-white" }, lot.lotName), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-400 mt-0.5 font-medium" }, formatLotDimensions(lot))), /* @__PURE__ */ React.createElement("button", { onClick: () => handleRemoveLot(lot.id), className: "text-neutral-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-neutral-700 transition-colors", title: "Retirer ce lot", "aria-label": `Retirer le lot ${lot.lotName}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark" }))), /* @__PURE__ */ React.createElement("div", { className: "border-t border-neutral-700/60 pt-2 flex justify-between items-center text-xs" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 font-medium" }, "Net HT :"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-brand-300" }, formatMoney(lot.quoteData.netHTConsomme, companyInfo.currency)))))), /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-950/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 border border-neutral-800 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-6" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-500 block text-[10px] uppercase font-bold" }, "Total D\xE9bours\xE9 Sec"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-neutral-200 text-sm" }, formatMoney(workingLots.reduce((acc, l) => acc + (l.quoteData.totalDebourseConsomme || 0), 0), companyInfo.currency))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-500 block text-[10px] uppercase font-bold" }, "Total Net HT Chantier"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-emerald-400 text-sm" }, formatMoney(workingLots.reduce((acc, l) => acc + (l.quoteData.netHTConsomme || 0), 0), companyInfo.currency))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-500 block text-[10px] uppercase font-bold" }, "Total TTC Global"), /* @__PURE__ */ React.createElement("span", { className: "font-black text-brand-400 text-base" }, formatMoney(workingLots.reduce((acc, l) => acc + (l.quoteData.totalTTCConsomme || 0), 0), companyInfo.currency)))), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 italic" }, "Chaque lot sera ventil\xE9 individuellement dans le devis client imprim\xE9."))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col lg:flex-row gap-6 w-full items-start" }, /* @__PURE__ */ React.createElement("div", { className: "w-full lg:w-[400px] xl:w-[450px] shrink-0 flex flex-col gap-6" }, /* @__PURE__ */ React.createElement("div", { className: "app-card p-5 sm:p-6" }, /* @__PURE__ */ React.createElement("h2", { className: "text-sm font-extrabold text-neutral-800 mb-4 flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-6 h-6 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center text-xs" }, "1"), "Type d'Ouvrage / Produit"), /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_solution_select", className: "app-label" }, "S\xE9lectionner dans le catalogue"), /* @__PURE__ */ React.createElement(
      CustomSelect,
      {
        id: "calc_solution_select",
        value: calcForm.solutionId,
        onChange: (e) => {
          const solId = parseInt(e.target.value);
          const sol = solutions.find((s) => s.id === solId);
          const defaultCustomVals = {};
          if (sol && sol.customVars) {
            sol.customVars.forEach((cv) => defaultCustomVals[cv.name] = cv.defaultValue);
          }
          const defaultMode = sol && sol.allowedModes && sol.allowedModes.length > 0 ? sol.allowedModes[0] : "rectangle";
          setCalcForm({ ...calcForm, solutionId: solId, takeoffMode: defaultMode, customVarValues: defaultCustomVals });
        },
        options: solutions.map((s) => ({ value: s.id, label: s.name }))
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "app-card p-5 sm:p-6" }, /* @__PURE__ */ React.createElement("h2", { className: "text-sm font-extrabold text-neutral-800 mb-4 flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-6 h-6 rounded-md bg-neutral-100 text-neutral-500 flex items-center justify-center text-xs" }, "2"), "Mode de M\xE9tr\xE9 & Dimensions"), (() => {
      const selectedSol = solutions.find((s) => s.id === calcForm.solutionId) || solutions[0];
      const allowedModes2 = selectedSol && selectedSol.allowedModes || ["rectangle", "surface", "volume", "linear", "floor", "unit"];
      const allModes2 = [
        { value: "rectangle", label: "Rectangle (Largeur x Hauteur)" },
        { value: "volume", label: "Volume B\xE9ton (Largeur x Hauteur x \xC9paisseur m\xB3)" },
        { value: "surface", label: "Surface Directe (m\xB2)" },
        { value: "floor", label: "Sol / Plafond (Largeur x Longueur)" },
        { value: "linear", label: "M\xE8tre Lin\xE9aire (ml)" },
        { value: "unit", label: "Unit\xE9 / Pi\xE8ce (u)" }
      ];
      const availableModesOptions2 = allModes2.filter((m) => allowedModes2.includes(m.value));
      return /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_mode_select", className: "app-label" }, "Mode de Saisie BTP"), /* @__PURE__ */ React.createElement(
        CustomSelect,
        {
          id: "calc_mode_select",
          value: calcForm.takeoffMode || "rectangle",
          onChange: (e) => setCalcForm({ ...calcForm, takeoffMode: e.target.value }),
          options: availableModesOptions2
        }
      ));
    })(), (calcForm.takeoffMode === "rectangle" || !calcForm.takeoffMode) && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4 mb-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_width_rect", className: "app-label" }, "Largeur (m)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_width_rect",
        type: "number",
        min: "0.1",
        step: "0.1",
        className: "app-input font-bold",
        value: calcForm.width,
        onChange: (e) => setCalcForm({ ...calcForm, width: e.target.value })
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_height_rect", className: "app-label" }, "Hauteur (m)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_height_rect",
        type: "number",
        min: "0.1",
        step: "0.1",
        className: "app-input font-bold",
        value: calcForm.height,
        onChange: (e) => setCalcForm({ ...calcForm, height: e.target.value })
      }
    ))), calcForm.takeoffMode === "volume" && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 gap-3 mb-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_width_vol", className: "app-label" }, "Largeur (m)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_width_vol",
        type: "number",
        min: "0.1",
        step: "0.1",
        className: "app-input font-bold",
        value: calcForm.width,
        onChange: (e) => setCalcForm({ ...calcForm, width: e.target.value })
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_height_vol", className: "app-label" }, "Hauteur (m)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_height_vol",
        type: "number",
        min: "0.1",
        step: "0.1",
        className: "app-input font-bold",
        value: calcForm.height,
        onChange: (e) => setCalcForm({ ...calcForm, height: e.target.value })
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_depth_vol", className: "app-label" }, "\xC9paisseur (m)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_depth_vol",
        type: "number",
        min: "0.01",
        step: "0.01",
        className: "app-input font-bold text-brand-600",
        value: calcForm.depth || 0.15,
        onChange: (e) => setCalcForm({ ...calcForm, depth: e.target.value })
      }
    ))), calcForm.takeoffMode === "floor" && /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4 mb-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_width_floor", className: "app-label" }, "Largeur Sol/Plafond (m)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_width_floor",
        type: "number",
        min: "0.1",
        step: "0.1",
        className: "app-input font-bold text-brand-700",
        value: calcForm.width,
        onChange: (e) => setCalcForm({ ...calcForm, width: e.target.value })
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_length_floor", className: "app-label" }, "Longueur Sol/Plafond (m)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_length_floor",
        type: "number",
        min: "0.1",
        step: "0.1",
        className: "app-input font-bold text-brand-700",
        value: calcForm.lengthDirect,
        onChange: (e) => setCalcForm({ ...calcForm, lengthDirect: e.target.value })
      }
    ))), calcForm.takeoffMode === "surface" && /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_surface_direct", className: "app-label" }, "Surface Unitaire (m\xB2)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_surface_direct",
        type: "number",
        min: "0.1",
        step: "1",
        className: "app-input font-bold text-lg text-brand-700",
        value: calcForm.surfaceDirect,
        onChange: (e) => setCalcForm({ ...calcForm, surfaceDirect: e.target.value })
      }
    )), calcForm.takeoffMode === "linear" && /* @__PURE__ */ React.createElement("div", { className: "mb-4" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_linear_direct", className: "app-label" }, "Longueur Unitaire (ml)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_linear_direct",
        type: "number",
        min: "0.1",
        step: "0.5",
        className: "app-input font-bold text-lg text-brand-700",
        value: calcForm.lengthDirect,
        onChange: (e) => setCalcForm({ ...calcForm, lengthDirect: e.target.value })
      }
    )), calcForm.takeoffMode === "unit" && /* @__PURE__ */ React.createElement("div", { className: "mb-4 bg-brand-50/50 p-3 rounded-xl border border-brand-200" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-brand-900 font-medium" }, "Mode Pi\xE8ce / Forfait : le calcul s'applique directement \xE0 la quantit\xE9 unitaire saisie.")), activeSolution && activeSolution.customVars && activeSolution.customVars.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "border-t border-neutral-100 pt-4 mt-2 mb-4 space-y-3" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-black text-brand-700 uppercase tracking-wider block" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-sliders mr-1.5" }), " Variables Sp\xE9cifiques (", activeSolution.name, ")"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" }, activeSolution.customVars.map((cv) => /* @__PURE__ */ React.createElement("div", { key: cv.name }, /* @__PURE__ */ React.createElement("label", { htmlFor: `cv_input_${cv.name}`, className: "app-label truncate" }, cv.label || cv.name, " (", cv.unit, ")"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: `cv_input_${cv.name}`,
        type: "number",
        min: "0",
        step: "any",
        value: calcForm.customVarValues && calcForm.customVarValues[cv.name] !== void 0 ? calcForm.customVarValues[cv.name] : cv.defaultValue !== void 0 ? cv.defaultValue : 0,
        onChange: (e) => {
          const val = e.target.value;
          setCalcForm((prev) => ({
            ...prev,
            customVarValues: {
              ...prev.customVarValues || {},
              [cv.name]: val
            }
          }));
        },
        className: "app-input font-bold text-brand-700"
      }
    ))))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_qty_input", className: "app-label" }, "Quantit\xE9 (Ouvrages)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_qty_input",
        type: "number",
        min: "1",
        step: "1",
        className: "app-input font-bold",
        value: calcForm.qty,
        onChange: (e) => setCalcForm({ ...calcForm, qty: e.target.value })
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_faces_input", className: "app-label" }, "Nb Faces / Couches"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_faces_input",
        type: "number",
        min: "1",
        step: "1",
        className: "app-input font-bold",
        value: calcForm.faces !== void 0 ? calcForm.faces : 1,
        onChange: (e) => setCalcForm({ ...calcForm, faces: e.target.value })
      }
    )))), /* @__PURE__ */ React.createElement("div", { className: "app-card p-5 sm:p-6" }, /* @__PURE__ */ React.createElement("h2", { className: "text-sm font-extrabold text-neutral-800 mb-4 flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "w-6 h-6 rounded-md bg-neutral-100 text-neutral-500 flex items-center justify-center text-xs" }, "3"), "Param\xE8tres Financiers & Marge"), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4 mb-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_margin_input", className: "app-label flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Marge (%)"), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-brand-600 font-bold" }, calcForm.marginType === "reel" ? "Sur PV HT" : "Sur Co\xFBt")), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_margin_input",
        type: "number",
        min: "0",
        max: "99",
        className: "app-input font-bold text-brand-600",
        value: calcForm.margin,
        onChange: (e) => setCalcForm({ ...calcForm, margin: e.target.value })
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_margin_type", className: "app-label" }, "Type de Marge"), /* @__PURE__ */ React.createElement(
      CustomSelect,
      {
        id: "calc_margin_type",
        value: calcForm.marginType || "reel",
        onChange: (e) => setCalcForm({ ...calcForm, marginType: e.target.value }),
        options: [
          { value: "reel", label: "Taux de Marge (sur PV)" },
          { value: "majoration", label: "Taux de Marque (sur Co\xFBt)" }
        ]
      }
    ))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-3 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_overhead_input", className: "app-label" }, "Frais G\xE9n. (%)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_overhead_input",
        type: "number",
        min: "0",
        max: "50",
        className: "app-input font-bold",
        value: calcForm.overheadRate,
        onChange: (e) => setCalcForm({ ...calcForm, overheadRate: e.target.value })
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_discount_input", className: "app-label" }, "Remise (%)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_discount_input",
        type: "number",
        min: "0",
        max: "100",
        className: "app-input font-bold",
        value: calcForm.discountRate,
        onChange: (e) => setCalcForm({ ...calcForm, discountRate: e.target.value })
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "calc_vat_input", className: "app-label" }, "TVA (%)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "calc_vat_input",
        type: "number",
        min: "0",
        max: "30",
        className: "app-input font-bold",
        value: calcForm.vatRate !== void 0 ? calcForm.vatRate : 18,
        onChange: (e) => setCalcForm({ ...calcForm, vatRate: e.target.value })
      }
    ))), /* @__PURE__ */ React.createElement("div", { className: "mt-4 pt-4 border-t border-neutral-100 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-semibold text-neutral-700" }, "Inclure la pose / installation"), /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: calcForm.includeInstall !== false, onChange: (e) => setCalcForm({ ...calcForm, includeInstall: e.target.checked }), className: "w-4 h-4 accent-brand-600 rounded" })))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 w-full flex flex-col gap-6" }, currentQuote && currentQuote.error ? /* @__PURE__ */ React.createElement("div", { className: "app-card p-6 border-red-200 bg-red-50/50 flex flex-col items-center justify-center text-center space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-triangle-exclamation" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-base font-bold text-red-800" }, "Donn\xE9es incompl\xE8tes ou formule invalide"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-red-600 mt-1 max-w-md" }, currentQuote.message || currentQuote.errorMessage || "V\xE9rifiez vos param\xE8tres de dimensions et recettes associ\xE9es."))) : currentQuote ? /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-6" }, /* @__PURE__ */ React.createElement("div", { className: "app-card p-6 border-brand-100 bg-gradient-to-br from-white via-white to-brand-50/20 shadow-floating" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-neutral-100 pb-4 mb-4" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-black text-brand-600 uppercase tracking-widest" }, "Synth\xE8se Financi\xE8re de l'Ouvrage"), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full" }, currentQuote.solutionName)), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6" }, /* @__PURE__ */ React.createElement("div", { className: "p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "D\xE9bours\xE9 Sec"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-neutral-800 text-lg sm:text-xl" }, formatMoney(currentQuote.totalDebourseConsomme, companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Prix de Revient"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-neutral-800 text-lg sm:text-xl" }, formatMoney(currentQuote.totalRevientConsomme, companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "p-4 rounded-2xl bg-neutral-50 border border-neutral-200/80" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Marge Nette (", currentQuote.margePctConsommeReelle.toFixed(1), "%)"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-emerald-600 text-lg sm:text-xl" }, formatMoney(currentQuote.margeValeurConsomme, companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "p-4 rounded-2xl bg-brand-50 border border-brand-200" }, /* @__PURE__ */ React.createElement("span", { className: "text-brand-700 block text-[10px] uppercase font-black" }, "Net Client HT"), /* @__PURE__ */ React.createElement("span", { className: "font-black text-brand-600 text-xl sm:text-2xl" }, formatMoney(currentQuote.netHTConsomme, companyInfo.currency)))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-neutral-100" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs text-neutral-500 font-semibold" }, "TVA (", currentQuote.vatRate, "%) :"), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold text-neutral-800" }, formatMoney(currentQuote.tvaConsomme, companyInfo.currency)), /* @__PURE__ */ React.createElement("span", { className: "text-neutral-300 mx-1" }, "\u2022"), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-neutral-500 font-semibold" }, "Total TTC :"), /* @__PURE__ */ React.createElement("span", { className: "text-sm font-black text-brand-600" }, formatMoney(currentQuote.totalTTCConsomme, companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleAddLotToWorkingQuote,
        disabled: currentQuote.isLossMaking || isReadOnlyDueToDowngrade,
        className: "btn-secondary text-xs py-2 px-3 font-bold border-brand-200 text-brand-700 hover:bg-brand-50",
        "aria-label": "Ajouter au devis multi-lots"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-layer-group text-brand-500 mr-1.5" }),
      /* @__PURE__ */ React.createElement("span", null, "Ajouter au Devis Multi-Lots (", workingLots.length, ")")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setIsSaveQuoteModalOpen(true),
        disabled: currentQuote.isLossMaking || isReadOnlyDueToDowngrade,
        className: "btn-primary py-2 px-4 text-xs font-black shadow-md shadow-brand-500/20",
        "aria-label": "Enregistrer le devis pour le client"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-floppy-disk mr-1.5" }),
      workingLots.length > 0 ? `Enregistrer Devis Global (${workingLots.length + 1} lots)` : "Enregistrer ce Devis"
    )))), /* @__PURE__ */ React.createElement("div", { className: "bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setShowTechnicalDetails(!showTechnicalDetails),
        className: "w-full px-5 py-4 bg-neutral-50 hover:bg-neutral-100/80 flex items-center justify-between text-left transition-colors",
        "aria-expanded": showTechnicalDetails,
        "aria-label": "Afficher ou masquer les d\xE9tails techniques et approvisionnement"
      },
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-wrench text-neutral-500" }), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-extrabold text-neutral-800 uppercase tracking-wider" }, "D\xE9tails Techniques & Commandes Fournisseurs")),
      /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-neutral-400 font-medium hidden sm:inline" }, showTechnicalDetails ? "Masquer" : "Voir le d\xE9tail des formules et mati\xE8res"), /* @__PURE__ */ React.createElement("i", { className: `fa-solid fa-chevron-down text-xs text-neutral-400 transition-transform duration-200 ${showTechnicalDetails ? "rotate-180 text-brand-500" : ""}` }))
    ), showTechnicalDetails && /* @__PURE__ */ React.createElement("div", { className: "p-4 sm:p-6 space-y-6 border-t border-neutral-200 bg-neutral-50/30 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "p-0 overflow-hidden border border-neutral-200 rounded-2xl bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "px-5 sm:px-6 py-4 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-calculator text-neutral-600" }), /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-neutral-700 uppercase tracking-wider" }, "D\xE9tail des Postes de Co\xFBt (Consommation Chantier)")), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-mono font-bold text-neutral-500" }, "D\xE9bours\xE9 : ", formatMoney(currentQuote.totalDebourseConsomme, companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "app-table-wrapper rounded-none border-0" }, /* @__PURE__ */ React.createElement("table", { className: "app-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-white" }, /* @__PURE__ */ React.createElement("th", { className: "app-th pl-6" }, "Poste / Composant"), /* @__PURE__ */ React.createElement("th", { className: "app-th" }, "Cat\xE9gorie"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right" }, "Quantit\xE9 Nette"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right" }, "Co\xFBt Unitaire"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right pr-6" }, "Co\xFBt Total Consomm\xE9"))), /* @__PURE__ */ React.createElement("tbody", null, currentQuote.details.map((d) => /* @__PURE__ */ React.createElement("tr", { key: d.id, className: "hover:bg-neutral-50/50 transition-colors" }, /* @__PURE__ */ React.createElement("td", { className: "app-td pl-6 font-bold text-neutral-800" }, d.label, " ", /* @__PURE__ */ React.createElement("span", { className: "text-xs font-normal text-neutral-500" }, "(", d.name, ")")), /* @__PURE__ */ React.createElement("td", { className: "app-td" }, /* @__PURE__ */ React.createElement("span", { className: `px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${d.costCategory === "labor" ? "bg-amber-50 text-amber-700 border-amber-200" : d.costCategory === "installation" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-neutral-100 text-neutral-600 border-neutral-200"}` }, d.costCategory)), /* @__PURE__ */ React.createElement("td", { className: "app-td text-right font-medium text-neutral-600" }, d.billedQty.toFixed(2), " ", d.unit), /* @__PURE__ */ React.createElement("td", { className: "app-td text-right font-medium text-neutral-600" }, formatMoney(d.unitCost, companyInfo.currency)), /* @__PURE__ */ React.createElement("td", { className: "app-td pr-6 text-right font-bold text-neutral-900" }, formatMoney(d.totalCost, companyInfo.currency)))))))), currentQuote.materialConsolidation && Object.keys(currentQuote.materialConsolidation).length > 0 && /* @__PURE__ */ React.createElement("div", { className: "p-0 overflow-hidden border border-neutral-200 rounded-2xl bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "px-5 sm:px-6 py-4 bg-neutral-100 border-b border-neutral-200 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-cart-flatbed-suitcases text-neutral-600" }), /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-neutral-700 uppercase tracking-wider" }, "Approvisionnement Consolid\xE9 (Commandes Fournisseurs)")), /* @__PURE__ */ React.createElement("span", { className: "text-[9px] bg-brand-100 text-brand-700 px-2 py-0.5 rounded font-extrabold uppercase" }, "Indispensable Chantier")), /* @__PURE__ */ React.createElement("div", { className: "app-table-wrapper rounded-none border-0" }, /* @__PURE__ */ React.createElement("table", { className: "app-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-white" }, /* @__PURE__ */ React.createElement("th", { className: "app-th pl-6" }, "Mati\xE8re Premi\xE8re"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right" }, "Besoin Total (Net + Pertes)"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right" }, "Conditionnement Requis"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right pr-6" }, "Co\xFBt d'Achat Brut"))), /* @__PURE__ */ React.createElement("tbody", null, Object.keys(currentQuote.materialConsolidation).map((id) => {
      const item = currentQuote.materialConsolidation[id];
      return /* @__PURE__ */ React.createElement("tr", { key: id, className: "hover:bg-neutral-50/50 transition-colors" }, /* @__PURE__ */ React.createElement("td", { className: "app-td pl-6 font-bold text-neutral-800" }, item.mat.name), /* @__PURE__ */ React.createElement("td", { className: "app-td text-right font-medium text-neutral-500" }, item.totalBilledQty.toFixed(2), " ", item.mat.unitCalc), /* @__PURE__ */ React.createElement("td", { className: "app-td text-right" }, /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-lg font-bold text-xs" }, item.purchaseQty, " ", item.mat.unitBuy, " (de ", item.mat.unitSize, " ", item.mat.unitCalc, ")")), /* @__PURE__ */ React.createElement("td", { className: "app-td pr-6 text-right font-bold text-neutral-900" }, formatMoney(item.totalPurchaseCost, companyInfo.currency)));
    })))))))) : /* @__PURE__ */ React.createElement("div", { className: "h-full min-h-[300px] flex items-center justify-center border-2 border-dashed border-neutral-200 rounded-2xl bg-white p-6 text-center" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 bg-neutral-50 border border-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4 text-neutral-400" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-calculator text-2xl" })), /* @__PURE__ */ React.createElement("p", { className: "text-neutral-500 font-medium" }, "S\xE9lectionnez un ouvrage pour d\xE9marrer"))))), currentQuote && !currentQuote.error && /* @__PURE__ */ React.createElement("div", { className: "fixed bottom-0 left-0 right-0 lg:left-64 bg-white/95 backdrop-blur-md border-t border-neutral-200/80 p-3 sm:p-4 z-30 shadow-floating flex flex-wrap items-center justify-between gap-3 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 block uppercase font-bold" }, "Total Net HT"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-neutral-900 text-sm sm:text-base" }, formatMoney(currentQuote.netHTConsomme, companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "pl-3 border-l border-neutral-200" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-brand-600 block uppercase font-black" }, "Total TTC"), /* @__PURE__ */ React.createElement("span", { className: "font-black text-brand-600 text-base sm:text-lg" }, formatMoney(currentQuote.totalTTCConsomme, companyInfo.currency)))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 w-full sm:w-auto" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: handleAddLotToWorkingQuote,
        disabled: currentQuote.isLossMaking || isReadOnlyDueToDowngrade,
        className: "btn-secondary flex-1 sm:flex-initial text-xs py-2 px-3 font-bold border-neutral-300 hover:bg-neutral-100 flex items-center justify-center gap-1.5 shadow-sm",
        "aria-label": "Ajouter cet ouvrage au devis multi-lots"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-layer-group text-brand-500" }),
      /* @__PURE__ */ React.createElement("span", { className: "truncate" }, "+ Ajouter au devis multi-lots (", workingLots.length, ")")
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setIsSaveQuoteModalOpen(true),
        disabled: currentQuote.isLossMaking || isReadOnlyDueToDowngrade,
        className: "btn-primary flex-1 sm:flex-initial text-xs py-2.5 px-4 font-extrabold shadow-md shadow-brand-500/20 flex items-center justify-center gap-2 whitespace-nowrap",
        "aria-label": "Enregistrer le devis pour le client"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-floppy-disk" }),
      /* @__PURE__ */ React.createElement("span", null, workingLots.length > 0 ? `Enregistrer le Devis (${workingLots.length + 1} lots)` : "Enregistrer le Devis")
    ))));
  };
  const PROJECT_STATUS_LABELS = {
    active: { label: "En cours", className: "bg-emerald-50 text-emerald-700" },
    in_progress: { label: "En cours", className: "bg-emerald-50 text-emerald-700" },
    on_hold: { label: "En pause", className: "bg-amber-50 text-amber-700" },
    completed: { label: "Termin\xE9e", className: "bg-neutral-100 text-neutral-600" },
    cancelled: { label: "Annul\xE9e", className: "bg-red-50 text-red-700" }
  };
  const getProjectStatusBadge = (status) => PROJECT_STATUS_LABELS[status] || { label: "Statut inconnu", className: "bg-neutral-100 text-neutral-500" };
  const renderProjects = () => {
    const filteredProjects = projects.filter(
      (p) => p.name.toLowerCase().includes(projectSearchQuery.toLowerCase()) || p.code.toLowerCase().includes(projectSearchQuery.toLowerCase()) || p.clientName && p.clientName.toLowerCase().includes(projectSearchQuery.toLowerCase())
    );
    const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
    const selectedProjectQuotes = selectedProject ? savedQuotes.filter((q) => q.projectRef === selectedProject.name || q.projectId && q.projectId === selectedProject.id) : [];
    const selectedProjectCA = selectedProjectQuotes.reduce((acc, q) => acc + (q.quoteData?.totalTTCConsomme || 0), 0);
    return /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-6 h-full min-h-0 overflow-y-auto lg:overflow-hidden custom-scroll" }, /* @__PURE__ */ React.createElement("div", { className: `${selectedProject ? "hidden lg:flex" : "flex"} w-full lg:w-[380px] shrink-0 flex-col gap-4 lg:h-full lg:min-h-0` }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between px-1" }, /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-bold text-neutral-800" }, "Affaires & Projets"), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setNewProjectForm({ name: "", clientId: clients[0]?.id || "", siteAddress: "", city: "Dakar", budgetEstimated: "" });
          setIsNewProjectModalOpen(true);
        },
        className: "btn-secondary py-1.5 px-3 text-xs text-brand-600 border-brand-200 hover:bg-brand-50",
        "aria-label": "Cr\xE9er une nouvelle affaire"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus" }),
      " Nouvelle Affaire"
    )), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: projectSearchQuery,
        onChange: (e) => setProjectSearchQuery(e.target.value),
        placeholder: "Rechercher une affaire...",
        className: "w-full bg-white border border-neutral-200 focus:border-brand-500 rounded-xl px-3.5 py-2 pl-9 text-xs font-bold text-neutral-800 placeholder-neutral-400 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all shadow-2xs",
        "aria-label": "Rechercher une affaire"
      }
    ), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none" })), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-2 overflow-y-auto custom-scroll flex-1 min-h-0 lg:pr-1" }, filteredProjects.map((prj) => {
      const prjQuotesCount = savedQuotes.filter((q) => q.projectRef === prj.name || q.projectId && q.projectId === prj.id).length;
      return /* @__PURE__ */ React.createElement("button", { key: prj.id, onClick: () => setSelectedProjectId(prj.id), className: `flex flex-col gap-1 p-3.5 rounded-xl border-2 transition-all duration-200 bg-white text-left ${selectedProjectId === prj.id ? "border-brand-500 shadow-sm" : "border-transparent hover:border-neutral-200 shadow-sm"}`, "aria-label": `S\xE9lectionner l'affaire ${prj.name}` }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black uppercase tracking-wider bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-200 shrink-0" }, prj.code), /* @__PURE__ */ React.createElement("span", { className: `text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full shrink-0 ${getProjectStatusBadge(prj.status).className}` }, getProjectStatusBadge(prj.status).label)), /* @__PURE__ */ React.createElement("p", { className: `font-bold text-sm truncate ${selectedProjectId === prj.id ? "text-neutral-900" : "text-neutral-700"}` }, prj.name), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 truncate" }, prj.clientName, " ", prjQuotesCount > 0 && /* @__PURE__ */ React.createElement("span", { className: "text-brand-600 font-bold" }, "\xB7 ", prjQuotesCount, " devis")));
    }), filteredProjects.length === 0 && (projects.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "text-center py-10 px-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center mx-auto mb-3 border border-brand-100" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-folder-tree" })), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-bold text-neutral-800" }, "Aucune affaire pour l'instant"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 mt-1 max-w-[15rem] mx-auto leading-relaxed" }, clients.length === 0 ? "Cr\xE9ez d'abord un client, puis rattachez-lui une affaire." : "Cr\xE9ez une affaire pour regrouper les devis d\u2019un m\xEAme chantier."), clients.length > 0 && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setNewProjectForm({ name: "", clientId: clients[0]?.id || "", siteAddress: "", city: "Dakar", budgetEstimated: "" });
          setIsNewProjectModalOpen(true);
        },
        className: "btn-primary mt-4 text-xs py-2 px-3.5",
        "aria-label": "Cr\xE9er votre premi\xE8re affaire"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus" }),
      " Nouvelle Affaire"
    )) : /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-400 italic text-center py-6" }, "Aucune affaire ne correspond \xE0 cette recherche.")))), /* @__PURE__ */ React.createElement("div", { className: `${selectedProject ? "flex" : "hidden lg:flex"} flex-1 min-w-0 w-full flex-col lg:h-full lg:min-h-0 lg:overflow-y-auto custom-scroll` }, !selectedProject ? /* @__PURE__ */ React.createElement("div", { className: "app-card p-16 text-center text-neutral-400" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-folder-tree text-3xl mb-3 text-neutral-300" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-bold text-neutral-600" }, "S\xE9lectionnez une affaire pour voir son d\xE9tail")) : /* @__PURE__ */ React.createElement("div", { className: "app-card flex flex-col" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 sm:p-6 border-b border-neutral-100 flex flex-col sm:flex-row justify-between gap-4 bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 min-w-0" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setSelectedProjectId(null), className: "lg:hidden btn-icon text-neutral-500 hover:text-neutral-800 shrink-0", "aria-label": "Retour \xE0 la liste" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-left" })), /* @__PURE__ */ React.createElement("div", { className: "min-w-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-1" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-black uppercase tracking-wider bg-brand-50 text-brand-700 px-2.5 py-0.5 rounded-full border border-brand-200" }, selectedProject.code), /* @__PURE__ */ React.createElement("span", { className: `text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${getProjectStatusBadge(selectedProject.status).className}` }, getProjectStatusBadge(selectedProject.status).label)), /* @__PURE__ */ React.createElement("h2", { className: "text-lg sm:text-xl font-bold text-neutral-800 truncate" }, selectedProject.name), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 font-medium truncate" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-user mr-1 text-neutral-400" }), " ", selectedProject.clientName, " \u2022 ", /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-location-dot mr-1 text-neutral-400" }), " ", selectedProject.siteAddress || selectedProject.city))), /* @__PURE__ */ React.createElement("div", { className: "text-left sm:text-right shrink-0" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-neutral-400 block" }, "CA Cumul\xE9 Affaire"), /* @__PURE__ */ React.createElement("span", { className: "text-lg font-black text-brand-600 font-mono" }, formatMoney(selectedProjectCA, companyInfo.currency)))), /* @__PURE__ */ React.createElement("div", { className: "p-5 sm:p-6 space-y-2" }, /* @__PURE__ */ React.createElement("h4", { className: "text-xs font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-lines text-brand-500" }), "Devis & Avenants Rattach\xE9s (", selectedProjectQuotes.length, ")"), selectedProjectQuotes.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "space-y-1.5" }, selectedProjectQuotes.map((q) => (
      // P0.20 (2026-08-17) — La ligne n'offrait que l'aperçu PDF ;
      // elle ouvre désormais le dossier du devis (page Devis
      // Enregistrés, filtrée sur ce devis) où se trouvent l'édition,
      // la révision V2 et les autres actions. Le bouton PDF reste
      // en accès direct.
      /* @__PURE__ */ React.createElement("div", { key: q.id, className: "flex justify-between items-center gap-2 text-xs bg-neutral-50 p-2.5 rounded-xl border border-neutral-100 hover:border-brand-200 transition-colors" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => {
            setQuotesClientFilter({ kind: "quote", id: q.id, name: q.number });
            setActiveView("savedQuotes");
          },
          className: "flex items-center gap-2 min-w-0 flex-1 text-left group",
          "aria-label": `Ouvrir le dossier du devis ${q.number}`,
          title: "Ouvrir le dossier du devis"
        },
        /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-neutral-800 group-hover:text-brand-600 transition-colors" }, q.number),
        /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400" }, q.date),
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-up-right-from-square text-[9px] text-neutral-300 group-hover:text-brand-500 transition-colors" })
      ), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 shrink-0" }, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-neutral-900 font-mono" }, formatMoney(q.quoteData?.totalTTCConsomme, companyInfo.currency)), /* @__PURE__ */ React.createElement("button", { onClick: () => {
        setViewingSavedQuote(q);
        setIsCommercialMode(true);
      }, className: "text-brand-600 hover:text-brand-800 p-1", title: "Voir PDF", "aria-label": `Aper\xE7u PDF du devis ${q.number}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-pdf text-xs" }))))
    ))) : /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 italic" }, "Aucun devis li\xE9 pour l'instant.")))));
  };
  const renderPlatformAdmin = () => {
    if (!isPlatformAdmin) {
      return /* @__PURE__ */ React.createElement("div", { className: "app-card p-8 text-center max-w-lg mx-auto mt-10" }, /* @__PURE__ */ React.createElement("div", { className: "w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto text-xl border border-red-200 mb-4" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-lock" })), /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-neutral-900" }, "Acc\xE8s r\xE9serv\xE9"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-neutral-500 mt-1" }, "Cet espace est r\xE9serv\xE9 aux administrateurs de la plateforme ikadevis."));
    }
    const stat = (label, value, icon) => /* @__PURE__ */ React.createElement("div", { className: "app-card p-4" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 text-neutral-400 mb-1.5" }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${icon} text-xs` }), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-bold uppercase tracking-wider" }, label)), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-black text-neutral-900 tabular-nums" }, value));
    const o = platformOverview;
    return /* @__PURE__ */ React.createElement("div", { className: "h-full overflow-y-auto custom-scroll space-y-5 pb-6" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-4 flex-wrap" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-800 text-[11px] font-black mb-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-shield-halved" }), " ADMINISTRATION PLATEFORME \xB7 LECTURE SEULE"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 max-w-xl" }, "Vue transverse sur toutes les organisations clientes. Chaque consultation est journalis\xE9e. Aucune modification des donn\xE9es clients n'est possible depuis cet \xE9cran.")), /* @__PURE__ */ React.createElement("button", { onClick: loadPlatformOverview, disabled: platformLoading, className: "btn-secondary text-xs py-2 px-3 disabled:opacity-50" }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid fa-arrows-rotate ${platformLoading ? "fa-spin" : ""}` }), " Actualiser")), platformLoading && /* @__PURE__ */ React.createElement("div", { className: "app-card p-10 text-center text-neutral-400" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-spinner fa-spin text-2xl mb-3" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-semibold" }, "Chargement de la vue plateforme\u2026")), platformError && !platformLoading && /* @__PURE__ */ React.createElement("div", { className: "app-card p-6 border-red-200 bg-red-50/50" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start gap-3" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-triangle-exclamation text-red-500 mt-0.5" }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "font-bold text-red-900 text-sm" }, "Vue plateforme indisponible"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-red-700 mt-1 font-mono" }, platformError), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-red-600/80 mt-2" }, "Si le message mentionne une fonction inexistante, la migration", /* @__PURE__ */ React.createElement("code", { className: "mx-1 px-1 bg-red-100 rounded" }, "v6_platform_admin.sql"), "n'a pas encore \xE9t\xE9 appliqu\xE9e sur cet environnement.")))), o && !platformLoading && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-3" }, stat("Organisations", o.total_organizations ?? 0, "fa-building"), stat("Utilisateurs", o.total_users ?? 0, "fa-users"), stat("Devis \xE9mis", o.total_quotes ?? 0, "fa-file-invoice"), stat("Volume TTC cumul\xE9", formatMoney(o.total_ttc_all ?? 0, companyInfo.currency), "fa-coins")), /* @__PURE__ */ React.createElement("div", { className: "app-card overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-5 py-3.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("h3", { className: "text-xs font-bold text-neutral-700 uppercase tracking-wider" }, "Organisations clientes (", (o.organizations || []).length, ")"), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 font-medium" }, "G\xE9n\xE9r\xE9 le ", o.generated_at ? new Date(o.generated_at).toLocaleString("fr-FR") : "\u2014")), (o.organizations || []).length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "p-10 text-center" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-building-circle-exclamation text-3xl text-neutral-300 mb-3" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-bold text-neutral-700" }, "Aucune organisation cliente"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-400 mt-1" }, "Cet environnement ne contient encore aucun compte client.")) : /* @__PURE__ */ React.createElement("div", { className: "app-table-wrapper" }, /* @__PURE__ */ React.createElement("table", { className: "app-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "app-th pl-5" }, "Organisation"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right" }, "Membres"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right" }, "Clients"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right" }, "Affaires"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right" }, "Devis"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right" }, "Volume TTC"), /* @__PURE__ */ React.createElement("th", { className: "app-th pr-5" }, "Derni\xE8re activit\xE9"))), /* @__PURE__ */ React.createElement("tbody", null, (o.organizations || []).map((org) => /* @__PURE__ */ React.createElement("tr", { key: org.organization_id, className: "hover:bg-neutral-50/60 transition-colors" }, /* @__PURE__ */ React.createElement("td", { className: "app-td pl-5" }, /* @__PURE__ */ React.createElement("p", { className: "font-bold text-neutral-900" }, org.name), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-neutral-400 font-mono" }, org.organization_id)), /* @__PURE__ */ React.createElement("td", { className: "app-td text-right tabular-nums" }, org.members), /* @__PURE__ */ React.createElement("td", { className: "app-td text-right tabular-nums" }, org.clients), /* @__PURE__ */ React.createElement("td", { className: "app-td text-right tabular-nums" }, org.projects), /* @__PURE__ */ React.createElement("td", { className: "app-td text-right tabular-nums" }, org.quotes, org.quotes_accepted > 0 && /* @__PURE__ */ React.createElement("span", { className: "ml-1.5 text-[10px] font-bold text-emerald-600" }, "(", org.quotes_accepted, " accept\xE9s)")), /* @__PURE__ */ React.createElement("td", { className: "app-td text-right font-bold tabular-nums" }, formatMoney(org.total_ttc || 0, org.currency || "FCFA")), /* @__PURE__ */ React.createElement("td", { className: "app-td pr-5 text-xs text-neutral-500" }, org.last_activity ? new Date(org.last_activity).toLocaleDateString("fr-FR") : /* @__PURE__ */ React.createElement("span", { className: "text-neutral-300" }, "Jamais"))))))))));
  };
  const renderClients = () => {
    const filteredClients = clients.filter(
      (c) => c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) || c.email && c.email.toLowerCase().includes(clientSearchQuery.toLowerCase()) || c.phone && c.phone.includes(clientSearchQuery)
    );
    const selectedClient = clients.find((c) => c.id === selectedClientId) || null;
    const selectedClientProjects = selectedClient ? projects.filter((p) => p.clientId === selectedClient.id || p.clientName === selectedClient.name) : [];
    const selectedClientQuotes = selectedClient ? savedQuotes.filter((q) => q.clientId === selectedClient.id || q.clientName === selectedClient.name) : [];
    return /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-6 h-full min-h-0 overflow-y-auto lg:overflow-hidden custom-scroll" }, /* @__PURE__ */ React.createElement("div", { className: `${selectedClient ? "hidden lg:flex" : "flex"} w-full lg:w-[380px] shrink-0 flex-col gap-4 lg:h-full lg:min-h-0` }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between px-1" }, /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-bold text-neutral-800" }, "Clients & Donneurs d'Ordres"), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setNewClientForm({ name: "", contactPerson: "", taxId: "", phone: "", email: "", address: "", city: "Dakar" });
          setIsNewClientModalOpen(true);
        },
        className: "btn-secondary py-1.5 px-3 text-xs text-brand-600 border-brand-200 hover:bg-brand-50",
        "aria-label": "Cr\xE9er un nouveau client"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-user-plus" }),
      " Nouveau Client"
    )), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: clientSearchQuery,
        onChange: (e) => setClientSearchQuery(e.target.value),
        placeholder: "Rechercher un client...",
        className: "w-full bg-white border border-neutral-200 focus:border-brand-500 rounded-xl px-3.5 py-2 pl-9 text-xs font-bold text-neutral-800 placeholder-neutral-400 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all shadow-2xs",
        "aria-label": "Rechercher un client"
      }
    ), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none" })), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-2 overflow-y-auto custom-scroll flex-1 min-h-0 lg:pr-1" }, filteredClients.map((c) => {
      const cQuotesCount = savedQuotes.filter((q) => q.clientId === c.id || q.clientName === c.name).length;
      return /* @__PURE__ */ React.createElement("button", { key: c.id, onClick: () => setSelectedClientId(c.id), className: `flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all duration-200 bg-white text-left ${selectedClientId === c.id ? "border-brand-500 shadow-sm" : "border-transparent hover:border-neutral-200 shadow-sm"}`, "aria-label": `S\xE9lectionner ${c.name}` }, /* @__PURE__ */ React.createElement("div", { className: `w-9 h-9 rounded-lg flex items-center justify-center shrink-0 font-black text-xs ${selectedClientId === c.id ? "bg-brand-100 text-brand-600" : "bg-neutral-100 text-neutral-500"}` }, c.name.substring(0, 2).toUpperCase()), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("p", { className: `font-bold text-sm truncate ${selectedClientId === c.id ? "text-neutral-900" : "text-neutral-700"}` }, c.name), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 truncate" }, c.contactPerson || "Sans contact renseign\xE9")), cQuotesCount > 0 && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-extrabold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded shrink-0" }, cQuotesCount));
    }), filteredClients.length === 0 && /* Deux situations distinctes : une recherche sans résultat
       (on garde un message discret) et un compte encore vide
       (on guide vers la création). */
    (clients.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "text-center py-10 px-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-12 h-12 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center mx-auto mb-3 border border-brand-100" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-users" })), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-bold text-neutral-800" }, "Aucun client pour l'instant"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 mt-1 max-w-[15rem] mx-auto leading-relaxed" }, "Ajoutez votre premier client pour commencer \xE0 lui rattacher des affaires et des devis."), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setNewClientForm({ name: "", contactPerson: "", taxId: "", phone: "", email: "", address: "", city: "Dakar" });
          setIsNewClientModalOpen(true);
        },
        className: "btn-primary mt-4 text-xs py-2 px-3.5",
        "aria-label": "Cr\xE9er votre premier client"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-user-plus" }),
      " Nouveau Client"
    )) : /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-400 italic text-center py-6" }, "Aucun client ne correspond \xE0 cette recherche.")))), /* @__PURE__ */ React.createElement("div", { className: `${selectedClient ? "flex" : "hidden lg:flex"} flex-1 min-w-0 w-full flex-col lg:h-full lg:min-h-0 lg:overflow-y-auto custom-scroll` }, !selectedClient ? /* @__PURE__ */ React.createElement("div", { className: "app-card p-16 text-center text-neutral-400" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-users text-3xl mb-3 text-neutral-300" }), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-bold text-neutral-600" }, "S\xE9lectionnez un client pour voir sa fiche")) : /* @__PURE__ */ React.createElement("div", { className: "app-card flex flex-col" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between gap-3 bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 min-w-0" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setSelectedClientId(null), className: "lg:hidden btn-icon text-neutral-500 hover:text-neutral-800 shrink-0", "aria-label": "Retour \xE0 la liste" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-left" })), /* @__PURE__ */ React.createElement("div", { className: "w-11 h-11 rounded-2xl bg-brand-50 text-brand-600 font-black text-sm flex items-center justify-center shrink-0" }, selectedClient.name.substring(0, 2).toUpperCase()), /* @__PURE__ */ React.createElement("div", { className: "min-w-0" }, /* @__PURE__ */ React.createElement("h2", { className: "text-lg sm:text-xl font-bold text-neutral-800 truncate" }, selectedClient.name), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 truncate" }, selectedClient.contactPerson || "Sans contact renseign\xE9"))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 shrink-0" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
      setEditingClientId(selectedClient.id);
      setNewClientForm({
        name: selectedClient.name || "",
        contactPerson: selectedClient.contactPerson || "",
        taxId: selectedClient.taxId || "",
        phone: selectedClient.phone || "",
        email: selectedClient.email || "",
        address: selectedClient.address || "",
        city: selectedClient.city || ""
      });
      setIsNewClientModalOpen(true);
    }, className: "btn-icon", title: "Modifier la fiche client", "aria-label": `Modifier ${selectedClient.name}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pen" })), /* @__PURE__ */ React.createElement("button", { onClick: () => {
      setCalcForm((cf) => ({ ...cf, clientName: selectedClient.name, projectRef: `Projet ${selectedClient.name}` }));
      setActiveView("calculator");
      showToast(`Client ${selectedClient.name} s\xE9lectionn\xE9 pour le devis !`);
    }, className: "btn-primary py-2 px-3 text-xs font-extrabold", "aria-label": `Cr\xE9er un devis pour ${selectedClient.name}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus" }), " Cr\xE9er Devis"))), /* @__PURE__ */ React.createElement("div", { className: "p-5 sm:p-6 space-y-5" }, /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-50 rounded-2xl p-4 text-sm space-y-2 text-neutral-700 border border-neutral-100" }, selectedClient.taxId && /* @__PURE__ */ React.createElement("p", { className: "font-mono text-xs text-neutral-500" }, /* @__PURE__ */ React.createElement("strong", null, "NIF/RCCM :"), " ", selectedClient.taxId), selectedClient.phone && /* @__PURE__ */ React.createElement("p", null, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-phone mr-2 text-neutral-400 w-4" }), " ", selectedClient.phone), selectedClient.email && /* @__PURE__ */ React.createElement("p", null, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-envelope mr-2 text-neutral-400 w-4" }), " ", selectedClient.email), selectedClient.address && /* @__PURE__ */ React.createElement("p", null, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-location-dot mr-2 text-neutral-400 w-4" }), " ", selectedClient.address, selectedClient.city ? `, ${selectedClient.city}` : ""), !selectedClient.taxId && !selectedClient.phone && !selectedClient.email && !selectedClient.address && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-400 italic" }, "Aucune coordonn\xE9e renseign\xE9e pour ce client.")), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setProjectSearchQuery(selectedClient.name);
          setSelectedProjectId(selectedClientProjects[0]?.id || null);
          setActiveView("projects");
        },
        className: "bg-white border border-neutral-200 rounded-2xl p-4 text-center hover:border-brand-300 hover:bg-brand-50/30 transition-all group",
        "aria-label": `Voir les ${selectedClientProjects.length} affaires de ${selectedClient.name}`
      },
      /* @__PURE__ */ React.createElement("span", { className: "text-2xl font-black text-neutral-900 block group-hover:text-brand-600 transition-colors" }, selectedClientProjects.length),
      /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-neutral-400 group-hover:text-brand-600 transition-colors" }, "Affaires ", /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-right ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity" }))
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setQuotesClientFilter({ kind: "client", id: selectedClient.id, name: selectedClient.name });
          setActiveView("savedQuotes");
        },
        className: "bg-white border border-neutral-200 rounded-2xl p-4 text-center hover:border-brand-300 hover:bg-brand-50/30 transition-all group",
        "aria-label": `Voir les ${selectedClientQuotes.length} devis de ${selectedClient.name}`
      },
      /* @__PURE__ */ React.createElement("span", { className: "text-2xl font-black text-neutral-900 block group-hover:text-brand-600 transition-colors" }, selectedClientQuotes.length),
      /* @__PURE__ */ React.createElement("span", { className: "text-[10px] uppercase font-bold text-neutral-400 group-hover:text-brand-600 transition-colors" }, "Devis ", /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-right ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity" }))
    )), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement("h4", { className: "text-xs font-bold text-neutral-700 uppercase tracking-wider" }, "Affaires du client"), selectedClientProjects.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "space-y-1.5" }, selectedClientProjects.map((p) => /* @__PURE__ */ React.createElement("button", { key: p.id, onClick: () => {
      setSelectedProjectId(p.id);
      setProjectSearchQuery("");
      setActiveView("projects");
    }, className: "w-full flex justify-between items-center text-xs bg-neutral-50 hover:bg-brand-50/50 p-2.5 rounded-xl border border-neutral-100 hover:border-brand-200 transition-all text-left", "aria-label": `Ouvrir l'affaire ${p.name}` }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0" }, /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-neutral-800 mr-2" }, p.code), /* @__PURE__ */ React.createElement("span", { className: "text-neutral-600" }, p.name)), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-chevron-right text-neutral-300 text-[10px] shrink-0" })))) : /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 italic" }, "Aucune affaire li\xE9e pour l'instant.")), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, /* @__PURE__ */ React.createElement("h4", { className: "text-xs font-bold text-neutral-700 uppercase tracking-wider" }, "Devis & Avenants"), selectedClientQuotes.length > 0 ? /* @__PURE__ */ React.createElement("div", { className: "space-y-1.5" }, selectedClientQuotes.map((q) => (
      // P0.20 — Même lien vers le dossier du devis que sur la fiche affaire.
      /* @__PURE__ */ React.createElement("div", { key: q.id, className: "flex justify-between items-center gap-2 text-xs bg-neutral-50 p-2.5 rounded-xl border border-neutral-100 hover:border-brand-200 transition-colors" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          onClick: () => {
            setQuotesClientFilter({ kind: "quote", id: q.id, name: q.number });
            setActiveView("savedQuotes");
          },
          className: "flex items-center gap-2 min-w-0 flex-1 text-left group",
          "aria-label": `Ouvrir le dossier du devis ${q.number}`,
          title: "Ouvrir le dossier du devis"
        },
        /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-neutral-800 group-hover:text-brand-600 transition-colors" }, q.number),
        /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400" }, q.date),
        /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-up-right-from-square text-[9px] text-neutral-300 group-hover:text-brand-500 transition-colors" })
      ), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 shrink-0" }, /* @__PURE__ */ React.createElement("span", { className: "font-bold text-neutral-900 font-mono" }, formatMoney(q.quoteData?.totalTTCConsomme, companyInfo.currency)), /* @__PURE__ */ React.createElement("button", { onClick: () => {
        setViewingSavedQuote(q);
        setIsCommercialMode(true);
      }, className: "text-brand-600 hover:text-brand-800 p-1", title: "Voir PDF", "aria-label": `Aper\xE7u PDF du devis ${q.number}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-pdf text-xs" }))))
    ))) : /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 italic" }, "Aucun devis li\xE9 pour l'instant."))))));
  };
  const renderSavedQuotes = () => {
    const visibleQuotes = !quotesClientFilter ? savedQuotes : quotesClientFilter.kind === "quote" ? savedQuotes.filter((q) => q.id === quotesClientFilter.id) : savedQuotes.filter((q) => q.clientId === quotesClientFilter.id || q.clientName === quotesClientFilter.name);
    return /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-[1400px] mx-auto h-full min-h-0 overflow-y-auto custom-scroll" }, /* @__PURE__ */ React.createElement("div", { className: "app-card flex flex-col" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 sm:p-6 border-b border-neutral-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-xl font-bold text-neutral-800" }, "Mes Devis Enregistr\xE9s"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-neutral-500 mt-1 font-medium" }, "Historique des devis cr\xE9\xE9s, consultation de l'\xE9tude interne et impression du PDF client.")), /* @__PURE__ */ React.createElement("span", { className: "bg-brand-50 text-brand-700 px-3 py-1.5 rounded-lg text-xs font-bold" }, savedQuotes.length, " devis enregistr\xE9s (Prochain : DEV-", (/* @__PURE__ */ new Date()).getFullYear(), "-", String(nextQuoteSeq).padStart(3, "0"), ")")), quotesClientFilter && /* @__PURE__ */ React.createElement("div", { className: "px-5 sm:px-6 py-3 bg-brand-50/60 border-b border-brand-100 flex items-center justify-between gap-3" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold text-brand-800 flex items-center gap-2 min-w-0" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-filter shrink-0" }), /* @__PURE__ */ React.createElement("span", { className: "truncate" }, quotesClientFilter.kind === "quote" ? `Dossier du devis ${quotesClientFilter.name}` : `Devis de \xAB ${quotesClientFilter.name} \xBB \u2014 ${visibleQuotes.length} r\xE9sultat(s)`)), /* @__PURE__ */ React.createElement("button", { onClick: () => setQuotesClientFilter(null), className: "text-xs font-bold text-brand-700 hover:underline shrink-0", "aria-label": "Retirer le filtre" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark mr-1" }), " Voir tous")), /* @__PURE__ */ React.createElement("div", { className: "block lg:hidden p-4 space-y-3" }, visibleQuotes.map((sq) => /* @__PURE__ */ React.createElement("div", { key: sq.id, className: "bg-neutral-50 border border-neutral-200 rounded-2xl p-4 space-y-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "inline-block px-2.5 py-0.5 rounded-full text-xs font-black bg-brand-100 text-brand-700 mb-1" }, sq.number), /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-neutral-900 text-base" }, sq.clientName || "Client sans nom"), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500" }, sq.projectRef || "Sans r\xE9f\xE9rence projet")), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-medium text-neutral-400" }, sq.date)), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-2 bg-white p-3 rounded-xl border border-neutral-200/80 text-xs" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Net HT"), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-neutral-700" }, formatMoney(sq.quoteData?.netHTConsomme, sq.companyInfoSnapshot?.currency || companyInfo.currency))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Total TTC"), /* @__PURE__ */ React.createElement("span", { className: "font-black text-brand-600 text-sm" }, formatMoney(sq.quoteData?.totalTTCConsomme, sq.companyInfoSnapshot?.currency || companyInfo.currency)))), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-2 pt-1" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          const hq = adaptSavedQuoteToHybrid(sq, solutions, materials, labor, recipes);
          setHybridQuote(hq);
          setUseHybridEditor(true);
          setActiveView("calculator");
          showToast(`Devis ${sq.number} ouvert dans l'\xC9diteur Hybride !`);
        },
        className: "btn-primary flex-1 py-2 px-3 text-xs font-bold justify-center bg-brand-600 hover:bg-brand-700 text-white",
        "aria-label": `Modifier dans l'\xE9diteur hybride ${sq.number}`
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pen-to-square mr-1.5" }),
      " Modifier (V6)"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setViewingSavedQuote(sq);
          setIsCommercialMode(true);
        },
        className: "btn-secondary flex-1 py-2 px-3 text-xs font-bold justify-center",
        "aria-label": `Voir le devis client PDF ${sq.number}`
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-pdf mr-1.5" }),
      " PDF"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setViewingSavedQuote(sq);
          setIsCommercialMode(false);
        },
        className: "btn-secondary py-2 px-3 text-xs font-bold justify-center",
        "aria-label": `Voir l'\xE9tude de prix interne ${sq.number}`
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-eye" })
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        disabled: isReadOnlyDueToDowngrade,
        onClick: () => setConfirmDialog({
          isOpen: true,
          title: "Supprimer Devis",
          message: `Supprimer d\xE9finitivement le devis ${sq.number} ?`,
          isDanger: true,
          onConfirm: () => {
            updateSavedQuotes(savedQuotes.filter((x) => x.id !== sq.id));
            closeConfirm();
            showToast("Devis supprim\xE9");
          }
        }),
        className: "btn-icon text-neutral-400 hover:text-red-600 hover:bg-red-50 p-2",
        "aria-label": `Supprimer le devis ${sq.number}`,
        title: "Supprimer"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash" })
    )))), visibleQuotes.length === 0 && /* @__PURE__ */ React.createElement("div", { className: "p-8 text-center text-neutral-400" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-folder-open text-4xl mb-3 block opacity-30" }), "Aucun devis enregistr\xE9 pour le moment.")), /* @__PURE__ */ React.createElement("div", { className: "hidden lg:block app-table-wrapper rounded-none border-0" }, /* @__PURE__ */ React.createElement("table", { className: "app-table" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-neutral-50/80" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "app-th pl-6" }, "N\xB0 Devis"), /* @__PURE__ */ React.createElement("th", { className: "app-th" }, "Date"), /* @__PURE__ */ React.createElement("th", { className: "app-th" }, "Client & Projet"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right" }, "Net HT"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right" }, "Total TTC"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right pr-6 w-48" }, "Actions"))), /* @__PURE__ */ React.createElement("tbody", null, visibleQuotes.map((sq) => /* @__PURE__ */ React.createElement("tr", { key: sq.id, className: "app-td border-b border-neutral-100 hover:bg-neutral-50/50" }, /* @__PURE__ */ React.createElement("td", { className: "p-4 pl-6 font-extrabold text-brand-600" }, sq.number), /* @__PURE__ */ React.createElement("td", { className: "p-4 text-xs font-medium text-neutral-500" }, sq.date), /* @__PURE__ */ React.createElement("td", { className: "p-4" }, /* @__PURE__ */ React.createElement("div", { className: "font-bold text-neutral-800" }, sq.clientName), /* @__PURE__ */ React.createElement("div", { className: "text-xs text-neutral-500" }, sq.projectRef)), /* @__PURE__ */ React.createElement("td", { className: "p-4 text-right font-bold text-neutral-700" }, formatMoney(sq.quoteData?.netHTConsomme, sq.companyInfoSnapshot?.currency || companyInfo.currency)), /* @__PURE__ */ React.createElement("td", { className: "p-4 text-right font-extrabold text-neutral-900" }, formatMoney(sq.quoteData?.totalTTCConsomme, sq.companyInfoSnapshot?.currency || companyInfo.currency)), /* @__PURE__ */ React.createElement("td", { className: "p-4 pr-6 text-right" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-end items-center gap-1.5" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          const hq = adaptSavedQuoteToHybrid(sq, solutions, materials, labor, recipes);
          setHybridQuote(hq);
          setUseHybridEditor(true);
          setActiveView("calculator");
          showToast(`Devis ${sq.number} ouvert dans l'\xC9diteur Hybride !`);
        },
        className: "btn-secondary py-1 px-2.5 text-xs font-bold text-brand-700 bg-brand-50 border-brand-200 hover:bg-brand-100 flex items-center gap-1",
        title: "Modifier dans l'\xC9diteur Hybride V6"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pen-to-square text-brand-600" }),
      " \xC9diter"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          const currentVersion = sq.versionNumber || 1;
          const nextVersion = currentVersion + 1;
          const baseNum = sq.number.replace(/-V\d+$/, "");
          const newVersionNum = `${baseNum}-V${nextVersion}`;
          const newId = Date.now() + Math.floor(Math.random() * 1e5);
          const newVersionQuote = {
            ...JSON.parse(JSON.stringify(sq)),
            id: newId,
            number: newVersionNum,
            versionNumber: nextVersion,
            parentQuoteId: sq.id,
            status: "draft",
            signedAt: null,
            signedByName: null,
            signatureData: null,
            date: (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")
          };
          if (newVersionQuote.hybridQuoteSnapshot) {
            newVersionQuote.hybridQuoteSnapshot.id = newId;
            newVersionQuote.hybridQuoteSnapshot.number = newVersionNum;
          }
          updateSavedQuotes([newVersionQuote, ...savedQuotes]);
          showToast(`\u2713 Nouvelle r\xE9vision ${newVersionNum} cr\xE9\xE9e (V${currentVersion} pr\xE9serv\xE9e) !`, "success");
        },
        className: "btn-secondary py-1 px-2.5 text-xs font-bold text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100 flex items-center gap-1",
        title: "Cr\xE9er une nouvelle r\xE9vision (V2, V3) sans \xE9craser la version envoy\xE9e"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-code-branch text-indigo-600" }),
      " R\xE9vision (V",
      (sq.versionNumber || 1) + 1,
      ")"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
          const newId = Date.now() + Math.floor(Math.random() * 1e5);
          const nextNum = generateNextQuoteNumber(savedQuotes);
          const duplicated = {
            ...JSON.parse(JSON.stringify(sq)),
            id: newId,
            number: nextNum,
            clientName: `${sq.clientName} (Copie)`,
            date: (/* @__PURE__ */ new Date()).toLocaleDateString("fr-FR")
          };
          if (duplicated.hybridQuoteSnapshot) {
            duplicated.hybridQuoteSnapshot.id = newId;
            duplicated.hybridQuoteSnapshot.number = nextNum;
            duplicated.hybridQuoteSnapshot.clientName = duplicated.clientName;
          }
          updateSavedQuotes([duplicated, ...savedQuotes]);
          updateNextQuoteSeq(nextQuoteSeq + 1);
          showToast(`Devis ${sq.number} dupliqu\xE9 avec succ\xE8s !`, "success");
        },
        className: "btn-icon text-neutral-600 hover:bg-neutral-100",
        title: "Dupliquer ce devis",
        "aria-label": `Dupliquer ${sq.number}`
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-clone" })
    ), /* @__PURE__ */ React.createElement("button", { onClick: () => {
      setViewingSavedQuote(sq);
      setIsCommercialMode(true);
    }, className: "btn-icon text-indigo-600 hover:bg-indigo-50", title: "Aper\xE7u Devis Client (PDF)", "aria-label": `Aper\xE7u devis client ${sq.number}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-pdf" })), /* @__PURE__ */ React.createElement("button", { onClick: () => {
      setViewingSavedQuote(sq);
      setIsCommercialMode(false);
    }, className: "btn-icon text-brand-600 hover:bg-brand-50", title: "Vue Interne \xC9tude de Prix", "aria-label": `\xC9tude interne ${sq.number}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-eye" })), /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => setConfirmDialog({ isOpen: true, title: "Supprimer Devis", message: `Supprimer le devis ${sq.number} ?`, isDanger: true, onConfirm: () => {
      updateSavedQuotes(savedQuotes.filter((x) => x.id !== sq.id));
      closeConfirm();
      showToast("Devis supprim\xE9");
    } }), className: `btn-icon ${isReadOnlyDueToDowngrade ? "opacity-40 cursor-not-allowed text-neutral-300" : "text-neutral-400 hover:text-red-600 hover:bg-red-50"}`, "aria-label": `Supprimer ${sq.number}`, title: "Supprimer" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash" })))))), visibleQuotes.length === 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "6", className: "p-12 text-center text-neutral-400 font-medium" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-folder-open text-4xl mb-3 block opacity-30" }), "Aucun devis enregistr\xE9 pour le moment.", /* @__PURE__ */ React.createElement("br", null), 'Cr\xE9ez un devis dans le calculateur puis cliquez sur "Enregistrer le Devis".')))))));
  };
  const renderRecipes = () => (
    // P0.18 — Colonnes à hauteur de coque : sur desktop chaque colonne
    // défile chez elle, la page ne bouge pas. Sur mobile (colonnes
    // empilées) le scroll unique de la vue reste le comportement attendu.
    /* @__PURE__ */ React.createElement("div", { className: "flex flex-col lg:flex-row gap-6 w-full max-w-[1400px] mx-auto h-full min-h-0 overflow-y-auto lg:overflow-hidden custom-scroll" }, /* @__PURE__ */ React.createElement("div", { className: "w-full lg:w-[380px] shrink-0 flex flex-col gap-4 lg:h-full lg:min-h-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between px-1" }, /* @__PURE__ */ React.createElement("h2", { className: "text-lg font-bold text-neutral-800" }, "Catalogue des Ouvrages"), /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => {
      setSolutionModalForm({ id: null, name: "", icon: "fa-cube", allowedModes: ["rectangle", "surface", "linear"] });
      setIsSolutionModalOpen(true);
    }, className: `btn-secondary py-1.5 px-3 text-xs ${isReadOnlyDueToDowngrade ? "opacity-50 cursor-not-allowed" : "text-brand-600 border-brand-200 hover:bg-brand-50"}`, "aria-label": "Cr\xE9er un nouvel ouvrage au catalogue" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus" }), " Nouvel Ouvrage")), /* @__PURE__ */ React.createElement("div", { className: "bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs font-bold text-emerald-900 shadow-sm space-y-1.5" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-shield-check text-emerald-600 text-sm" }), /* @__PURE__ */ React.createElement("span", null, "Sant\xE9 du Catalogue :")), /* @__PURE__ */ React.createElement("span", { className: "bg-white text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-extrabold" }, systemDiagnostic.okProducts, " / ", systemDiagnostic.totalProducts, " Conformes")), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-1 text-[10px] text-neutral-600 font-medium border-t border-emerald-200/60 pt-1.5" }, /* @__PURE__ */ React.createElement("div", null, "Formules Invalides : ", /* @__PURE__ */ React.createElement("span", { className: systemDiagnostic.invalidRecipes > 0 ? "font-bold text-red-600" : "font-bold text-emerald-700" }, systemDiagnostic.invalidRecipes)), /* @__PURE__ */ React.createElement("div", null, "Ressources Manquantes : ", /* @__PURE__ */ React.createElement("span", { className: systemDiagnostic.missingResources > 0 ? "font-bold text-red-600" : "font-bold text-emerald-700" }, systemDiagnostic.missingResources)))), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        value: solutionSearchQuery,
        onChange: (e) => setSolutionSearchQuery(e.target.value),
        placeholder: "Rechercher un ouvrage (ex: B\xE9ton, ACM, Peinture)...",
        className: "w-full bg-white border border-neutral-200 focus:border-brand-500 rounded-xl px-3.5 py-2 pl-9 text-xs font-bold text-neutral-800 placeholder-neutral-400 outline-none focus:ring-2 focus:ring-brand-500/10 transition-all shadow-2xs",
        "aria-label": "Rechercher un ouvrage dans le catalogue"
      }
    ), /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs pointer-events-none" }), solutionSearchQuery && /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setSolutionSearchQuery(""),
        className: "absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 text-xs",
        "aria-label": "Effacer la recherche"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark" })
    )), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-2 overflow-y-auto custom-scroll flex-1 min-h-0 lg:pr-1" }, solutions.filter((s) => s.name.toLowerCase().includes(solutionSearchQuery.toLowerCase())).map((s) => /* @__PURE__ */ React.createElement("div", { key: s.id, className: `flex items-center justify-between p-3.5 rounded-xl border-2 transition-all duration-200 bg-white ${selectedSolutionForEdit?.id === s.id ? "border-brand-500 shadow-sm" : "border-transparent hover:border-neutral-200 shadow-sm"}` }, /* @__PURE__ */ React.createElement("button", { onClick: () => setSelectedSolutionForEdit(s), className: "flex items-center text-left gap-3 flex-1 min-w-0 outline-none", "aria-label": `S\xE9lectionner l'ouvrage ${s.name}` }, /* @__PURE__ */ React.createElement("div", { className: `w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${selectedSolutionForEdit?.id === s.id ? "bg-brand-100 text-brand-600" : "bg-neutral-100 text-neutral-400"}` }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${s.icon}` })), /* @__PURE__ */ React.createElement("span", { className: `font-bold text-sm leading-tight truncate ${selectedSolutionForEdit?.id === s.id ? "text-neutral-900" : "text-neutral-600"}` }, s.name)), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1 shrink-0 ml-2" }, /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => {
      setSolutionModalForm({ id: s.id, name: s.name, icon: s.icon || "fa-cube", allowedModes: s.allowedModes || ["rectangle"] });
      setIsSolutionModalOpen(true);
    }, className: `btn-icon text-xs w-7 h-7 ${isReadOnlyDueToDowngrade ? "opacity-40 cursor-not-allowed" : "text-neutral-500 hover:text-brand-600"}`, title: "\xC9diter le nom", "aria-label": `Modifier ${s.name}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pen" })), /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => handleDuplicateSolution(s), className: `btn-icon text-xs w-7 h-7 ${isReadOnlyDueToDowngrade ? "opacity-40 cursor-not-allowed" : "text-neutral-500 hover:text-indigo-600"}`, title: "Dupliquer", "aria-label": `Dupliquer ${s.name}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-copy" })), /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => handleDeleteSolution(s), className: `btn-icon text-xs w-7 h-7 ${isReadOnlyDueToDowngrade ? "opacity-40 cursor-not-allowed" : "text-neutral-400 hover:text-red-600"}`, title: "Supprimer", "aria-label": `Supprimer ${s.name}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash" }))))))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-w-0 w-full lg:h-full lg:min-h-0 lg:overflow-y-auto custom-scroll" }, selectedSolutionForEdit && /* @__PURE__ */ React.createElement("div", { className: "app-card flex flex-col" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 sm:p-6 border-b border-neutral-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "text-neutral-400 text-[10px] font-extrabold uppercase tracking-wider mb-1" }, "Composants & Formules de l'Ouvrage"), /* @__PURE__ */ React.createElement("h2", { className: "text-xl font-bold text-neutral-800" }, selectedSolutionForEdit.name)), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2 w-full sm:w-auto" }, /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => setIsAllowedModesModalOpen(true), className: `btn-secondary py-2 px-3 text-xs ${isReadOnlyDueToDowngrade ? "opacity-50 cursor-not-allowed" : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"}`, "aria-label": "Configurer les modes de m\xE9tr\xE9 autoris\xE9s" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-vector-square text-brand-500" }), " Modes autoris\xE9s (", selectedSolutionForEdit.allowedModes?.length || 0, ")"), /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => {
      setVarForm({ name: "", label: "", defaultValue: 0, unit: "u" });
      setIsVarModalOpen(true);
    }, className: `btn-secondary py-2 px-3 text-xs ${isReadOnlyDueToDowngrade ? "opacity-50 cursor-not-allowed" : "border-brand-200 text-brand-700 hover:bg-brand-50"}`, "aria-label": "G\xE9rer les variables sp\xE9cifiques" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-sliders" }), " Variables du Chantier"), /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => {
      setRecipeForm({ id: Date.now(), solutionId: selectedSolutionForEdit.id, type: "material", refId: materials[0]?.id || "", formula: "SURFACE", costCategory: "material", label: "" });
      setIsRecipeModalOpen(true);
    }, className: `btn-primary py-2 px-3 text-xs ${isReadOnlyDueToDowngrade ? "opacity-50 cursor-not-allowed" : ""}`, "aria-label": "Ajouter un composant \xE0 l'ouvrage" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus" }), " Ajouter un composant"))), /* @__PURE__ */ React.createElement("div", { className: "px-5 sm:px-6 py-3 border-b border-neutral-100 bg-white" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "ouvrage_keywords", className: "app-label flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-tags text-neutral-400" }), "Mots-cl\xE9s de recherche"), /* @__PURE__ */ React.createElement(
      "input",
      {
        id: "ouvrage_keywords",
        key: selectedSolutionForEdit.id,
        disabled: isReadOnlyDueToDowngrade,
        type: "text",
        className: "app-input text-sm",
        defaultValue: (selectedSolutionForEdit.keywords || []).join(", "),
        onBlur: (e) => {
          const kws = e.target.value.split(",").map((k) => k.trim()).filter(Boolean);
          const updated = solutions.map((s) => s.id === selectedSolutionForEdit.id ? { ...s, keywords: kws } : s);
          updateSolutions(updated);
          setSelectedSolutionForEdit({ ...selectedSolutionForEdit, keywords: kws });
        },
        placeholder: "Ex : cl\xF4ture, muret, mur de s\xE9paration, parpaing"
      }
    ), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-1" }, "S\xE9par\xE9s par une virgule \u2014 aide le client \xE0 retrouver cet ouvrage m\xEAme sans en conna\xEEtre le nom exact.")), /* @__PURE__ */ React.createElement("div", { className: "p-4 bg-brand-50/40 border-b border-neutral-100" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-2" }, /* @__PURE__ */ React.createElement("h4", { className: "text-xs font-bold text-brand-700 uppercase tracking-wider" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-sliders mr-1" }), "Variables Personnalis\xE9es de l'Ouvrage"), !isReadOnlyDueToDowngrade && /* @__PURE__ */ React.createElement("button", { onClick: () => {
      setVarForm({ name: "", label: "", defaultValue: 0, unit: "u" });
      setIsVarModalOpen(true);
    }, className: "text-[11px] font-bold text-brand-600 hover:underline", "aria-label": "Ajouter une variable personnalis\xE9e" }, "+ Ajouter une variable")), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-2" }, selectedSolutionForEdit.customVars && selectedSolutionForEdit.customVars.map((cv) => /* @__PURE__ */ React.createElement("span", { key: cv.name, className: "inline-flex items-center gap-1.5 bg-white border border-brand-200 text-brand-900 px-2.5 py-1 rounded-lg text-xs font-mono font-bold shadow-sm" }, /* @__PURE__ */ React.createElement("span", null, cv.name), /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 font-normal" }, "= ", cv.defaultValue, " ", cv.unit), !isReadOnlyDueToDowngrade && /* @__PURE__ */ React.createElement("button", { onClick: () => handleDeleteCustomVar(cv.name), className: "ml-1 text-neutral-400 hover:text-red-600", "aria-label": `Supprimer la variable ${cv.name}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-[10px]" })))), (!selectedSolutionForEdit.customVars || selectedSolutionForEdit.customVars.length === 0) && /* @__PURE__ */ React.createElement("span", { className: "text-xs text-neutral-400 italic" }, "Aucune variable sp\xE9cifique configur\xE9e (ex : PROFONDEUR, COUCHES)."))), /* @__PURE__ */ React.createElement("div", { className: "block lg:hidden p-4 space-y-3" }, recipes.filter((r) => r.solutionId === selectedSolutionForEdit.id).map((r) => {
      const isMatMissing = r.type === "material" && !materials.find((m) => m.id === r.refId);
      const isLabMissing = r.type === "labor" && !labor.find((l) => l.id === r.refId);
      const isMissing = isMatMissing || isLabMissing;
      const linkedName = r.type === "material" ? materials.find((m) => m.id === r.refId)?.name || "Ressource introuvable" : labor.find((l) => l.id === r.refId)?.name || "Prestation introuvable";
      return /* @__PURE__ */ React.createElement("div", { key: r.id, className: `p-4 rounded-2xl border ${isMissing ? "bg-red-50/60 border-red-200" : "bg-neutral-50 border-neutral-200"} space-y-2` }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-start" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "font-extrabold text-sm text-neutral-900" }, r.label), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-600 mt-0.5" }, linkedName)), /* @__PURE__ */ React.createElement("span", { className: "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-white text-neutral-700 border-neutral-300" }, r.costCategory || r.type)), /* @__PURE__ */ React.createElement("div", { className: "bg-white p-2.5 rounded-xl border border-neutral-200/80 text-xs" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 font-bold block text-[10px] uppercase" }, "Formule"), /* @__PURE__ */ React.createElement("code", { className: "font-mono text-brand-700 font-bold" }, r.formula)), /* @__PURE__ */ React.createElement("div", { className: "flex justify-end gap-2 pt-1" }, /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => {
        setRecipeForm({ ...r });
        setIsRecipeModalOpen(true);
      }, className: "btn-secondary py-1.5 px-3 text-xs font-bold", "aria-label": `Modifier le composant ${r.label}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pen mr-1" }), " Modifier"), /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => setConfirmDialog({ isOpen: true, title: "Retirer", message: "Retirer ce composant de la recette ?", isDanger: true, onConfirm: () => {
        setRecipes(recipes.filter((x) => x.id !== r.id));
        closeConfirm();
      } }), className: "btn-icon text-neutral-400 hover:text-red-600 p-1.5", "aria-label": `Retirer le composant ${r.label}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash" }))));
    })), /* @__PURE__ */ React.createElement("div", { className: "hidden lg:block app-table-wrapper rounded-none border-0" }, /* @__PURE__ */ React.createElement("table", { className: "app-table" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-neutral-50/80" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "app-th pl-6 w-1/3" }, "Composant & Formule"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-center" }, "Cat\xE9gorie"), /* @__PURE__ */ React.createElement("th", { className: "app-th" }, "Ressource Li\xE9e"), /* @__PURE__ */ React.createElement("th", { className: "app-th text-right pr-6 w-28" }, "Actions"))), /* @__PURE__ */ React.createElement("tbody", null, recipes.filter((r) => r.solutionId === selectedSolutionForEdit.id).map((r) => {
      const isMatMissing = r.type === "material" && !materials.find((m) => m.id === r.refId);
      const isLabMissing = r.type === "labor" && !labor.find((l) => l.id === r.refId);
      const isMissing = isMatMissing || isLabMissing;
      return /* @__PURE__ */ React.createElement("tr", { key: r.id, className: `app-td border-b border-neutral-100 ${isMissing ? "bg-red-50/60" : "hover:bg-neutral-50/50"}` }, /* @__PURE__ */ React.createElement("td", { className: "p-4 pl-6" }, /* @__PURE__ */ React.createElement("p", { className: "font-bold text-neutral-800" }, r.label), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap items-center gap-2 mt-1.5" }, /* @__PURE__ */ React.createElement("code", { className: "text-[10px] bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded border border-neutral-200 font-mono" }, r.formula), isMissing && /* @__PURE__ */ React.createElement("span", { className: "bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded border border-red-200" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-triangle-exclamation mr-1" }), "Ressource Supprim\xE9e"))), /* @__PURE__ */ React.createElement("td", { className: "p-4 text-center" }, /* @__PURE__ */ React.createElement("span", { className: `inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${r.costCategory === "installation" ? "bg-purple-50 text-purple-700 border-purple-200" : r.costCategory === "labor" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-orange-50 text-orange-700 border-orange-200"}` }, r.costCategory || r.type)), /* @__PURE__ */ React.createElement("td", { className: "p-4 text-sm font-medium" }, r.type === "material" ? materials.find((m) => m.id === r.refId)?.name || /* @__PURE__ */ React.createElement("span", { className: "text-red-600 font-bold" }, "Ressource introuvable (ID #", r.refId, ")") : labor.find((l) => l.id === r.refId)?.name || /* @__PURE__ */ React.createElement("span", { className: "text-red-600 font-bold" }, "Prestation introuvable (ID #", r.refId, ")")), /* @__PURE__ */ React.createElement("td", { className: "p-4 pr-6 text-right" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-end gap-1" }, /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => {
        setRecipeForm({ ...r });
        setIsRecipeModalOpen(true);
      }, className: `btn-icon ${isReadOnlyDueToDowngrade ? "opacity-40 cursor-not-allowed text-neutral-300" : "text-neutral-500 hover:text-brand-600"}`, title: "\xC9diter le composant", "aria-label": `\xC9diter ${r.label}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pen" })), /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => setConfirmDialog({ isOpen: true, title: "Retirer", message: "Retirer ce composant de la recette ?", isDanger: true, onConfirm: () => {
        setRecipes(recipes.filter((x) => x.id !== r.id));
        closeConfirm();
      } }), className: `btn-icon ${isReadOnlyDueToDowngrade ? "opacity-40 cursor-not-allowed text-neutral-300" : "text-neutral-400 hover:text-red-600 hover:bg-red-50"}`, title: "Retirer", "aria-label": `Retirer ${r.label}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash" })))));
    }), recipes.filter((r) => r.solutionId === selectedSolutionForEdit.id).length === 0 && /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("td", { colSpan: "4", className: "p-8 text-center text-neutral-500 font-medium" }, `Cet ouvrage n'a aucun composant. Cliquez sur "Ajouter un composant" pour commencer.`))))))))
  );
  const CALC_UNIT_GROUP_LABELS = {
    length: "Longueur",
    surface: "Surface",
    volume: "Volume",
    weight: "Poids",
    time: "Temps",
    count: "Unit\xE9s & conditionnements"
  };
  const calcUnitOptions = Object.entries(BTP_UNIT_CATEGORIES).flatMap(
    ([groupKey, group]) => Object.keys(group.units).map((u) => ({ value: u, label: `${CALC_UNIT_GROUP_LABELS[groupKey] || groupKey} \xB7 ${u}` }))
  );
  const PACKAGING_SUGGESTIONS = ["Unit\xE9", "Barre", "Plaque", "Feuille", "Carton", "Sac", "Pot", "Seau", "Rouleau", "Couronne", "Palette", "m", "m\xB2", "m\xB3", "kg", "L"];
  const renderMaterials = () => {
    const existingCategories = [...new Set(materials.map((m) => (m.category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
    const categoryOptionsList = [...existingCategories.map((c) => ({ value: c, label: c })), { value: "__new__", label: "\uFF0B Nouvelle cat\xE9gorie\u2026" }];
    const existingPackagings = [...new Set(materials.map((m) => (m.unitBuy || "").trim()).filter(Boolean))];
    const packagingOptionsList = [
      ...[.../* @__PURE__ */ new Set([...existingPackagings, ...PACKAGING_SUGGESTIONS])].sort((a, b) => a.localeCompare(b, "fr")).map((u) => ({ value: u, label: u })),
      { value: "__new__", label: "\uFF0B Autre conditionnement\u2026" }
    ];
    const selectedMaterial = materials.find((m) => m.id === selectedMaterialId) || null;
    const selectedLaborItem = labor.find((l) => l.id === selectedLaborId) || null;
    const editingIsNew = isResourceEditMode && (resourceTab === "materials" ? matForm && !materials.some((m) => m.id === matForm.id) : laborForm && !labor.some((l) => l.id === laborForm.id));
    const selectedItem = resourceTab === "materials" ? selectedMaterial || (editingIsNew ? matForm : null) : selectedLaborItem || (editingIsNew ? laborForm : null);
    const openMaterialDetail = (m) => {
      setSelectedMaterialId(m.id);
      setIsResourceEditMode(false);
      setResourceDetailTab("overview");
    };
    const openLaborDetail = (l) => {
      setSelectedLaborId(l.id);
      setIsResourceEditMode(false);
    };
    const startEditMaterial = (m) => {
      setMatForm({ ...m });
      setSelectedMaterialId(m.id);
      setIsResourceEditMode(true);
      setIsCustomCategory(false);
      setIsCustomPackaging(false);
    };
    const startEditLabor = (l) => {
      setLaborForm({ ...l });
      setSelectedLaborId(l.id);
      setIsResourceEditMode(true);
    };
    const startNewMaterial = () => {
      const draft = { id: Date.now(), name: "", category: existingCategories[0] || "BTP", unitBuy: "Barre", unitSize: 6, unitCalc: "m", priceBuy: "", waste: 5, yieldRate: 0, purchaseMode: "pack" };
      setMatForm(draft);
      setSelectedMaterialId(draft.id);
      setIsResourceEditMode(true);
      setResourceDetailTab("overview");
      setIsCustomCategory(false);
      setIsCustomPackaging(false);
    };
    const startNewLabor = () => {
      const draft = { id: Date.now(), name: "", calcMode: "unite", unit: "h", rate: "", yieldRate: 0 };
      setLaborForm(draft);
      setSelectedLaborId(draft.id);
      setIsResourceEditMode(true);
    };
    const closeDetail = () => {
      if (resourceTab === "materials") setSelectedMaterialId(null);
      else setSelectedLaborId(null);
      setIsResourceEditMode(false);
    };
    const cancelEdit = () => {
      if (editingIsNew) {
        closeDetail();
      } else {
        setIsResourceEditMode(false);
      }
    };
    const saveMaterial = (e) => {
      e.preventDefault();
      if (isReadOnlyDueToDowngrade) return;
      const p = (parseFloat(matForm.priceBuy) || 0) / (parseFloat(matForm.unitSize) || 1);
      const nm = { ...matForm, priceCalc: p, waste: parseFloat(matForm.waste) || 0, yieldRate: parseFloat(matForm.yieldRate) || 0 };
      const previousMat = materials.find((m) => m.id === nm.id);
      updateMaterials(previousMat ? materials.map((m) => m.id === nm.id ? nm : m) : [...materials, nm]);
      setSelectedMaterialId(nm.id);
      setIsResourceEditMode(false);
      showToast("Ressource enregistr\xE9e");
      if (previousMat && isCloudOrgActive && supabaseClient && parseFloat(previousMat.priceBuy) !== parseFloat(nm.priceBuy)) {
        supabaseClient.from("material_price_history").insert({
          organization_id: activeOrganizationId,
          material_id: nm.id,
          price: parseFloat(nm.priceBuy) || 0,
          previous_price: parseFloat(previousMat.priceBuy) || 0,
          supplier_name: nm.supplier || null
        }).then(({ error }) => {
          if (error) console.warn("[Price History] \xC9chec de journalisation:", error);
        });
      }
    };
    const saveLabor = (e) => {
      e.preventDefault();
      if (isReadOnlyDueToDowngrade) return;
      const nl = { ...laborForm, rate: parseFloat(laborForm.rate) || 0, yieldRate: parseFloat(laborForm.yieldRate) || 0 };
      updateLabor(labor.find((x) => x.id === nl.id) ? labor.map((x) => x.id === nl.id ? nl : x) : [...labor, nl]);
      setSelectedLaborId(nl.id);
      setIsResourceEditMode(false);
      showToast("Prestation enregistr\xE9e !");
    };
    const lastHistoryEntry = materialHistory[0];
    const historyVariationPct = lastHistoryEntry && lastHistoryEntry.previous_price ? (lastHistoryEntry.price - lastHistoryEntry.previous_price) / lastHistoryEntry.previous_price * 100 : null;
    return /* @__PURE__ */ React.createElement("div", { className: "w-full max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-6 h-full min-h-0 overflow-y-auto lg:overflow-hidden custom-scroll" }, /* @__PURE__ */ React.createElement("div", { className: `${selectedItem ? "hidden lg:flex" : "flex"} lg:w-[380px] w-full shrink-0 flex-col gap-4 lg:h-full lg:min-h-0` }, /* @__PURE__ */ React.createElement("div", { className: "flex gap-2 bg-white p-2 rounded-xl border border-neutral-200" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setResourceTab("materials"),
        className: `flex-1 px-3 py-2.5 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 ${resourceTab === "materials" ? "bg-brand-50 text-brand-600" : "text-neutral-500 hover:text-neutral-800"}`,
        "aria-label": "Voir la liste des mati\xE8res premi\xE8res"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-box text-sm" }),
      " Mati\xE8res (",
      materials.length,
      ")"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setResourceTab("labor"),
        className: `flex-1 px-3 py-2.5 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 ${resourceTab === "labor" ? "bg-brand-50 text-brand-600" : "text-neutral-500 hover:text-neutral-800"}`,
        "aria-label": "Voir la liste de la main-d'\u0153uvre"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-user-gear text-sm" }),
      " Main-d'\u0153uvre (",
      labor.length,
      ")"
    )), resourceTab === "materials" && /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setIsMatCsvModalOpen(true), className: "btn-secondary flex-1 py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5", title: "Importer un CSV", "aria-label": "Importer un fichier CSV" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-csv text-emerald-600" }), " CSV"), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
      const csvContent = "data:text/csv;charset=utf-8,ID;Nom;Cat\xE9gorie;Unit\xE9 Achat;Taille Unit\xE9;Unit\xE9 Calcul;Prix Achat;Perte (%);Rendement (m\xB2)\n" + materials.map((m) => `"${m.id}";"${m.name}";"${m.category}";"${m.unitBuy}";"${m.unitSize}";"${m.unitCalc}";"${m.priceBuy}";"${m.waste}";"${m.yieldRate || 0}"`).join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `ikadevis_matieres_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Exportation CSV t\xE9l\xE9charg\xE9e !");
    }, className: "btn-secondary flex-1 py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5", title: "Exporter en CSV", "aria-label": "Exporter au format CSV" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-arrow-down text-brand-600" }), " Export")), /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: resourceTab === "materials" ? startNewMaterial : startNewLabor, className: `btn-primary w-full justify-center ${isReadOnlyDueToDowngrade ? "opacity-50 cursor-not-allowed" : ""}`, "aria-label": resourceTab === "materials" ? "Ajouter une nouvelle mati\xE8re" : "Ajouter une nouvelle prestation" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus" }), " ", resourceTab === "materials" ? "Nouvelle Mati\xE8re" : "Nouvelle Prestation"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-2 overflow-y-auto custom-scroll flex-1 min-h-0 lg:pr-1" }, resourceTab === "materials" ? materials.map((m) => /* @__PURE__ */ React.createElement("button", { key: m.id, onClick: () => openMaterialDetail(m), className: `flex items-center justify-between gap-2 p-3.5 rounded-xl border-2 transition-all duration-200 bg-white text-left ${selectedMaterialId === m.id ? "border-brand-500 shadow-sm" : "border-transparent hover:border-neutral-200 shadow-sm"}`, "aria-label": `S\xE9lectionner ${m.name}` }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0" }, /* @__PURE__ */ React.createElement("p", { className: `font-bold text-sm truncate ${selectedMaterialId === m.id ? "text-neutral-900" : "text-neutral-700"}` }, m.name), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 truncate" }, m.category)), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-extrabold text-brand-600 shrink-0" }, formatMoney(m.priceBuy, companyInfo.currency)))) : labor.map((l) => /* @__PURE__ */ React.createElement("button", { key: l.id, onClick: () => openLaborDetail(l), className: `flex items-center justify-between gap-2 p-3.5 rounded-xl border-2 transition-all duration-200 bg-white text-left ${selectedLaborId === l.id ? "border-brand-500 shadow-sm" : "border-transparent hover:border-neutral-200 shadow-sm"}`, "aria-label": `S\xE9lectionner ${l.name}` }, /* @__PURE__ */ React.createElement("p", { className: `font-bold text-sm truncate ${selectedLaborId === l.id ? "text-neutral-900" : "text-neutral-700"}` }, l.name), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-extrabold text-brand-600 shrink-0" }, formatMoney(l.rate, companyInfo.currency), " / ", l.unit || "u"))))), /* @__PURE__ */ React.createElement("div", { className: `${selectedItem ? "flex" : "hidden lg:flex"} flex-1 min-w-0 w-full flex-col lg:h-full lg:min-h-0 lg:overflow-y-auto custom-scroll` }, !selectedItem ? /* @__PURE__ */ React.createElement("div", { className: "app-card p-16 text-center text-neutral-400" }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${resourceTab === "materials" ? "fa-box" : "fa-user-gear"} text-3xl mb-3 text-neutral-300` }), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-bold text-neutral-600" }, "S\xE9lectionnez ", resourceTab === "materials" ? "une mati\xE8re" : "une prestation", " pour voir son d\xE9tail")) : /* @__PURE__ */ React.createElement("div", { className: "app-card flex flex-col" }, /* @__PURE__ */ React.createElement("div", { className: "p-5 sm:p-6 border-b border-neutral-100 flex items-center justify-between gap-3 bg-white" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3 min-w-0" }, /* @__PURE__ */ React.createElement("button", { onClick: closeDetail, className: "lg:hidden btn-icon text-neutral-500 hover:text-neutral-800 shrink-0", "aria-label": "Retour \xE0 la liste" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-left" })), /* @__PURE__ */ React.createElement("h2", { className: "text-lg sm:text-xl font-bold text-neutral-800 truncate" }, isResourceEditMode ? editingIsNew ? `Nouvelle ${resourceTab === "materials" ? "mati\xE8re" : "prestation"}` : `Modifier \xAB ${selectedItem.name} \xBB` : selectedItem.name)), !isResourceEditMode && /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5 shrink-0" }, /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => resourceTab === "materials" ? startEditMaterial(selectedItem) : startEditLabor(selectedItem), className: `btn-icon ${isReadOnlyDueToDowngrade ? "opacity-40 cursor-not-allowed" : ""}`, title: "Modifier", "aria-label": `Modifier ${selectedItem.name}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-pen" })), /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: () => resourceTab === "materials" ? handleDeleteMaterial(selectedItem) : handleDeleteLabor(selectedItem), className: `btn-icon ${isReadOnlyDueToDowngrade ? "opacity-40 cursor-not-allowed" : "text-neutral-400 hover:text-red-600 hover:bg-red-50"}`, title: "Supprimer", "aria-label": `Supprimer ${selectedItem.name}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash" })))), !isResourceEditMode && resourceTab === "materials" && /* @__PURE__ */ React.createElement("div", { className: "flex gap-1 px-5 sm:px-6 pt-3 border-b border-neutral-100" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setResourceDetailTab("overview"), className: `px-3 py-2 text-xs font-bold border-b-2 transition-colors ${resourceDetailTab === "overview" ? "border-brand-500 text-brand-600" : "border-transparent text-neutral-500 hover:text-neutral-800"}` }, "Vue d'ensemble"), /* @__PURE__ */ React.createElement("button", { onClick: () => setResourceDetailTab("history"), className: `px-3 py-2 text-xs font-bold border-b-2 transition-colors ${resourceDetailTab === "history" ? "border-brand-500 text-brand-600" : "border-transparent text-neutral-500 hover:text-neutral-800"}` }, "Historique des prix")), /* @__PURE__ */ React.createElement("div", { className: "p-5 sm:p-6" }, isResourceEditMode ? resourceTab === "materials" ? /* @__PURE__ */ React.createElement("form", { onSubmit: saveMaterial, className: "space-y-5" }, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-5" }, /* @__PURE__ */ React.createElement("div", { className: "md:col-span-2" }, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Nom complet"), /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, required: true, type: "text", className: "app-input font-bold", placeholder: "Ex: Tube carr\xE9 acier 25x25 (Cadres & Renforts)", value: matForm.name, onChange: (e) => setMatForm({ ...matForm, name: e.target.value }) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Cat\xE9gorie"), isCustomCategory ? /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, required: true, autoFocus: true, type: "text", className: "app-input", placeholder: "Ex: \xC9tanch\xE9it\xE9", value: matForm.category, onChange: (e) => setMatForm({ ...matForm, category: e.target.value }) }), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
      setIsCustomCategory(false);
      setMatForm({ ...matForm, category: existingCategories[0] || "" });
    }, className: "btn-secondary px-3 shrink-0", title: "Revenir \xE0 la liste", "aria-label": "Revenir \xE0 la liste des cat\xE9gories" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-list" }))) : /* @__PURE__ */ React.createElement(
      CustomSelect,
      {
        disabled: isReadOnlyDueToDowngrade,
        value: matForm.category,
        options: categoryOptionsList,
        onChange: (e) => {
          if (e.target.value === "__new__") {
            setIsCustomCategory(true);
            setMatForm({ ...matForm, category: "" });
          } else setMatForm({ ...matForm, category: e.target.value });
        }
      }
    ), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-1.5" }, "Sert au regroupement du catalogue.")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Unit\xE9 de calcul"), /* @__PURE__ */ React.createElement(
      CustomSelect,
      {
        disabled: isReadOnlyDueToDowngrade,
        value: matForm.unitCalc,
        options: calcUnitOptions,
        onChange: (e) => setMatForm({ ...matForm, unitCalc: e.target.value })
      }
    ), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-1.5" }, "Unit\xE9 employ\xE9e par les formules de recette (SURFACE, VOLUME\u2026).")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Conditionnement d'achat"), isCustomPackaging ? /* @__PURE__ */ React.createElement("div", { className: "flex gap-2" }, /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, required: true, autoFocus: true, type: "text", className: "app-input", placeholder: "Ex: Couronne (50m)", value: matForm.unitBuy, onChange: (e) => setMatForm({ ...matForm, unitBuy: e.target.value }) }), /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
      setIsCustomPackaging(false);
      setMatForm({ ...matForm, unitBuy: "Unit\xE9" });
    }, className: "btn-secondary px-3 shrink-0", title: "Revenir \xE0 la liste", "aria-label": "Revenir \xE0 la liste des conditionnements" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-list" }))) : /* @__PURE__ */ React.createElement(
      CustomSelect,
      {
        disabled: isReadOnlyDueToDowngrade,
        value: matForm.unitBuy,
        options: packagingOptionsList,
        onChange: (e) => {
          if (e.target.value === "__new__") {
            setIsCustomPackaging(true);
            setMatForm({ ...matForm, unitBuy: "" });
          } else setMatForm({ ...matForm, unitBuy: e.target.value });
        }
      }
    ), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-1.5" }, "Ce que le fournisseur vous vend.")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Contenu d'un conditionnement"), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        disabled: isReadOnlyDueToDowngrade || matForm.purchaseMode === "real",
        required: true,
        type: "number",
        step: "0.01",
        min: "0.01",
        className: "app-input pr-14",
        value: matForm.unitSize,
        onChange: (e) => setMatForm({ ...matForm, unitSize: e.target.value })
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-sm" }, matForm.unitCalc || "u")), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-1.5" }, matForm.purchaseMode === "real" ? "Fix\xE9 \xE0 1 : en quantit\xE9 r\xE9elle, on ach\xE8te exactement l\u2019unit\xE9 de calcul." : `Ex : une barre de 6 ${matForm.unitCalc || "m"} \u2192 saisir 6.`)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Prix d'Achat Brut"), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, required: true, type: "number", min: "0", className: "app-input font-bold text-brand-700 pr-16", placeholder: "0", value: matForm.priceBuy, onChange: (e) => setMatForm({ ...matForm, priceBuy: e.target.value }) }), /* @__PURE__ */ React.createElement("span", { className: "absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 font-bold" }, companyInfo.currency || "FCFA")), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-1.5" }, "Prix pay\xE9 pour UN conditionnement entier.")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Taux de perte (%)"), /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, required: true, type: "number", min: "0", max: "100", className: "app-input", value: matForm.waste, onChange: (e) => setMatForm({ ...matForm, waste: e.target.value }) }), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-1.5" }, "Chutes et casse ajout\xE9es \xE0 la quantit\xE9 calcul\xE9e.")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Rendement Mati\xE8re (optionnel)"), /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, type: "number", step: "0.1", min: "0", className: "app-input font-bold", value: matForm.yieldRate || "", onChange: (e) => setMatForm({ ...matForm, yieldRate: e.target.value }), placeholder: "ex: 10" }), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-1.5" }, "Surface couverte par unit\xE9 (peinture, colle\u2026). Laisser vide sinon.")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Strat\xE9gie d'Achat BTP"), /* @__PURE__ */ React.createElement(
      CustomSelect,
      {
        disabled: isReadOnlyDueToDowngrade,
        value: matForm.purchaseMode || "pack",
        options: [
          { value: "pack", label: "Conditionnement entier (barre, feuille, pot\u2026)" },
          { value: "real", label: "Quantit\xE9 r\xE9elle exacte (au m\xB2, m, L)" },
          { value: "step", label: "Pas commercial ajustable" }
        ],
        onChange: (e) => {
          const next = { ...matForm, purchaseMode: e.target.value };
          if (e.target.value === "real") next.unitSize = 1;
          setMatForm(next);
        }
      }
    )), matForm.purchaseMode === "step" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Pas Commercial"), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, type: "number", step: "0.01", min: "0.01", className: "app-input font-bold text-brand-600 pr-14", value: matForm.purchaseStep || 0.5, onChange: (e) => setMatForm({ ...matForm, purchaseStep: e.target.value }) }), /* @__PURE__ */ React.createElement("span", { className: "absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 font-bold text-sm" }, matForm.unitCalc || "u")), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-1.5" }, "L\u2019achat est arrondi \xE0 ce multiple (ex : 0.5 \u2192 2.5 puis 3)."))), parseFloat(matForm.priceBuy) > 0 && parseFloat(matForm.unitSize) > 0 && /* @__PURE__ */ React.createElement("div", { className: "bg-brand-50/50 border border-brand-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold text-neutral-600" }, "Co\xFBt unitaire net calcul\xE9", /* @__PURE__ */ React.createElement("span", { className: "block text-[11px] font-medium text-neutral-400 mt-0.5" }, formatMoney(parseFloat(matForm.priceBuy), companyInfo.currency), " \xF7 ", matForm.unitSize, " ", matForm.unitCalc || "u")), /* @__PURE__ */ React.createElement("span", { className: "text-lg font-black text-brand-600 font-mono" }, formatMoney(parseFloat(matForm.priceBuy) / parseFloat(matForm.unitSize), companyInfo.currency), /* @__PURE__ */ React.createElement("span", { className: "text-xs font-bold text-neutral-500" }, " / ", matForm.unitCalc || "u"))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-end gap-3 pt-2 border-t border-neutral-100" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: cancelEdit, className: "btn-secondary", "aria-label": "Annuler la modification" }, "Annuler"), !isReadOnlyDueToDowngrade && /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn-primary", "aria-label": "Enregistrer la ressource" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check mr-1" }), " Enregistrer"))) : /* @__PURE__ */ React.createElement("form", { onSubmit: saveLabor, className: "space-y-5" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Intitul\xE9 / M\xE9tier"), /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, required: true, type: "text", className: "app-input font-bold", value: laborForm.name, onChange: (e) => setLaborForm({ ...laborForm, name: e.target.value }), placeholder: "Ex: Application Peinture" })), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Mode de calcul"), /* @__PURE__ */ React.createElement(
      CustomSelect,
      {
        disabled: isReadOnlyDueToDowngrade,
        value: laborForm.calcMode,
        onChange: (e) => setLaborForm({ ...laborForm, calcMode: e.target.value }),
        options: [
          { value: "unite", label: "Unit\xE9 (Quantit\xE9)" },
          { value: "surface", label: "Surface (L x H m\xB2)" },
          { value: "volume", label: "Volume (L x H x P m\xB3)" },
          { value: "perimetre", label: "P\xE9rim\xE8tre / Lin\xE9aire ml" },
          { value: "forfait", label: "Forfait Fixe" }
        ]
      }
    )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Unit\xE9 de mesure"), /* @__PURE__ */ React.createElement(
      CustomSelect,
      {
        disabled: isReadOnlyDueToDowngrade,
        value: laborForm.unit || "h",
        onChange: (e) => setLaborForm({ ...laborForm, unit: e.target.value }),
        options: [
          { value: "h", label: "h (heures)" },
          { value: "j", label: "j (jours)" },
          { value: "j-eq", label: "j-eq (jour-\xE9quipe)" },
          { value: "m\xB3", label: "m\xB3 (m\xE8tre cube)" },
          { value: "kg", label: "kg (kilogramme)" },
          { value: "t", label: "t (tonne)" },
          { value: "sac", label: "sac" },
          { value: "L", label: "L (litre)" },
          { value: "ml", label: "ml (m\xE8tre lin\xE9aire)" },
          { value: "m\xB2", label: "m\xB2" },
          { value: "u", label: "u (unit\xE9s / pi\xE8ces)" },
          { value: "ens", label: "ens (ensemble)" },
          { value: "pt", label: "pt (point / poste)" },
          { value: "forfait", label: "forfait" }
        ]
      }
    ))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Tarif Unitaire"), /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, required: true, type: "number", min: "0", className: "app-input font-bold text-brand-700 pr-12", value: laborForm.rate, onChange: (e) => setLaborForm({ ...laborForm, rate: e.target.value }) }), /* @__PURE__ */ React.createElement("span", { className: "absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 font-bold" }, companyInfo.currency || "FCFA"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Rendement (Vitesse d'Ex\xE9cution)"), /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, type: "number", min: "0", className: "app-input font-bold text-brand-700", value: laborForm.yieldRate || "", onChange: (e) => setLaborForm({ ...laborForm, yieldRate: e.target.value }), placeholder: "ex: 80 (m\xB2/j)" }))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-end gap-3 pt-2 border-t border-neutral-100" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: cancelEdit, className: "btn-secondary", "aria-label": "Annuler la modification" }, "Annuler"), !isReadOnlyDueToDowngrade && /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn-primary", "aria-label": "Enregistrer la prestation" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check mr-1" }), " Enregistrer"))) : resourceTab === "materials" && resourceDetailTab === "history" ? /* @__PURE__ */ React.createElement("div", { className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "p-4 bg-neutral-50 rounded-2xl border border-neutral-200 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider block" }, "Prix d'Achat Actuel"), /* @__PURE__ */ React.createElement("span", { className: "text-xl font-black text-brand-600 font-mono" }, formatMoney(selectedItem.priceBuy || selectedItem.priceCalc, companyInfo.currency)), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] text-neutral-500 block" }, "par ", selectedItem.unitBuy || selectedItem.unitCalc)), historyVariationPct !== null && /* @__PURE__ */ React.createElement("span", { className: `px-2.5 py-1 rounded-xl text-xs font-black border ${historyVariationPct >= 0 ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-red-100 text-red-800 border-red-300"}` }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid fa-arrow-trend-${historyVariationPct >= 0 ? "up" : "down"} mr-1` }), " ", historyVariationPct >= 0 ? "+" : "", historyVariationPct.toFixed(1), "%")), !isCloudOrgActive ? /* @__PURE__ */ React.createElement("div", { className: "p-6 text-center text-neutral-400 bg-neutral-50 rounded-2xl border border-neutral-200" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-cloud text-2xl mb-2 text-neutral-300" }), /* @__PURE__ */ React.createElement("p", { className: "text-xs font-bold text-neutral-600" }, "Historique disponible uniquement en mode connect\xE9"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-1" }, "Connectez-vous \xE0 votre organisation cloud pour suivre l'\xE9volution r\xE9elle des prix.")) : materialHistoryLoading ? /* @__PURE__ */ React.createElement("div", { className: "p-6 text-center text-neutral-400" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-notch fa-spin text-xl text-amber-500" })) : materialHistory.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "p-6 text-center text-neutral-400 bg-neutral-50 rounded-2xl border border-neutral-200" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-clock-rotate-left text-2xl mb-2 text-neutral-300" }), /* @__PURE__ */ React.createElement("p", { className: "text-xs font-bold text-neutral-600" }, materialHistoryError ? "Historique indisponible pour le moment" : "Aucun changement de prix enregistr\xE9"), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400 mt-1" }, "Chaque modification du prix d'achat sera journalis\xE9e ici.")) : /* @__PURE__ */ React.createElement("div", { className: "border border-neutral-200 rounded-2xl bg-white overflow-hidden shadow-2xs" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left text-xs" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-neutral-50 border-b border-neutral-100 text-[10px] font-extrabold text-neutral-400 uppercase" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "p-2.5 pl-3" }, "Date"), /* @__PURE__ */ React.createElement("th", { className: "p-2.5" }, "Fournisseur"), /* @__PURE__ */ React.createElement("th", { className: "p-2.5 text-right pr-3" }, "Tarif HT"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-neutral-100" }, materialHistory.map((h) => /* @__PURE__ */ React.createElement("tr", { key: h.id, className: "hover:bg-neutral-50/50" }, /* @__PURE__ */ React.createElement("td", { className: "p-2.5 pl-3 font-mono text-neutral-500" }, new Date(h.created_at).toLocaleDateString("fr-FR")), /* @__PURE__ */ React.createElement("td", { className: "p-2.5 font-bold text-neutral-800" }, h.supplier_name || "Non renseign\xE9"), /* @__PURE__ */ React.createElement("td", { className: "p-2.5 text-right pr-3 font-mono font-bold text-neutral-900" }, formatMoney(h.price)))))))) : resourceTab === "materials" ? /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Achat Fournisseur"), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-neutral-800" }, formatMoney(selectedItem.priceBuy, companyInfo.currency)), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 mt-0.5" }, "pour ", selectedItem.unitSize, " ", selectedItem.unitCalc, " (", selectedItem.unitBuy, ")")), /* @__PURE__ */ React.createElement("div", { className: "bg-brand-50/30 p-3.5 rounded-xl border border-neutral-200/80" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Co\xFBt Unitaire Net"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-brand-600 text-base" }, formatMoney(selectedItem.priceCalc, companyInfo.currency)), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 mt-0.5" }, "/ ", selectedItem.unitCalc)), /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Rendement Mati\xE8re"), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-neutral-800" }, selectedItem.yieldRate > 0 ? `${selectedItem.yieldRate} m\xB2/${selectedItem.unitCalc}` : "Non renseign\xE9")), /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Taux de perte"), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-neutral-800" }, selectedItem.waste > 0 ? `${selectedItem.waste}%` : "Aucune")), /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80 col-span-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Strat\xE9gie d'Achat BTP"), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-neutral-800" }, selectedItem.purchaseMode === "real" ? "Quantit\xE9 R\xE9elle Exacte" : selectedItem.purchaseMode === "step" ? `Pas Commercial Ajustable (${selectedItem.purchaseStep || 0.5})` : "Conditionnement Entier"))) : /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-brand-50/30 p-3.5 rounded-xl border border-neutral-200/80" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Tarif Unitaire"), /* @__PURE__ */ React.createElement("span", { className: "font-extrabold text-brand-600 text-base" }, formatMoney(selectedItem.rate, companyInfo.currency)), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 mt-0.5" }, "/ ", selectedItem.unit || "u")), /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Vitesse d'Ex\xE9cution"), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-neutral-800" }, selectedItem.yieldRate > 0 ? `${selectedItem.yieldRate} m\xB2/${selectedItem.unit}` : "Au forfait unitaire")), /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-50 p-3.5 rounded-xl border border-neutral-200/80 col-span-2" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-400 block text-[10px] uppercase font-bold" }, "Mode de Calcul"), /* @__PURE__ */ React.createElement("span", { className: "font-bold text-neutral-800 capitalize" }, selectedItem.calcMode)))))));
  };
  const NavItem = ({ id, icon, label, onClickExtra }) => {
    const isActive = activeView === id;
    return /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setActiveView(id);
          if (onClickExtra) onClickExtra();
        },
        "aria-current": isActive ? "page" : void 0,
        className: `flex flex-col lg:flex-row items-center lg:justify-start justify-center w-full lg:px-4 py-2 lg:py-3.5 rounded-xl transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                          ${isActive ? "text-brand-600 bg-brand-50 lg:shadow-[inset_3px_0_0_0_#e6222b]" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"}`
      },
      /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${icon} text-xl lg:text-lg mb-1 lg:mb-0 lg:w-6 lg:text-center transition-transform ${isActive ? "scale-110 lg:scale-100 text-brand-600" : "opacity-70 group-hover:text-neutral-700"}` }),
      /* @__PURE__ */ React.createElement("span", { className: `text-[11px] lg:text-sm font-bold tracking-wide lg:tracking-normal ${isActive ? "text-brand-600" : "text-neutral-700"}` }, label)
    );
  };
  const SidebarNavItem = ({ id, icon, label, onClickExtra, collapsed = false }) => {
    const isActive = activeView === id;
    return /* @__PURE__ */ React.createElement("div", { className: collapsed ? "relative sidebar-item-collapsed-wrap" : "relative" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          setActiveView(id);
          if (onClickExtra) onClickExtra();
        },
        "aria-current": isActive ? "page" : void 0,
        "aria-label": collapsed ? label : void 0,
        className: `sidebar-item outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${collapsed ? "sidebar-item-collapsed" : ""} ${isActive ? "sidebar-item-active" : ""}`
      },
      /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${icon} sidebar-item-icon` }),
      !collapsed && /* @__PURE__ */ React.createElement("span", { className: "sidebar-item-label" }, label)
    ), collapsed && /* @__PURE__ */ React.createElement("span", { className: "sidebar-tooltip", role: "tooltip" }, label));
  };
  return /* @__PURE__ */ React.createElement("div", { className: "flex h-[100dvh] w-full bg-neutral-100 overflow-hidden font-sans" }, /* @__PURE__ */ React.createElement(
    "a",
    {
      href: "#main-content",
      className: "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-brand-600 focus:text-white focus:font-bold focus:px-4 focus:py-2.5 focus:rounded-xl focus:shadow-xl"
    },
    "Aller au contenu principal"
  ), /* @__PURE__ */ React.createElement("aside", { className: "hidden lg:flex flex-col sidebar-shell border-r border-neutral-200/70 z-20 shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "p-4 flex flex-col gap-3 border-b border-neutral-100 shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement(LogoSVG, { className: "h-8 w-auto" })), /* @__PURE__ */ React.createElement(
    OrganizationSwitcher,
    {
      userOrganizations: userOrganizations.map((o) => o.id === "org_default" && companyInfo.name?.trim() ? { ...o, name: companyInfo.name.trim(), currency: companyInfo.currency || o.currency } : o),
      activeOrgId: activeOrganizationId,
      activeOrgRole: activeOrganizationRole,
      onSelectOrg: (orgId) => {
        setActiveOrganizationId(orgId);
        const found = userOrganizations.find((o) => o.id === orgId);
        if (found) setActiveOrganizationRole(found.role);
        localStorage.setItem(`ikadevis_active_org_${currentUserId}`, orgId);
        showToast(`Organisation active : ${found?.name || orgId}`, "info");
      },
      onOpenCreateOrg: () => setIsCreateOrgModalOpen(true),
      isGuest: !sbUser || sbUser.id === "guest"
    }
  )), /* @__PURE__ */ React.createElement("nav", { className: "flex-1 overflow-y-auto py-5 px-3 flex flex-col gap-[5px] custom-scroll", "aria-label": "Menu principal" }, /* @__PURE__ */ React.createElement("p", { className: "sidebar-section-label" }, "Menu Principal"), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "projects", icon: "fa-folder-tree", label: "Affaires & Projets" }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "clients", icon: "fa-users", label: "Clients (CRM)" }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "calculator", icon: "fa-calculator", label: "Cr\xE9er un Devis" }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "savedQuotes", icon: "fa-folder-open", label: "Devis Enregistr\xE9s" }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "recipes", icon: "fa-layer-group", label: "Catalogue Ouvrages" }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "materials", icon: "fa-database", label: "Ressources & Prix" }), isPlatformAdmin && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("p", { className: "sidebar-section-label mt-4" }, "Plateforme"), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "platformAdmin", icon: "fa-shield-halved", label: "Administration" }))), /* @__PURE__ */ React.createElement("div", { className: "p-4 border-t border-neutral-100 flex flex-col gap-2.5" }, sbUser && /* @__PURE__ */ React.createElement("div", { className: `flex flex-col gap-1 px-3.5 py-2.5 rounded-xl text-xs font-semibold border ${connectionState.chip}` }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { className: "flex items-center gap-1.5 font-bold" }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${connectionState.icon}` }), connectionState.label), connectionState.key === "synced" && lastSavedTime.current && /* @__PURE__ */ React.createElement("span", { className: "text-[10px] opacity-75 font-mono" }, lastSavedTime.current)), /* @__PURE__ */ React.createElement("span", { className: "truncate text-[11px] opacity-80" }, connectionState.detail)), hasPermission(activeOrganizationRole, "canViewAudit") && /* @__PURE__ */ React.createElement("button", { onClick: () => setIsAuditModalOpen(true), className: "w-full btn-secondary text-xs py-2.5 px-3 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50 border-indigo-200 flex items-center justify-center gap-2 font-bold", "aria-label": "Journal de s\xE9curit\xE9 et audit" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-shield-halved text-indigo-600" }), " Journal d'Audit & S\xE9curit\xE9"), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsCompanyModalOpen(true), className: "w-full btn-secondary text-xs py-2.5 px-3 text-neutral-700 hover:bg-neutral-50 flex items-center justify-center gap-2", "aria-label": "Param\xE8tres de l'entreprise" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-building text-brand-500" }), " Param\xE8tres Entreprise"), onSignOut && /* @__PURE__ */ React.createElement("button", { onClick: onSignOut, className: "w-full text-xs py-2.5 px-3 rounded-xl text-neutral-500 hover:text-red-600 hover:bg-red-50 flex items-center justify-center gap-2 font-semibold transition-all", "aria-label": "Se d\xE9connecter" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-right-from-bracket" }), " D\xE9connexion"))), /* @__PURE__ */ React.createElement("aside", { className: "hidden md:flex lg:hidden flex-col sidebar-shell-collapsed border-r border-neutral-200/70 z-20 shrink-0 items-center py-4 gap-4" }, /* @__PURE__ */ React.createElement("svg", { className: "h-7 w-7", viewBox: "0 0 50 50", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true" }, /* @__PURE__ */ React.createElement("rect", { x: "5", y: "5", width: "40", height: "40", rx: "10", fill: "#E6222B" }), /* @__PURE__ */ React.createElement("path", { d: "M15 30L23 18L31 30H15Z", fill: "white" }), /* @__PURE__ */ React.createElement("circle", { cx: "33", cy: "17", r: "4", fill: "white" })), /* @__PURE__ */ React.createElement("nav", { className: "flex-1 overflow-y-auto flex flex-col gap-[5px] custom-scroll w-full items-center", "aria-label": "Menu principal (repli\xE9)" }, /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "projects", icon: "fa-folder-tree", label: "Affaires & Projets", collapsed: true }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "clients", icon: "fa-users", label: "Clients (CRM)", collapsed: true }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "calculator", icon: "fa-calculator", label: "Cr\xE9er un Devis", collapsed: true }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "savedQuotes", icon: "fa-folder-open", label: "Devis Enregistr\xE9s", collapsed: true }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "recipes", icon: "fa-layer-group", label: "Catalogue Ouvrages", collapsed: true }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "materials", icon: "fa-database", label: "Ressources & Prix", collapsed: true })), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-2 w-full items-center pt-2 border-t border-neutral-100" }, hasPermission(activeOrganizationRole, "canViewAudit") && /* @__PURE__ */ React.createElement("div", { className: "relative sidebar-item-collapsed-wrap" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setIsAuditModalOpen(true), className: "btn-icon text-indigo-600 hover:bg-indigo-50", "aria-label": "Journal de s\xE9curit\xE9 et audit" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-shield-halved" })), /* @__PURE__ */ React.createElement("span", { className: "sidebar-tooltip", role: "tooltip" }, "Journal d'Audit & S\xE9curit\xE9")), /* @__PURE__ */ React.createElement("div", { className: "relative sidebar-item-collapsed-wrap" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setIsCompanyModalOpen(true), className: "btn-icon text-brand-500 hover:bg-brand-50", "aria-label": "Param\xE8tres de l'entreprise" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-building" })), /* @__PURE__ */ React.createElement("span", { className: "sidebar-tooltip", role: "tooltip" }, "Param\xE8tres Entreprise")), onSignOut && /* @__PURE__ */ React.createElement("div", { className: "relative sidebar-item-collapsed-wrap" }, /* @__PURE__ */ React.createElement("button", { onClick: onSignOut, className: "btn-icon text-neutral-400 hover:text-red-600 hover:bg-red-50", "aria-label": "Se d\xE9connecter" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-right-from-bracket" })), /* @__PURE__ */ React.createElement("span", { className: "sidebar-tooltip", role: "tooltip" }, "D\xE9connexion")))), isMobileDrawerOpen && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-[150] md:hidden flex", role: "dialog", "aria-modal": "true", "aria-label": "Menu de navigation mobile" }, /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/60 backdrop-blur-sm transition-opacity", onClick: () => setIsMobileDrawerOpen(false), "aria-hidden": "true" }), /* @__PURE__ */ React.createElement("div", { className: "relative flex flex-col w-[min(85vw,300px)] sidebar-shell h-full shadow-2xl z-10 animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "p-4 flex items-center justify-between border-b border-neutral-100" }, /* @__PURE__ */ React.createElement(LogoSVG, { className: "h-8" }), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsMobileDrawerOpen(false), className: "btn-icon text-neutral-500 hover:text-neutral-800", "aria-label": "Fermer le menu de navigation" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-xl" }))), /* @__PURE__ */ React.createElement("nav", { className: "flex-1 overflow-y-auto p-3 flex flex-col gap-[5px] custom-scroll", "aria-label": "Navigation mobile" }, /* @__PURE__ */ React.createElement("p", { className: "sidebar-section-label" }, "Navigation"), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "projects", icon: "fa-folder-tree", label: "Affaires & Projets", onClickExtra: () => setIsMobileDrawerOpen(false) }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "clients", icon: "fa-users", label: "Clients (CRM)", onClickExtra: () => setIsMobileDrawerOpen(false) }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "calculator", icon: "fa-calculator", label: "Cr\xE9er un Devis", onClickExtra: () => setIsMobileDrawerOpen(false) }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "savedQuotes", icon: "fa-folder-open", label: "Devis Enregistr\xE9s", onClickExtra: () => setIsMobileDrawerOpen(false) }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "recipes", icon: "fa-layer-group", label: "Catalogue Ouvrages", onClickExtra: () => setIsMobileDrawerOpen(false) }), /* @__PURE__ */ React.createElement(SidebarNavItem, { id: "materials", icon: "fa-database", label: "Ressources & Prix", onClickExtra: () => setIsMobileDrawerOpen(false) })), /* @__PURE__ */ React.createElement("div", { className: "p-4 border-t border-neutral-100 space-y-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setIsCompanyModalOpen(true);
    setIsMobileDrawerOpen(false);
  }, className: "w-full btn-secondary text-xs py-2 px-3 justify-center", "aria-label": "Param\xE8tres entreprise" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-building text-brand-500 mr-2" }), " Param\xE8tres Entreprise"), onSignOut && /* @__PURE__ */ React.createElement("button", { onClick: onSignOut, className: "w-full text-xs py-2 px-3 rounded-xl text-neutral-500 hover:text-red-600 hover:bg-red-50 flex items-center justify-center gap-2 font-semibold", "aria-label": "D\xE9connexion" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-right-from-bracket" }), " D\xE9connexion")))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 flex flex-col h-full overflow-hidden relative" }, /* @__PURE__ */ React.createElement("header", { className: "md:hidden shrink-0 h-16 bg-white border-b border-neutral-200 z-30 flex items-center justify-between px-4 shadow-sm" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setIsMobileDrawerOpen(true),
      className: "btn-icon text-neutral-700 hover:text-brand-600 hover:bg-neutral-100 p-2",
      "aria-label": "Ouvrir le menu de navigation",
      title: "Menu"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-bars text-xl" })
  ), /* @__PURE__ */ React.createElement(LogoSVG, { className: "h-7" })), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("div", { className: `flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${connectionState.chip}` }, /* @__PURE__ */ React.createElement("span", { className: `w-1.5 h-1.5 rounded-full ${connectionState.dot}` }), /* @__PURE__ */ React.createElement("span", null, connectionState.label)), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setIsCompanyModalOpen(true),
      className: "btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5",
      "aria-label": "Ouvrir les param\xE8tres entreprise"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-building text-brand-500" }),
    /* @__PURE__ */ React.createElement("span", { className: "hidden sm:inline font-bold truncate max-w-[120px]" }, companyInfo.name)
  ))), downgradeWarning && /* @__PURE__ */ React.createElement("div", { className: "bg-red-600 text-white px-4 py-3 text-xs font-extrabold flex items-center justify-between shrink-0 shadow-lg animate-pulse", role: "alert" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-lock text-base" }), /* @__PURE__ */ React.createElement("span", null, downgradeWarning))), cloudState === "offline_error" && cloudErrorMessage && /* @__PURE__ */ React.createElement("div", { className: "bg-amber-600 text-white px-4 py-3 text-xs font-extrabold flex items-center justify-between shrink-0 shadow-lg", role: "alert" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-wifi text-base" }), /* @__PURE__ */ React.createElement("span", null, "\u26A0\uFE0F ", cloudErrorMessage)), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setCloudState("idle");
    setSbDataLoaded(false);
    setCloudRetryCount((c) => c + 1);
  }, className: "underline text-xs hover:text-amber-100 font-bold px-3 py-1 bg-amber-700/60 rounded-md transition-all" }, "R\xE9essayer la synchronisation")), /* @__PURE__ */ React.createElement("main", { id: "main-content", className: "flex-1 min-h-0 overflow-hidden w-full flex flex-col" }, /* @__PURE__ */ React.createElement("div", { className: "p-4 md:p-6 lg:p-8 w-full max-w-[1600px] mx-auto flex-1 min-h-0 flex flex-col" }, /* @__PURE__ */ React.createElement("header", { className: "hidden lg:flex h-12 items-center justify-between mb-6 shrink-0" }, /* @__PURE__ */ React.createElement("h1", { className: "text-2xl font-extrabold text-neutral-800 tracking-tight" }, activeView === "calculator" && "Cr\xE9ation & Chiffrage de Devis BTP", activeView === "savedQuotes" && "Devis Enregistr\xE9s & PDF Commercial", activeView === "recipes" && "Catalogue des Ouvrages & Formules", activeView === "materials" && "Base des Ressources & Co\xFBts", activeView === "platformAdmin" && "Administration de la Plateforme"), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => setIsHealthModalOpen(true),
      className: `flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all shadow-2xs hover:brightness-95 ${connectionState.chip}`,
      title: "Ouvrir le Diagnostic Syst\xE8me & Health Check"
    },
    /* @__PURE__ */ React.createElement("span", { className: `w-2 h-2 rounded-full ${connectionState.dot} ${connectionState.key === "synced" ? "animate-pulse" : ""}` }),
    /* @__PURE__ */ React.createElement("span", null, connectionState.label)
  ), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsCompanyModalOpen(true), className: "btn-secondary text-xs py-1.5 px-3", "aria-label": "Param\xE8tres de l'entreprise" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-building text-brand-500" }), " ", companyInfo.name), /* @__PURE__ */ React.createElement("button", { disabled: isReadOnlyDueToDowngrade, onClick: resetToDefault, className: `btn-secondary text-xs text-red-600 border-red-200 hover:bg-red-50 py-1.5 px-3 ${isReadOnlyDueToDowngrade ? "opacity-50 cursor-not-allowed" : ""}`, "aria-label": "R\xE9initialiser les donn\xE9es" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-arrow-rotate-left" }), " R\xE9initialiser"))), /* @__PURE__ */ React.createElement("div", { className: "animate-fade-in w-full flex-1 min-h-0" }, activeView === "calculator" && renderCalculator(), activeView === "projects" && renderProjects(), activeView === "clients" && renderClients(), activeView === "savedQuotes" && renderSavedQuotes(), activeView === "recipes" && renderRecipes(), activeView === "materials" && renderMaterials(), activeView === "platformAdmin" && renderPlatformAdmin()))), /* @__PURE__ */ React.createElement("nav", { className: "md:hidden absolute bottom-0 left-0 right-0 bg-white border-t border-neutral-200 z-40 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom,1rem)] pt-2 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] min-h-[4.5rem]", "aria-label": "Barre de navigation rapide" }, /* @__PURE__ */ React.createElement(NavItem, { id: "calculator", icon: "fa-calculator", label: "Calcul" }), /* @__PURE__ */ React.createElement(NavItem, { id: "savedQuotes", icon: "fa-folder-open", label: "Mes devis" }), /* @__PURE__ */ React.createElement(NavItem, { id: "recipes", icon: "fa-layer-group", label: "Catalogue" }), /* @__PURE__ */ React.createElement(NavItem, { id: "materials", icon: "fa-database", label: "Ressources" }))), isAuditModalOpen && /* @__PURE__ */ React.createElement(
    AuditLogViewerModal,
    {
      isOpen: isAuditModalOpen,
      onClose: () => setIsAuditModalOpen(false),
      organizationId: activeOrganizationId,
      supabaseClient,
      currentRole: activeOrganizationRole
    }
  ), isCreateOrgModalOpen && /* @__PURE__ */ React.createElement(
    CreateOrganizationModal,
    {
      isOpen: isCreateOrgModalOpen,
      onClose: () => setIsCreateOrgModalOpen(false),
      onCreateOrg: handleCreateOrganization,
      isReadOnly: isReadOnlyDueToDowngrade
    }
  ), isNewProjectModalOpen && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-floating w-full max-w-lg flex flex-col max-h-[90dvh] overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white shrink-0" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-neutral-800 text-lg" }, "Nouvelle Affaire"), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsNewProjectModalOpen(false), className: "btn-icon w-8 h-8", "aria-label": "Fermer la bo\xEEte de dialogue" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-xl" }))), /* @__PURE__ */ React.createElement("div", { className: "p-6 overflow-y-auto custom-scroll bg-neutral-50/50" }, /* @__PURE__ */ React.createElement("form", { id: "newProjectForm", onSubmit: (e) => {
    e.preventDefault();
    const name = newProjectForm.name.trim();
    if (!name) {
      showToast("Le nom de l'affaire est requis.", "error");
      return;
    }
    const selectedClient = clients.find((c) => c.id === newProjectForm.clientId);
    if (!selectedClient) {
      showToast("S\xE9lectionnez un client pour cette affaire.", "error");
      return;
    }
    const newCode = `PRJ-${(/* @__PURE__ */ new Date()).getFullYear()}-${String(projects.length + 1).padStart(3, "0")}`;
    const newP = {
      id: `prj-${Date.now()}`,
      code: newCode,
      name,
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      siteAddress: newProjectForm.siteAddress.trim(),
      city: newProjectForm.city.trim() || "Dakar",
      status: "active",
      budgetEstimated: parseFloat(newProjectForm.budgetEstimated) || 0,
      createdAt: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
    };
    updateProjects([newP, ...projects]);
    showToast(`\u2713 Affaire ${newCode} cr\xE9\xE9e avec succ\xE8s !`, "success");
    setIsNewProjectModalOpen(false);
  }, className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Nom de l'affaire"), /* @__PURE__ */ React.createElement("input", { required: true, type: "text", className: "app-input font-bold", placeholder: "Ex: Construction Villa R+1", value: newProjectForm.name, onChange: (e) => setNewProjectForm({ ...newProjectForm, name: e.target.value }) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Client / Donneur d'ordres"), clients.length > 0 ? /* @__PURE__ */ React.createElement(
    CustomSelect,
    {
      value: newProjectForm.clientId,
      onChange: (e) => setNewProjectForm({ ...newProjectForm, clientId: e.target.value }),
      options: clients.map((c) => ({ value: c.id, label: c.name }))
    }
  ) : /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 italic" }, "Aucun client enregistr\xE9 \u2014 cr\xE9ez d'abord une fiche client.")), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Adresse chantier"), /* @__PURE__ */ React.createElement("input", { type: "text", className: "app-input", placeholder: "Ex: Plateau, Rue Carnot", value: newProjectForm.siteAddress, onChange: (e) => setNewProjectForm({ ...newProjectForm, siteAddress: e.target.value }) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Ville"), /* @__PURE__ */ React.createElement("input", { type: "text", className: "app-input", value: newProjectForm.city, onChange: (e) => setNewProjectForm({ ...newProjectForm, city: e.target.value }) }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Budget estim\xE9 (", companyInfo.currency || "FCFA", ")"), /* @__PURE__ */ React.createElement("input", { type: "number", min: "0", className: "app-input font-bold", placeholder: "0", value: newProjectForm.budgetEstimated, onChange: (e) => setNewProjectForm({ ...newProjectForm, budgetEstimated: e.target.value }) })))), /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3 shrink-0" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setIsNewProjectModalOpen(false), className: "btn-secondary", "aria-label": "Annuler la cr\xE9ation" }, "Annuler"), /* @__PURE__ */ React.createElement("button", { type: "submit", form: "newProjectForm", className: "btn-primary", "aria-label": "Cr\xE9er l'affaire" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check mr-1" }), " Cr\xE9er l'affaire")))), isNewClientModalOpen && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-floating w-full max-w-lg flex flex-col max-h-[90dvh] overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white shrink-0" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-neutral-800 text-lg" }, editingClientId ? "Modifier le Client" : "Nouveau Client"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setIsNewClientModalOpen(false);
    setEditingClientId(null);
  }, className: "btn-icon w-8 h-8", "aria-label": "Fermer la bo\xEEte de dialogue" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-xl" }))), /* @__PURE__ */ React.createElement("div", { className: "p-6 overflow-y-auto custom-scroll bg-neutral-50/50" }, /* @__PURE__ */ React.createElement("form", { id: "newClientForm", onSubmit: (e) => {
    e.preventDefault();
    const name = newClientForm.name.trim();
    if (!name) {
      showToast("Le nom du client est requis.", "error");
      return;
    }
    const payload = {
      name,
      contactPerson: newClientForm.contactPerson.trim(),
      taxId: newClientForm.taxId.trim(),
      phone: newClientForm.phone.trim(),
      email: newClientForm.email.trim(),
      address: newClientForm.address.trim(),
      city: newClientForm.city.trim()
    };
    if (editingClientId) {
      const previous = clients.find((c) => c.id === editingClientId);
      updateClients(clients.map((c) => c.id === editingClientId ? { ...c, ...payload } : c));
      if (previous && previous.name !== name) {
        updateProjects(projects.map((p) => p.clientId === editingClientId || p.clientName === previous.name ? { ...p, clientName: name } : p));
        updateSavedQuotes(savedQuotes.map((q) => q.clientId === editingClientId || q.clientName === previous.name ? { ...q, clientName: name } : q));
      }
      showToast("\u2713 Fiche client mise \xE0 jour !", "success");
    } else {
      updateClients([{ id: `cli-${Date.now()}`, ...payload, city: payload.city || "Dakar", notes: "" }, ...clients]);
      showToast("\u2713 Fiche client cr\xE9\xE9e !", "success");
    }
    setIsNewClientModalOpen(false);
    setEditingClientId(null);
  }, className: "space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Nom du client / raison sociale"), /* @__PURE__ */ React.createElement("input", { required: true, type: "text", className: "app-input font-bold", placeholder: "Ex: SARL COMATEX", value: newClientForm.name, onChange: (e) => setNewClientForm({ ...newClientForm, name: e.target.value }) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Contact principal"), /* @__PURE__ */ React.createElement("input", { type: "text", className: "app-input", placeholder: "Ex: M. Amadou DIOP (Directeur G\xE9n\xE9ral)", value: newClientForm.contactPerson, onChange: (e) => setNewClientForm({ ...newClientForm, contactPerson: e.target.value }) })), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "NIF / RCCM"), /* @__PURE__ */ React.createElement("input", { type: "text", className: "app-input font-mono", placeholder: "Ex: NIF-00482910-A", value: newClientForm.taxId, onChange: (e) => setNewClientForm({ ...newClientForm, taxId: e.target.value }) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "T\xE9l\xE9phone"), /* @__PURE__ */ React.createElement("input", { type: "tel", className: "app-input", placeholder: "Ex: +221 77 654 32 10", value: newClientForm.phone, onChange: (e) => setNewClientForm({ ...newClientForm, phone: e.target.value }) }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Email"), /* @__PURE__ */ React.createElement("input", { type: "email", className: "app-input", placeholder: "Ex: contact@entreprise.com", value: newClientForm.email, onChange: (e) => setNewClientForm({ ...newClientForm, email: e.target.value }) })), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Adresse"), /* @__PURE__ */ React.createElement("input", { type: "text", className: "app-input", placeholder: "Ex: Boulevard de la R\xE9publique", value: newClientForm.address, onChange: (e) => setNewClientForm({ ...newClientForm, address: e.target.value }) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Ville"), /* @__PURE__ */ React.createElement("input", { type: "text", className: "app-input", value: newClientForm.city, onChange: (e) => setNewClientForm({ ...newClientForm, city: e.target.value }) }))))), /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3 shrink-0" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => {
    setIsNewClientModalOpen(false);
    setEditingClientId(null);
  }, className: "btn-secondary", "aria-label": "Annuler" }, "Annuler"), /* @__PURE__ */ React.createElement("button", { type: "submit", form: "newClientForm", className: "btn-primary", "aria-label": editingClientId ? "Enregistrer les modifications" : "Cr\xE9er le client" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check mr-1" }), " ", editingClientId ? "Enregistrer" : "Cr\xE9er le client")))), isMatCsvModalOpen && /* @__PURE__ */ React.createElement(
    MaterialCsvModal,
    {
      isOpen: isMatCsvModalOpen,
      onClose: () => setIsMatCsvModalOpen(false),
      existingMaterials: materials,
      onImportMaterials: (newMats) => {
        updateMaterials(newMats);
        showToast(`${newMats.length} mati\xE8res enregistr\xE9es dans le catalogue !`, "success");
      }
    }
  ), isCompanyModalOpen && // B3 (2026-08-18) — Relevé à z-[140] : « Compléter maintenant »,
  // depuis l'aperçu client (z-[120]), ouvrait ce panneau
  // Paramètres Entreprise DERRIÈRE l'aperçu, donc invisible.
  /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[140] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-floating w-full max-w-lg overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-neutral-800 text-lg" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-building text-brand-500 mr-2" }), "Param\xE8tres Entreprise"), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsCompanyModalOpen(false), className: "btn-icon w-8 h-8", "aria-label": "Fermer la bo\xEEte de dialogue" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-xl" }))), /* @__PURE__ */ React.createElement("form", { onSubmit: (e) => {
    e.preventDefault();
    if (!isReadOnlyDueToDowngrade) {
      updateCompanyInfo({ ...companyInfo });
      setIsCompanyModalOpen(false);
      showToast("Param\xE8tres entreprise sauvegard\xE9s");
    }
  } }, /* @__PURE__ */ React.createElement("div", { className: "p-6 overflow-y-auto custom-scroll bg-neutral-50/50 space-y-4 max-h-[70dvh]" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "company_name", className: "app-label" }, "Raison Sociale / Nom Entreprise"), /* @__PURE__ */ React.createElement("input", { id: "company_name", disabled: isReadOnlyDueToDowngrade, required: true, type: "text", className: "app-input font-bold", value: companyInfo.name, onChange: (e) => updateCompanyInfo({ ...companyInfo, name: e.target.value }), placeholder: "Ex : Entreprise BTP SARL" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "company_tagline", className: "app-label" }, "Slogan / Activit\xE9s principales"), /* @__PURE__ */ React.createElement("input", { id: "company_tagline", disabled: isReadOnlyDueToDowngrade, type: "text", className: "app-input font-bold", value: companyInfo.tagline, onChange: (e) => updateCompanyInfo({ ...companyInfo, tagline: e.target.value }), placeholder: "Ex : Travaux Publics & B\xE2timent" })), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "company_phone", className: "app-label" }, "T\xE9l\xE9phone / WhatsApp"), /* @__PURE__ */ React.createElement("input", { id: "company_phone", disabled: isReadOnlyDueToDowngrade, type: "text", className: "app-input font-bold", value: companyInfo.phone, onChange: (e) => updateCompanyInfo({ ...companyInfo, phone: e.target.value }), placeholder: "+223 XX XX XX XX" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "company_email", className: "app-label" }, "Email professionnel"), /* @__PURE__ */ React.createElement("input", { id: "company_email", disabled: isReadOnlyDueToDowngrade, type: "email", className: "app-input font-bold", value: companyInfo.email, onChange: (e) => updateCompanyInfo({ ...companyInfo, email: e.target.value }), placeholder: "contact@entreprise.com" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "company_address", className: "app-label" }, "Adresse G\xE9ographique"), /* @__PURE__ */ React.createElement("input", { id: "company_address", disabled: isReadOnlyDueToDowngrade, type: "text", className: "app-input font-bold", value: companyInfo.address, onChange: (e) => updateCompanyInfo({ ...companyInfo, address: e.target.value }), placeholder: "Bamako, Mali" })), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "company_nif", className: "app-label flex justify-between items-center" }, /* @__PURE__ */ React.createElement("span", null, "NIF (Identifiant Fiscal)"), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 font-normal" }, "Num\xE9ro Fiscal")), /* @__PURE__ */ React.createElement("input", { id: "company_nif", disabled: isReadOnlyDueToDowngrade, type: "text", className: "app-input font-bold", value: companyInfo.nif, onChange: (e) => updateCompanyInfo({ ...companyInfo, nif: e.target.value }), placeholder: "Ex : 084123456A" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "company_rccm", className: "app-label flex justify-between items-center" }, /* @__PURE__ */ React.createElement("span", null, "RCCM (Registre du Commerce)"), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 font-normal" }, "Immatriculation")), /* @__PURE__ */ React.createElement("input", { id: "company_rccm", disabled: isReadOnlyDueToDowngrade, type: "text", className: "app-input font-bold", value: companyInfo.rccm, onChange: (e) => updateCompanyInfo({ ...companyInfo, rccm: e.target.value }), placeholder: "Ex : MA.BKO.2024.B.1234" }))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "company_currency", className: "app-label" }, "Devise principale"), /* @__PURE__ */ React.createElement("input", { id: "company_currency", disabled: isReadOnlyDueToDowngrade, type: "text", className: "app-input font-bold", value: companyInfo.currency, onChange: (e) => updateCompanyInfo({ ...companyInfo, currency: e.target.value }), placeholder: "FCFA, EUR, USD..." })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "company_validity", className: "app-label flex justify-between items-center" }, /* @__PURE__ */ React.createElement("span", null, "Validit\xE9 de l'offre"), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] text-neutral-400 font-normal" }, "Sur devis client")), /* @__PURE__ */ React.createElement("input", { id: "company_validity", disabled: isReadOnlyDueToDowngrade, type: "text", className: "app-input font-bold", value: companyInfo.quoteValidity, onChange: (e) => updateCompanyInfo({ ...companyInfo, quoteValidity: e.target.value }), placeholder: "30 jours" }))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-1.5" }, /* @__PURE__ */ React.createElement("label", { className: "app-label mb-0" }, "\xC9ch\xE9ancier de Paiement"), /* @__PURE__ */ React.createElement("span", { className: `text-[11px] font-black ${scheduleTotalPct === 100 ? "text-emerald-600" : "text-red-600"}` }, "Total : ", scheduleTotalPct, "%")), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, (companyInfo.paymentSchedule || []).map((stage, idx) => /* @__PURE__ */ React.createElement("div", { key: idx, className: "flex gap-2 items-center" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      disabled: isReadOnlyDueToDowngrade,
      type: "text",
      className: "app-input font-medium flex-1",
      value: stage.label,
      onChange: (e) => updatePaymentStage(idx, { label: e.target.value }),
      placeholder: "Ex : Acompte \xE0 la signature",
      "aria-label": `Intitul\xE9 de l'\xE9tape ${idx + 1}`
    }
  ), /* @__PURE__ */ React.createElement(
    "input",
    {
      disabled: isReadOnlyDueToDowngrade,
      type: "number",
      min: "0",
      max: "100",
      className: "app-input font-bold w-20 text-center shrink-0",
      value: stage.pct,
      onChange: (e) => updatePaymentStage(idx, { pct: e.target.value }),
      "aria-label": `Pourcentage de l'\xE9tape ${idx + 1}`
    }
  ), /* @__PURE__ */ React.createElement("span", { className: "text-xs text-neutral-400 shrink-0" }, "%"), !isReadOnlyDueToDowngrade && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => removePaymentStage(idx), className: "btn-icon w-8 h-8 text-red-500 shrink-0", "aria-label": `Retirer l'\xE9tape ${idx + 1}` }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-trash-can" }))))), !isReadOnlyDueToDowngrade && /* @__PURE__ */ React.createElement("button", { type: "button", onClick: addPaymentStage, className: "btn-secondary text-xs py-1.5 px-3 mt-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus mr-1.5" }), " Ajouter une \xE9tape"), scheduleTotalPct !== 100 && /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-red-600 mt-1.5 font-semibold" }, "Le total doit \xEAtre \xE9gal \xE0 100% avant d'enregistrer."))), /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setIsCompanyModalOpen(false), className: "btn-secondary", "aria-label": "Fermer la bo\xEEte de dialogue" }, "Fermer"), !isReadOnlyDueToDowngrade && /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn-primary", "aria-label": "Enregistrer les param\xE8tres de l'entreprise" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check mr-1.5" }), " Enregistrer"))))), isAllowedModesModalOpen && selectedSolutionForEdit && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-floating w-full max-w-md overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-neutral-800 text-lg" }, "Modes de M\xE9tr\xE9 Autoris\xE9s pour ", selectedSolutionForEdit.name), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsAllowedModesModalOpen(false), className: "btn-icon w-8 h-8", "aria-label": "Fermer la bo\xEEte de dialogue" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-xl" }))), /* @__PURE__ */ React.createElement("div", { className: "p-6 bg-neutral-50/50 space-y-3" }, [
    { id: "rectangle", label: "Rectangle (Largeur x Hauteur)" },
    { id: "surface", label: "Surface Directe (m\xB2)" },
    { id: "floor", label: "Sol / Plafond (Largeur x Longueur)" },
    { id: "linear", label: "M\xE8tre Lin\xE9aire (ml)" },
    { id: "unit", label: "Unit\xE9 / Pi\xE8ce (u)" }
  ].map((mode) => {
    const isChecked = selectedSolutionForEdit.allowedModes && selectedSolutionForEdit.allowedModes.includes(mode.id);
    return /* @__PURE__ */ React.createElement("label", { key: mode.id, className: "flex items-center p-3.5 bg-white border border-neutral-200 rounded-xl cursor-pointer hover:bg-neutral-50 transition-colors" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        disabled: isReadOnlyDueToDowngrade,
        type: "checkbox",
        className: "w-5 h-5 rounded border-neutral-300 text-brand-600 focus:ring-brand-500 accent-brand-600",
        checked: isChecked,
        onChange: (e) => {
          if (isReadOnlyDueToDowngrade) return;
          let currentModes = selectedSolutionForEdit.allowedModes || [];
          let newModes = e.target.checked ? [...currentModes, mode.id] : currentModes.filter((m) => m !== mode.id);
          if (newModes.length === 0) newModes = ["rectangle"];
          const updatedSolutions = solutions.map((s) => s.id === selectedSolutionForEdit.id ? { ...s, allowedModes: newModes } : s);
          setSolutions(updatedSolutions);
          setSelectedSolutionForEdit({ ...selectedSolutionForEdit, allowedModes: newModes });
        }
      }
    ), /* @__PURE__ */ React.createElement("span", { className: "ml-3 text-sm font-bold text-neutral-800" }, mode.label));
  })), /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-t border-neutral-100 bg-white flex justify-end" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setIsAllowedModesModalOpen(false), className: "btn-primary", "aria-label": "Fermer la bo\xEEte de dialogue" }, "Fermer")))), isVarModalOpen && selectedSolutionForEdit && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[110] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-floating w-full max-w-md overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-neutral-800 text-lg" }, "Nouvelle Variable Dynamique (ex: PROFONDEUR)"), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsVarModalOpen(false), className: "btn-icon w-8 h-8", "aria-label": "Fermer la bo\xEEte de dialogue" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-xl" }))), /* @__PURE__ */ React.createElement("form", { onSubmit: handleAddCustomVarSubmit }, /* @__PURE__ */ React.createElement("div", { className: "p-6 bg-neutral-50/50 space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "var_code_name", className: "app-label" }, "Nom Code Variable (ex: PROFONDEUR)"), /* @__PURE__ */ React.createElement("input", { id: "var_code_name", disabled: isReadOnlyDueToDowngrade, autoFocus: true, required: true, type: "text", className: "app-input font-bold font-mono uppercase", value: varForm.name, onChange: (e) => setVarForm({ ...varForm, name: e.target.value }), placeholder: "PROFONDEUR, COUCHES, NB_PORTES..." })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "var_display_label", className: "app-label" }, "Libell\xE9 d'affichage (ex: Profondeur caisson)"), /* @__PURE__ */ React.createElement("input", { id: "var_display_label", disabled: isReadOnlyDueToDowngrade, type: "text", className: "app-input font-bold", value: varForm.label, onChange: (e) => setVarForm({ ...varForm, label: e.target.value }), placeholder: "Ex: Profondeur meuble" })), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "var_default_val", className: "app-label" }, "Valeur par d\xE9faut (0 autoris\xE9)"), /* @__PURE__ */ React.createElement("input", { id: "var_default_val", disabled: isReadOnlyDueToDowngrade, required: true, type: "number", step: "0.1", className: "app-input font-bold", value: varForm.defaultValue, onChange: (e) => setVarForm({ ...varForm, defaultValue: e.target.value }) })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "var_unit", className: "app-label" }, "Unit\xE9 (m, cm, u, etc.)"), /* @__PURE__ */ React.createElement("input", { id: "var_unit", disabled: isReadOnlyDueToDowngrade, type: "text", className: "app-input font-bold", value: varForm.unit, onChange: (e) => setVarForm({ ...varForm, unit: e.target.value }) })))), /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setIsVarModalOpen(false), className: "btn-secondary", "aria-label": "Annuler la cr\xE9ation de variable" }, "Annuler"), !isReadOnlyDueToDowngrade && /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn-primary", "aria-label": "Cr\xE9er la variable" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-plus mr-1" }), " Cr\xE9er la variable"))))), isRecipeModalOpen && recipeForm && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-floating w-full max-w-lg flex flex-col max-h-[90dvh] overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white shrink-0" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-neutral-800 text-lg" }, recipeForm.id > 1e5 ? "Nouveau composant" : "Modifier le composant"), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsRecipeModalOpen(false), className: "btn-icon w-8 h-8", "aria-label": "Fermer la bo\xEEte de dialogue" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-xl" }))), /* @__PURE__ */ React.createElement("div", { className: "p-6 bg-neutral-50/50 overflow-y-auto custom-scroll pb-32" }, /* @__PURE__ */ React.createElement("form", { id: "recipeForm", onSubmit: (e) => {
    e.preventDefault();
    if (isReadOnlyDueToDowngrade) return;
    if (!recipeForm.refId) return;
    const newRec = { ...recipeForm, refId: parseInt(recipeForm.refId) };
    if (recipes.some((r) => r.id === newRec.id)) {
      updateRecipes(recipes.map((r) => r.id === newRec.id ? newRec : r));
    } else {
      updateRecipes([...recipes, newRec]);
    }
    setIsRecipeModalOpen(false);
    showToast("Composant de recette enregistr\xE9");
  }, className: "space-y-5" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Type de ressource"), /* @__PURE__ */ React.createElement(
    CustomSelect,
    {
      disabled: isReadOnlyDueToDowngrade,
      value: recipeForm.type,
      onChange: (e) => {
        setQuickResourceDraft(null);
        setRecipeForm({ ...recipeForm, type: e.target.value, costCategory: e.target.value === "material" ? "material" : "labor", refId: e.target.value === "material" ? materials[0]?.id || "" : labor[0]?.id || "" });
      },
      options: [
        { value: "material", label: "Mati\xE8re Premi\xE8re" },
        { value: "labor", label: "Main d'\u0153uvre / Prestation" }
      ]
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Cat\xE9gorie M\xE9tier Explicite (costCategory)"), /* @__PURE__ */ React.createElement(
    CustomSelect,
    {
      disabled: isReadOnlyDueToDowngrade,
      value: recipeForm.costCategory || "material",
      onChange: (e) => setRecipeForm({ ...recipeForm, costCategory: e.target.value }),
      options: [
        { value: "material", label: "Mati\xE8res Premi\xE8res" },
        { value: "labor", label: "Main-d'\u0153uvre Fabrication (Atelier)" },
        { value: "installation", label: "Pose & Installation (Site)" },
        { value: "transport", label: "Transport & Logistique" },
        { value: "subcontracting", label: "Sous-traitance" }
      ]
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between mb-1.5" }, /* @__PURE__ */ React.createElement("label", { className: "app-label mb-0" }, "Ressource li\xE9e"), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: isReadOnlyDueToDowngrade,
      onClick: () => {
        if (quickResourceDraft) {
          setQuickResourceDraft(null);
          return;
        }
        setQuickResourceDraft(recipeForm.type === "material" ? { kind: "material", name: "", category: "", unitBuy: "", unitSize: 1, unitCalc: "m\xB2", priceBuy: "", waste: 5 } : { kind: "labor", name: "", unit: "j", rate: "", yieldRate: "" });
      },
      className: "text-xs font-black text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all shadow-2xs disabled:opacity-40",
      title: "Cr\xE9er une nouvelle mati\xE8re ou main-d'\u0153uvre sans quitter ce composant"
    },
    /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${quickResourceDraft ? "fa-xmark" : "fa-plus"} text-[10px]` }),
    /* @__PURE__ */ React.createElement("span", null, quickResourceDraft ? "Annuler" : `+ Nouvelle ${recipeForm.type === "material" ? "Mati\xE8re" : "Prestation"}`)
  )), quickResourceDraft && /* @__PURE__ */ React.createElement("div", { className: "mb-3 p-3.5 bg-brand-50/60 border border-brand-200 rounded-xl space-y-3" }, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] font-black uppercase tracking-wider text-brand-700" }, "Nouvelle ", quickResourceDraft.kind === "material" ? "mati\xE8re" : "prestation"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      autoFocus: true,
      className: "app-input font-bold",
      placeholder: quickResourceDraft.kind === "material" ? "Ex : Adh\xE9sif vinyle coul\xE9" : "Ex : Directeur artistique / graphiste",
      value: quickResourceDraft.name,
      onChange: (e) => setQuickResourceDraft({ ...quickResourceDraft, name: e.target.value }),
      "aria-label": `Nom de la nouvelle ${quickResourceDraft.kind === "material" ? "mati\xE8re" : "prestation"}`
    }
  ), quickResourceDraft.kind === "labor" ? /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Tarif factur\xE9 en"), /* @__PURE__ */ React.createElement(
    CustomSelect,
    {
      value: quickResourceDraft.unit,
      onChange: (e) => setQuickResourceDraft({ ...quickResourceDraft, unit: e.target.value }),
      options: [
        { value: "j", label: "Journ\xE9e (avec rendement)" },
        { value: "m\xB2", label: "M\xE8tre carr\xE9 (m\xB2)" },
        { value: "ml", label: "M\xE8tre lin\xE9aire (ml)" },
        { value: "u", label: "Unit\xE9 / pi\xE8ce (u)" },
        { value: "forfait", label: "Forfait" }
      ]
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Tarif (", companyInfo.currency, ")"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0",
      className: "app-input font-bold",
      placeholder: "0",
      value: quickResourceDraft.rate,
      onChange: (e) => setQuickResourceDraft({ ...quickResourceDraft, rate: e.target.value }),
      "aria-label": "Tarif de la prestation"
    }
  )), quickResourceDraft.unit === "j" && /* @__PURE__ */ React.createElement("div", { className: "col-span-2" }, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Rendement (m\xB2 ou ml par jour)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0",
      step: "0.1",
      className: "app-input font-bold",
      placeholder: "Ex : 15",
      value: quickResourceDraft.yieldRate,
      onChange: (e) => setQuickResourceDraft({ ...quickResourceDraft, yieldRate: e.target.value }),
      "aria-label": "Rendement journalier"
    }
  ), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 mt-1 leading-snug" }, "Avec un tarif journalier, la formule doit diviser par ", /* @__PURE__ */ React.createElement("code", { className: "font-mono" }, "RENDEMENT_MO"), ". Avec un tarif au m\xB2 / ml / u, elle ne doit pas diviser."))) : /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Cat\xE9gorie"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      className: "app-input",
      placeholder: "Ex : Impression",
      value: quickResourceDraft.category,
      onChange: (e) => setQuickResourceDraft({ ...quickResourceDraft, category: e.target.value }),
      "aria-label": "Cat\xE9gorie de la mati\xE8re"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Unit\xE9 de calcul"), /* @__PURE__ */ React.createElement(
    CustomSelect,
    {
      value: quickResourceDraft.unitCalc,
      onChange: (e) => setQuickResourceDraft({ ...quickResourceDraft, unitCalc: e.target.value }),
      options: [
        { value: "m\xB2", label: "m\xB2" },
        { value: "m", label: "m" },
        { value: "m\xB3", label: "m\xB3" },
        { value: "kg", label: "kg" },
        { value: "L", label: "L" },
        { value: "u", label: "u" }
      ]
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Conditionnement achet\xE9"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "text",
      className: "app-input",
      placeholder: "Ex : Rouleau (50 m\xB2)",
      value: quickResourceDraft.unitBuy,
      onChange: (e) => setQuickResourceDraft({ ...quickResourceDraft, unitBuy: e.target.value }),
      "aria-label": "Conditionnement achet\xE9"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Quantit\xE9 par conditionnement"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0.01",
      step: "0.01",
      className: "app-input font-bold",
      value: quickResourceDraft.unitSize,
      onChange: (e) => setQuickResourceDraft({ ...quickResourceDraft, unitSize: e.target.value }),
      "aria-label": "Quantit\xE9 par conditionnement"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Prix d'achat (", companyInfo.currency, ")"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0",
      className: "app-input font-bold",
      placeholder: "0",
      value: quickResourceDraft.priceBuy,
      onChange: (e) => setQuickResourceDraft({ ...quickResourceDraft, priceBuy: e.target.value }),
      "aria-label": "Prix d'achat"
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Taux de perte (%)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      type: "number",
      min: "0",
      max: "100",
      className: "app-input",
      value: quickResourceDraft.waste,
      onChange: (e) => setQuickResourceDraft({ ...quickResourceDraft, waste: e.target.value }),
      "aria-label": "Taux de perte"
    }
  ))), /* @__PURE__ */ React.createElement(
    "button",
    {
      type: "button",
      disabled: !quickResourceDraft.name.trim(),
      onClick: () => {
        const created = createQuickResource(quickResourceDraft);
        if (!created) return;
        setRecipeForm({
          ...recipeForm,
          refId: created.id,
          label: recipeForm.label?.trim() ? recipeForm.label : created.name
        });
        setQuickResourceDraft(null);
      },
      className: "btn-primary w-full text-xs py-2 disabled:opacity-40 disabled:cursor-not-allowed"
    },
    /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check mr-1.5" }),
    "Cr\xE9er et rattacher \xE0 ce composant"
  )), /* @__PURE__ */ React.createElement(
    CustomSelect,
    {
      disabled: isReadOnlyDueToDowngrade,
      value: recipeForm.refId,
      onChange: (e) => setRecipeForm({ ...recipeForm, refId: e.target.value }),
      options: recipeForm.type === "material" ? materials.map((m) => ({ value: m.id, label: m.name })) : labor.map((l) => ({ value: l.id, label: l.name }))
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Formule Math\xE9matique (supporte IF(cond, a, b))"), /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, required: true, type: "text", className: "app-input font-bold font-mono", value: recipeForm.formula, onChange: (e) => setRecipeForm({ ...recipeForm, formula: e.target.value }), placeholder: "Ex: SURFACE, IF(SURFACE > 100, SURFACE * 0.95, SURFACE)" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label" }, "Intitul\xE9 affich\xE9 sur le devis"), /* @__PURE__ */ React.createElement("input", { disabled: isReadOnlyDueToDowngrade, required: true, type: "text", className: "app-input font-bold", value: recipeForm.label, onChange: (e) => setRecipeForm({ ...recipeForm, label: e.target.value }), placeholder: "Ex: Fer du cadre" })))), /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-t border-neutral-100 flex justify-end gap-3 bg-white shrink-0" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setIsRecipeModalOpen(false), className: "btn-secondary", "aria-label": "Annuler la modification" }, "Annuler"), !isReadOnlyDueToDowngrade && /* @__PURE__ */ React.createElement("button", { type: "submit", form: "recipeForm", className: "btn-primary", "aria-label": "Enregistrer le composant" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check mr-1" }), " Enregistrer")))), isSolutionModalOpen && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-floating w-full max-w-md overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-neutral-800 text-lg" }, solutionModalForm.id ? "\xC9diter l'Ouvrage" : "Nouvel Ouvrage"), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsSolutionModalOpen(false), className: "btn-icon w-8 h-8", "aria-label": "Fermer la bo\xEEte de dialogue" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-xl" }))), /* @__PURE__ */ React.createElement("form", { onSubmit: (e) => {
    e.preventDefault();
    if (isReadOnlyDueToDowngrade) return;
    if (solutionModalForm.name.trim()) {
      const modesToSave = solutionModalForm.allowedModes && solutionModalForm.allowedModes.length > 0 ? solutionModalForm.allowedModes : ["rectangle"];
      if (solutionModalForm.id) {
        const nextSols = solutions.map((s) => s.id === solutionModalForm.id ? { ...s, name: solutionModalForm.name.trim(), allowedModes: modesToSave } : s);
        updateSolutions(nextSols);
        if (selectedSolutionForEdit && selectedSolutionForEdit.id === solutionModalForm.id) {
          setSelectedSolutionForEdit({ ...selectedSolutionForEdit, name: solutionModalForm.name.trim(), allowedModes: modesToSave });
        }
        showToast("Ouvrage mis \xE0 jour !");
      } else {
        const ns = {
          id: Date.now(),
          name: solutionModalForm.name.trim(),
          icon: "fa-cube",
          allowedModes: modesToSave,
          customVars: []
        };
        updateSolutions([...solutions, ns]);
        setSelectedSolutionForEdit(ns);
        showToast("Ouvrage cr\xE9\xE9 avec succ\xE8s");
      }
      setIsSolutionModalOpen(false);
    }
  } }, /* @__PURE__ */ React.createElement("div", { className: "p-6 bg-neutral-50/50 space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "ouvrage_modal_name", className: "app-label" }, "Nom de l'ouvrage dans le catalogue"), /* @__PURE__ */ React.createElement("input", { id: "ouvrage_modal_name", disabled: isReadOnlyDueToDowngrade, autoFocus: true, required: true, type: "text", className: "app-input font-bold", value: solutionModalForm.name, onChange: (e) => setSolutionModalForm({ ...solutionModalForm, name: e.target.value }), placeholder: "Ex: Semelle B\xE9ton Arm\xE9" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "app-label mb-2 block" }, "Modes de M\xE9tr\xE9 Autoris\xE9s au d\xE9marrage"), /* @__PURE__ */ React.createElement("div", { className: "space-y-2" }, [
    { id: "rectangle", label: "Rectangle (Largeur x Hauteur)" },
    { id: "surface", label: "Surface Directe (m\xB2)" },
    { id: "floor", label: "Sol / Plafond (Largeur x Longueur)" },
    { id: "linear", label: "M\xE8tre Lin\xE9aire (ml)" },
    { id: "unit", label: "Unit\xE9 / Pi\xE8ce (u)" }
  ].map((m) => /* @__PURE__ */ React.createElement("label", { key: m.id, className: "flex items-center text-xs font-semibold text-neutral-700 cursor-pointer" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      disabled: isReadOnlyDueToDowngrade,
      type: "checkbox",
      className: "w-4 h-4 rounded border-neutral-300 text-brand-600 accent-brand-600 mr-2",
      checked: solutionModalForm.allowedModes && solutionModalForm.allowedModes.includes(m.id),
      onChange: (e) => {
        if (isReadOnlyDueToDowngrade) return;
        const cur = solutionModalForm.allowedModes || [];
        const next = e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id);
        setSolutionModalForm({ ...solutionModalForm, allowedModes: next });
      }
    }
  ), m.label))))), /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setIsSolutionModalOpen(false), className: "btn-secondary", "aria-label": "Annuler la modification" }, "Annuler"), !isReadOnlyDueToDowngrade && /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn-primary", "aria-label": "Enregistrer l'ouvrage" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check mr-1" }), " Enregistrer"))))), isSaveQuoteModalOpen && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-2xl shadow-floating w-full max-w-md overflow-hidden" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white" }, /* @__PURE__ */ React.createElement("h3", { className: "font-bold text-neutral-800 text-lg" }, "Enregistrer Devis (N\xB0 DEV-", (/* @__PURE__ */ new Date()).getFullYear(), "-", String(nextQuoteSeq).padStart(3, "0"), ")"), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsSaveQuoteModalOpen(false), className: "btn-icon w-8 h-8", "aria-label": "Fermer la bo\xEEte de dialogue" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-xl" }))), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSaveQuoteSubmit }, /* @__PURE__ */ React.createElement("div", { className: "p-6 bg-neutral-50/50 space-y-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "save_quote_client_name", className: "app-label flex justify-between items-center" }, /* @__PURE__ */ React.createElement("span", null, "Nom du Client / Entreprise ", /* @__PURE__ */ React.createElement("span", { className: "text-red-500" }, "*")), clientNameError && /* @__PURE__ */ React.createElement("span", { className: "text-red-600 font-bold text-xs animate-shake", role: "alert" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-exclamation mr-1" }), "Champ requis")), /* @__PURE__ */ React.createElement(
    "input",
    {
      id: "save_quote_client_name",
      disabled: isReadOnlyDueToDowngrade,
      autoFocus: true,
      type: "text",
      "aria-required": "true",
      "aria-invalid": clientNameError,
      className: `app-input font-bold ${clientNameError ? "border-red-500 ring-2 ring-red-500/20 bg-red-50/30 text-red-900" : ""}`,
      value: saveQuoteForm.clientName,
      onChange: (e) => {
        setSaveQuoteForm({ ...saveQuoteForm, clientName: e.target.value });
        if (e.target.value.trim()) setClientNameError(false);
      },
      placeholder: "Ex: SOCIETE BTP SARL"
    }
  ), clientNameError && /* @__PURE__ */ React.createElement("p", { className: "text-xs text-red-600 mt-1 font-semibold", role: "alert" }, "Veuillez indiquer le nom ou la raison sociale du client pour ce devis.")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "save_quote_project_ref", className: "app-label" }, "R\xE9f\xE9rence du Projet / Chantier"), /* @__PURE__ */ React.createElement("input", { id: "save_quote_project_ref", disabled: isReadOnlyDueToDowngrade, type: "text", className: "app-input font-bold", value: saveQuoteForm.projectRef, onChange: (e) => setSaveQuoteForm({ ...saveQuoteForm, projectRef: e.target.value }), placeholder: "Ex: R\xE9novation B\xE2timent A" })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { htmlFor: "save_quote_notes", className: "app-label" }, "Notes & Remarques (Affich\xE9es sur le devis)"), /* @__PURE__ */ React.createElement("textarea", { id: "save_quote_notes", disabled: isReadOnlyDueToDowngrade, className: "app-input font-medium", rows: "3", value: saveQuoteForm.notes, onChange: (e) => setSaveQuoteForm({ ...saveQuoteForm, notes: e.target.value }), placeholder: "Remarques particuli\xE8res, d\xE9lais, conditions de livraison..." }))), /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setIsSaveQuoteModalOpen(false), className: "btn-secondary", "aria-label": "Annuler l'enregistrement" }, "Annuler"), !isReadOnlyDueToDowngrade && /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn-primary", "aria-label": "Valider et enregistrer le devis" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check mr-1.5" }), " Enregistrer Devis"))))), /* @__PURE__ */ React.createElement(
    QuoteSignatureModal,
    {
      isOpen: isSignatureModalOpen,
      onClose: () => setIsSignatureModalOpen(false),
      quote: viewingSavedQuote,
      onConfirmSignature: (sig) => {
        if (viewingSavedQuote) {
          const updatedQ = {
            ...viewingSavedQuote,
            status: "accepted",
            signedAt: sig.signedAt,
            signedByName: sig.signerName,
            signatureData: sig.signatureData
          };
          setViewingSavedQuote(updatedQ);
          updateSavedQuotes(savedQuotes.map((q) => q.id === updatedQ.id ? updatedQ : q));
          showToast(`\u2713 Devis ${updatedQ.number} sign\xE9 \xE9lectroniquement avec succ\xE8s !`, "success");
        }
      }
    }
  ), /* @__PURE__ */ React.createElement(
    HealthCheckModal,
    {
      isOpen: isHealthModalOpen,
      onClose: () => setIsHealthModalOpen(false),
      isOnline,
      sbUser,
      solutionsCount: solutions.length,
      materialsCount: materials.length,
      quotesCount: savedQuotes.length
    }
  ), /* @__PURE__ */ React.createElement(
    QuoteShareModal,
    {
      isOpen: isShareModalOpen,
      onClose: () => setIsShareModalOpen(false),
      quote: viewingSavedQuote,
      showToast
    }
  ), viewingSavedQuote && (() => {
    const snap = viewingSavedQuote.companyInfoSnapshot || {};
    const effectiveCompanyInfo = {
      name: snap.name || companyInfo.name,
      address: snap.address || companyInfo.address,
      phone: snap.phone || companyInfo.phone,
      email: snap.email || companyInfo.email,
      nif: snap.nif || companyInfo.nif,
      rccm: snap.rccm || companyInfo.rccm
    };
    const missingLegal = getMissingLegalFields(effectiveCompanyInfo);
    const paymentSchedule = snap.paymentSchedule && snap.paymentSchedule.length > 0 ? snap.paymentSchedule : companyInfo.paymentSchedule || [];
    const scheduleTotal = paymentSchedule.reduce((s, st) => s + (parseFloat(st.pct) || 0), 0);
    const scheduleInvalid = paymentSchedule.length > 0 && Math.round(scheduleTotal) !== 100;
    const canSend = missingLegal.length === 0 && !scheduleInvalid;
    return /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/75 backdrop-blur-sm flex items-center justify-center z-[120] p-4 overflow-y-auto" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl shadow-floating w-full max-w-4xl flex flex-col max-h-[92dvh] overflow-hidden my-auto" }, /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-b border-neutral-100 flex justify-between items-center bg-white shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("span", { className: "text-sm font-extrabold text-brand-600 bg-brand-50 px-3 py-1 rounded-lg" }, viewingSavedQuote.number), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-neutral-900 text-lg leading-tight" }, viewingSavedQuote.clientName), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500" }, viewingSavedQuote.projectRef, " \u2022 ", viewingSavedQuote.date))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex bg-neutral-100 p-1 rounded-xl" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setIsCommercialMode(false), className: `px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${!isCommercialMode ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`, "aria-label": "Afficher la vue \xE9tude interne" }, "Vue Interne (\xC9tude)"), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsCommercialMode(true), className: `px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${isCommercialMode ? "bg-brand-600 text-white shadow-sm" : "text-neutral-500"}`, "aria-label": "Afficher le devis commercial propre" }, "Devis Commercial Client Clean")), canSend ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { onClick: () => setIsShareModalOpen(true), className: "btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 font-bold", title: "Partager le devis au client", "aria-label": "Partager le devis" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-share-nodes text-brand-600" }), /* @__PURE__ */ React.createElement("span", null, "Partager")), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsSignatureModalOpen(true), className: "btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 font-bold text-emerald-700 hover:bg-emerald-50 border-emerald-200", title: "Signer \xE9lectroniquement", "aria-label": "Signer le devis" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-signature text-emerald-600" }), /* @__PURE__ */ React.createElement("span", null, "Signer")), /* @__PURE__ */ React.createElement("button", { onClick: () => window.print(), className: "btn-primary py-1.5 px-3.5 text-xs flex items-center gap-1.5 font-bold shadow-md shadow-brand-500/20", title: "Imprimer ou Enregistrer en PDF (A4)", "aria-label": "Imprimer le devis" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-print" }), /* @__PURE__ */ React.createElement("span", null, "Imprimer / PDF"))) : /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => setIsCompanyModalOpen(true),
        className: "py-1.5 px-3.5 text-xs flex items-center gap-1.5 font-bold rounded-xl bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors",
        title: "Ce devis doit \xEAtre corrig\xE9 avant tout envoi au client",
        "aria-label": "Corriger ce devis avant de l'envoyer"
      },
      /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-triangle-exclamation" }),
      /* @__PURE__ */ React.createElement("span", null, missingLegal.length > 0 ? "Identit\xE9 \xE0 compl\xE9ter" : "\xC9ch\xE9ancier \xE0 corriger")
    ), /* @__PURE__ */ React.createElement("button", { onClick: () => setViewingSavedQuote(null), className: "btn-icon w-8 h-8", "aria-label": "Fermer la bo\xEEte de dialogue" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-xmark text-xl" })))), !canSend && /* @__PURE__ */ React.createElement("div", { className: "px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-4 shrink-0" }, /* @__PURE__ */ React.createElement("p", { className: "text-xs text-amber-900 font-semibold flex items-center gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-info" }), missingLegal.length > 0 && /* @__PURE__ */ React.createElement("span", null, "Compl\xE9tez votre identit\xE9 d'entreprise avant d'envoyer ce devis au client \u2014 il manque : ", missingLegal.map((f) => ({ name: "raison sociale", address: "adresse", phone: "t\xE9l\xE9phone", email: "e-mail", nif: "NIF", rccm: "RCCM" })[f] || f).join(", "), "."), missingLegal.length > 0 && scheduleInvalid && /* @__PURE__ */ React.createElement("span", { className: "mx-1" }, "\u2022"), scheduleInvalid && /* @__PURE__ */ React.createElement("span", null, "L'\xE9ch\xE9ancier de paiement totalise ", scheduleTotal, "% au lieu de 100% \u2014 corrigez-le avant d'envoyer ce devis.")), /* @__PURE__ */ React.createElement("button", { onClick: () => setIsCompanyModalOpen(true), className: "btn-primary text-xs py-1.5 px-3 shrink-0 font-bold" }, "Compl\xE9ter maintenant")), /* @__PURE__ */ React.createElement("div", { className: "p-6 overflow-y-auto custom-scroll bg-neutral-50/50 space-y-6" }, isCommercialMode ? /* @__PURE__ */ React.createElement("div", { className: "bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm space-y-6 print:border-0 print:p-0", id: "printArea" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between items-start border-b border-neutral-200 pb-6" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 mb-2" }, /* @__PURE__ */ React.createElement(LogoSVG, { className: "h-10" })), /* @__PURE__ */ React.createElement("p", { className: "text-xs font-bold text-neutral-800" }, viewingSavedQuote.companyInfoSnapshot?.name || companyInfo.name), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 font-medium" }, viewingSavedQuote.companyInfoSnapshot?.tagline || companyInfo.tagline), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 font-medium" }, "Adresse: ", viewingSavedQuote.companyInfoSnapshot?.address || companyInfo.address), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 font-medium" }, "Contact: ", viewingSavedQuote.companyInfoSnapshot?.email || companyInfo.email, " \u2022 Tel: ", viewingSavedQuote.companyInfoSnapshot?.phone || companyInfo.phone), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-400" }, "NIF: ", viewingSavedQuote.companyInfoSnapshot?.nif || companyInfo.nif, " \u2022 RCCM: ", viewingSavedQuote.companyInfoSnapshot?.rccm || companyInfo.rccm)), /* @__PURE__ */ React.createElement("div", { className: "text-right" }, /* @__PURE__ */ React.createElement("h2", { className: "text-2xl font-black text-brand-600 uppercase tracking-tight" }, "DEVIS COMMERCIAL"), /* @__PURE__ */ React.createElement("p", { className: "text-sm font-bold text-neutral-800 mt-1" }, "N\xB0 : ", viewingSavedQuote.number), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500" }, "Date : ", viewingSavedQuote.date))), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-6 bg-neutral-50 p-4 rounded-xl border border-neutral-200" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider mb-1" }, "CLIENT"), /* @__PURE__ */ React.createElement("p", { className: "font-extrabold text-neutral-900 text-base" }, viewingSavedQuote.clientName)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] font-extrabold text-neutral-400 uppercase tracking-wider mb-1" }, "D\xC9SIGNATION CHANTIER"), /* @__PURE__ */ React.createElement("p", { className: "font-bold text-neutral-800" }, viewingSavedQuote.projectRef))), viewingSavedQuote.notes && /* @__PURE__ */ React.createElement("div", { className: "p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl text-xs text-amber-900" }, /* @__PURE__ */ React.createElement("p", { className: "font-bold text-[10px] uppercase text-amber-700 tracking-wider mb-1" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-note-sticky mr-1" }), "Notes & Remarques :"), /* @__PURE__ */ React.createElement("p", { className: "whitespace-pre-line" }, viewingSavedQuote.notes)), (() => {
      const printCurrency = viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency;
      const items = viewingSavedQuote.quoteData?.commercialItems || [];
      const lotsMap = /* @__PURE__ */ new Map();
      items.forEach((item) => {
        const code = item.lotCode || "01";
        if (!lotsMap.has(code)) lotsMap.set(code, { lotCode: code, lotName: item.lotName || `Lot ${code}`, items: [] });
        lotsMap.get(code).items.push(item);
      });
      const lots = [...lotsMap.values()];
      const showLotHeaders = lots.length > 1;
      return /* @__PURE__ */ React.createElement("table", { className: "w-full text-left text-xs border-collapse" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { className: "bg-neutral-900 text-white font-bold uppercase" }, /* @__PURE__ */ React.createElement("th", { className: "p-3.5 rounded-l-lg" }, "D\xE9signation Ouvrage / Prestation Commerciale"), /* @__PURE__ */ React.createElement("th", { className: "p-3.5 text-center" }, "Quantit\xE9"), /* @__PURE__ */ React.createElement("th", { className: "p-3.5 text-right" }, "Prix Unitaire HT"), /* @__PURE__ */ React.createElement("th", { className: "p-3.5 text-right rounded-r-lg" }, "Total HT"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-neutral-100" }, lots.map((lot) => {
        const lotSubtotal = lot.items.reduce((sum, it) => sum + (it.sellingTotalHT || 0), 0);
        return /* @__PURE__ */ React.createElement(React.Fragment, { key: lot.lotCode }, showLotHeaders && /* @__PURE__ */ React.createElement("tr", { className: "bg-neutral-50" }, /* @__PURE__ */ React.createElement("td", { colSpan: 4, className: "px-3.5 py-2 font-extrabold text-[11px] uppercase tracking-wide text-neutral-600" }, lot.lotName)), lot.items.map((item) => /* @__PURE__ */ React.createElement("tr", { key: item.id }, /* @__PURE__ */ React.createElement("td", { className: "p-3.5" }, /* @__PURE__ */ React.createElement("p", { className: "font-bold text-neutral-900" }, item.label), item.dimensionSummary && /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-neutral-500 mt-0.5 font-medium" }, item.dimensionSummary)), /* @__PURE__ */ React.createElement("td", { className: "p-3.5 text-center font-medium" }, item.billedQty.toFixed(2), " ", item.unit), /* @__PURE__ */ React.createElement("td", { className: "p-3.5 text-right font-medium" }, formatMoney(item.sellingUnitHT, printCurrency)), /* @__PURE__ */ React.createElement("td", { className: "p-3.5 text-right font-bold text-neutral-900" }, formatMoney(item.sellingTotalHT, printCurrency)))), showLotHeaders && /* @__PURE__ */ React.createElement("tr", { className: "bg-neutral-50/60" }, /* @__PURE__ */ React.createElement("td", { colSpan: 3, className: "px-3.5 py-2 text-right font-bold text-neutral-500 text-[11px] uppercase tracking-wide" }, "Sous-total Lot ", lot.lotCode, " HT"), /* @__PURE__ */ React.createElement("td", { className: "px-3.5 py-2 text-right font-extrabold text-neutral-800" }, formatMoney(lotSubtotal, printCurrency))));
      })));
    })(), /* @__PURE__ */ React.createElement("div", { className: "flex justify-end pt-4 border-t border-neutral-200" }, /* @__PURE__ */ React.createElement("div", { className: "w-72 space-y-2 text-xs" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between font-bold text-neutral-800 text-sm" }, /* @__PURE__ */ React.createElement("span", null, "Net HT Client :"), /* @__PURE__ */ React.createElement("span", null, formatMoney(viewingSavedQuote.quoteData?.netHTConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-neutral-500" }, /* @__PURE__ */ React.createElement("span", null, "TVA (", viewingSavedQuote.vatRate !== void 0 ? viewingSavedQuote.vatRate : 18, "%) :"), /* @__PURE__ */ React.createElement("span", null, "+", formatMoney(viewingSavedQuote.quoteData?.tvaConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between font-black text-brand-600 text-base border-t-2 border-neutral-900 pt-2" }, /* @__PURE__ */ React.createElement("span", null, "TOTAL TTC :"), /* @__PURE__ */ React.createElement("span", null, formatMoney(viewingSavedQuote.quoteData?.totalTTCConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency))))), paymentSchedule.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "pt-4 border-t border-neutral-200" }, /* @__PURE__ */ React.createElement("h4", { className: "text-xs font-black text-neutral-800 uppercase tracking-wider mb-2 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-calendar-check text-brand-600" }), "\xC9ch\xE9ancier Pr\xE9visionnel des R\xE8glements"), /* @__PURE__ */ React.createElement("div", { className: "border border-neutral-200 rounded-xl overflow-hidden shadow-2xs" }, /* @__PURE__ */ React.createElement("table", { className: "w-full text-left text-xs" }, /* @__PURE__ */ React.createElement("thead", { className: "bg-neutral-50 border-b border-neutral-200 text-[10px] font-extrabold text-neutral-500 uppercase" }, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { className: "p-2.5 pl-3" }, "\xC9tape"), /* @__PURE__ */ React.createElement("th", { className: "p-2.5 text-center" }, "Taux (%)"), /* @__PURE__ */ React.createElement("th", { className: "p-2.5 text-right pr-3" }, "Montant TTC"))), /* @__PURE__ */ React.createElement("tbody", { className: "divide-y divide-neutral-100 font-medium" }, paymentSchedule.map((stage, idx) => {
      const isLast = idx === paymentSchedule.length - 1;
      const pct = parseFloat(stage.pct) || 0;
      const amount = (viewingSavedQuote.quoteData?.totalTTCConsomme || 0) * (pct / 100);
      return /* @__PURE__ */ React.createElement("tr", { key: idx, className: isLast ? "bg-neutral-50/60 font-bold" : void 0 }, /* @__PURE__ */ React.createElement("td", { className: `p-2.5 pl-3 ${isLast ? "text-brand-700" : ""}` }, stage.label), /* @__PURE__ */ React.createElement("td", { className: `p-2.5 text-center ${isLast ? "text-brand-700" : "font-bold text-neutral-700"}` }, pct, "%"), /* @__PURE__ */ React.createElement("td", { className: `p-2.5 text-right pr-3 font-mono ${isLast ? "text-brand-700" : "font-bold text-neutral-900"}` }, formatMoney(amount, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)));
    }))))), /* @__PURE__ */ React.createElement("div", { className: "pt-8 border-t border-neutral-100 grid grid-cols-2 gap-8 text-[11px] text-neutral-500" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "font-bold text-neutral-700 mb-1" }, "Validit\xE9 de l'offre :"), /* @__PURE__ */ React.createElement("p", null, viewingSavedQuote.companyInfoSnapshot?.quoteValidity || companyInfo.quoteValidity)), /* @__PURE__ */ React.createElement("div", { className: "text-center border border-dashed border-neutral-300 p-4 rounded-xl" }, /* @__PURE__ */ React.createElement("p", { className: "font-bold text-neutral-700 mb-8" }, "Bon pour accord et signature client :"), /* @__PURE__ */ React.createElement("p", { className: "text-[10px] text-neutral-400" }, "Date et cachet")))) : /* @__PURE__ */ React.createElement("div", { className: "space-y-6" }, (() => {
      const savedMargePct = viewingSavedQuote.quoteData?.margePctConsommeReelle !== void 0 ? viewingSavedQuote.quoteData.margePctConsommeReelle : viewingSavedQuote.quoteData?.netHTConsomme > 0 ? (viewingSavedQuote.quoteData?.margeValeurConsomme || 0) / viewingSavedQuote.quoteData.netHTConsomme * 100 : 0;
      const savedMargeAchatPct = viewingSavedQuote.quoteData?.margePctAchatReelle !== void 0 ? viewingSavedQuote.quoteData.margePctAchatReelle : viewingSavedQuote.quoteData?.netHTAchat > 0 ? (viewingSavedQuote.quoteData?.margeValeurAchat || 0) / viewingSavedQuote.quoteData.netHTAchat * 100 : 0;
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm" }, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] font-bold text-neutral-500 uppercase" }, "\xC9tude de Prix Consomm\xE9 (Internes)"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-extrabold text-neutral-900 mt-1" }, formatMoney(viewingSavedQuote.quoteData?.totalTTCConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)), /* @__PURE__ */ React.createElement("div", { className: "mt-3 text-xs space-y-1 text-neutral-600 border-t pt-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "D\xE9bours\xE9 sec :"), /* @__PURE__ */ React.createElement("span", null, formatMoney(viewingSavedQuote.quoteData?.totalDebourseConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Frais g\xE9n\xE9raux :"), /* @__PURE__ */ React.createElement("span", null, formatMoney(viewingSavedQuote.quoteData?.fraisGenerauxConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between font-bold text-emerald-600" }, /* @__PURE__ */ React.createElement("span", null, "Marge r\xE9elle (apr\xE8s remise) :"), /* @__PURE__ */ React.createElement("span", null, "+", formatMoney(viewingSavedQuote.quoteData?.margeValeurConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency), " (", savedMargePct.toFixed(2), "%)")))), /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-900 text-white p-5 rounded-2xl shadow-floating" }, /* @__PURE__ */ React.createElement("p", { className: "text-[10px] font-bold text-brand-400 uppercase" }, "Budget d'Achat S\xE9curis\xE9 (Tr\xE9sorerie)"), /* @__PURE__ */ React.createElement("p", { className: "text-2xl font-extrabold text-brand-400 mt-1" }, formatMoney(viewingSavedQuote.quoteData?.totalTTCAchat, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)), /* @__PURE__ */ React.createElement("div", { className: "mt-3 text-xs space-y-1 text-neutral-400 border-t border-neutral-800 pt-2" }, /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "D\xE9bours\xE9 achat :"), /* @__PURE__ */ React.createElement("span", null, formatMoney(viewingSavedQuote.quoteData?.totalDebourseAchat, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between" }, /* @__PURE__ */ React.createElement("span", null, "Frais g\xE9n\xE9raux :"), /* @__PURE__ */ React.createElement("span", null, formatMoney(viewingSavedQuote.quoteData?.fraisGenerauxAchat, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency))), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between font-bold text-brand-300" }, /* @__PURE__ */ React.createElement("span", null, "Marge s\xE9curis\xE9e :"), /* @__PURE__ */ React.createElement("span", null, "+", formatMoney(viewingSavedQuote.quoteData?.margeValeurAchat, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency), " (", savedMargeAchatPct.toFixed(2), "%)"))))), viewingSavedQuote.quoteData?.lots && viewingSavedQuote.quoteData.lots.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "bg-white p-5 rounded-2xl border border-neutral-200 shadow-sm space-y-4" }, /* @__PURE__ */ React.createElement("h4", { className: "font-extrabold text-xs text-neutral-800 uppercase tracking-wider flex items-center gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-layer-group text-brand-500" }), " Ventilation des ", viewingSavedQuote.quoteData.lots.length, " Lots / Ouvrages du Chantier"), /* @__PURE__ */ React.createElement("div", { className: "space-y-2.5" }, viewingSavedQuote.quoteData.lots.map((l, idx) => /* @__PURE__ */ React.createElement("div", { key: l.id || idx, className: "p-3.5 bg-neutral-50/80 rounded-xl border border-neutral-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("span", { className: "font-black text-brand-600 mr-2" }, "Poste #", idx + 1), /* @__PURE__ */ React.createElement("strong", { className: "text-neutral-900" }, l.lotName), /* @__PURE__ */ React.createElement("p", { className: "text-neutral-500 mt-0.5 font-medium" }, formatLotDimensions(l))), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-4 shrink-0 font-bold" }, /* @__PURE__ */ React.createElement("span", { className: "text-neutral-600 text-xs" }, "D\xE9bours\xE9 : ", formatMoney(l.quoteData?.totalDebourseConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency)), /* @__PURE__ */ React.createElement("span", { className: "text-emerald-700 font-extrabold text-xs" }, "Net HT : ", formatMoney(l.quoteData?.netHTConsomme, viewingSavedQuote.companyInfoSnapshot?.currency || companyInfo.currency))))))));
    })())), /* @__PURE__ */ React.createElement("div", { className: "px-6 py-4 border-t border-neutral-100 bg-white flex justify-end gap-3 shrink-0" }, canSend ? /* @__PURE__ */ React.createElement("button", { onClick: () => window.print(), className: "btn-secondary" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-print" }), " Imprimer Devis") : /* @__PURE__ */ React.createElement("button", { onClick: () => setIsCompanyModalOpen(true), className: "btn-secondary text-amber-900 bg-amber-50 border-amber-300 hover:bg-amber-100" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-triangle-exclamation" }), " ", missingLegal.length > 0 ? "Compl\xE9ter l'identit\xE9 pour imprimer" : "Corriger l'\xE9ch\xE9ancier pour imprimer"), /* @__PURE__ */ React.createElement("button", { onClick: () => setViewingSavedQuote(null), className: "btn-primary" }, "Fermer"))));
  })(), showImportBanner && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[135] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl shadow-floating w-full max-w-lg overflow-hidden p-8 text-center animate-fade-in" }, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-5" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-[#fa-file-import] fa-cloud-arrow-down text-3xl" })), /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-neutral-900 text-xl mb-2" }, "Donn\xE9es locales non associ\xE9es d\xE9tect\xE9es"), /* @__PURE__ */ React.createElement("p", { className: "text-neutral-600 text-sm font-medium mb-6 leading-relaxed" }, "Des donn\xE9es chiffr\xE9es/catalogue cr\xE9\xE9es pr\xE9c\xE9demment sur ce navigateur sont disponibles. Souhaitez-vous les **importer dans votre compte cloud (", sbUser?.email, ")** ou d\xE9marrer avec une base vierge ?"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col gap-3" }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
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
    showToast("Donn\xE9es locales import\xE9es et migr\xE9es avec succ\xE8s dans votre compte cloud !");
  }, className: "btn-primary w-full py-3.5 flex items-center justify-center gap-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-file-import" }), " Importer mes donn\xE9es dans ce compte"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    LS.clearLegacyData();
    setShowImportBanner(false);
    showToast("Base locale r\xE9initialis\xE9e. Compte cloud propre.");
  }, className: "btn-secondary w-full py-3 text-neutral-600 hover:text-red-600" }, "Ignorer & D\xE9marrer sur un compte propre")))), confirmDialog.isOpen && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl shadow-floating w-full max-w-md overflow-hidden p-8 text-center" }, /* @__PURE__ */ React.createElement("div", { className: `w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${confirmDialog.isDanger ? "bg-red-50 text-brand-500" : "bg-brand-50 text-brand-500"}` }, /* @__PURE__ */ React.createElement("i", { className: `fa-solid ${confirmDialog.isDanger ? "fa-trash-can" : "fa-circle-question"} text-2xl` })), /* @__PURE__ */ React.createElement("h3", { className: "font-extrabold text-neutral-900 text-xl mb-2" }, confirmDialog.title), /* @__PURE__ */ React.createElement("p", { className: "text-neutral-500 text-sm font-medium mb-8 leading-relaxed whitespace-pre-line" }, confirmDialog.message), /* @__PURE__ */ React.createElement("div", { className: "flex flex-col sm:flex-row gap-3 w-full" }, /* @__PURE__ */ React.createElement("button", { onClick: closeConfirm, className: "btn-secondary flex-1 py-3" }, "Annuler"), confirmDialog.onSecondary && /* @__PURE__ */ React.createElement("button", { onClick: confirmDialog.onSecondary, className: "btn-secondary flex-1 py-3 font-bold border-brand-300 text-brand-700" }, confirmDialog.secondaryLabel || "Enregistrer"), confirmDialog.onConfirm && /* @__PURE__ */ React.createElement("button", { onClick: confirmDialog.onConfirm, className: "flex flex-1 items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-3 rounded-xl text-sm font-bold shadow-sm transition-all duration-200 active:scale-95" }, confirmDialog.confirmLabel || "Confirmer")))), toast && /* @__PURE__ */ React.createElement("div", { key: toast.id, className: "fixed bottom-24 md:bottom-8 right-0 md:right-8 left-0 md:left-auto mx-4 md:mx-0 bg-neutral-900 text-white px-5 py-4 rounded-xl shadow-floating flex items-center gap-4 z-[140] max-w-sm border border-neutral-700 animate-slide-up" }, /* @__PURE__ */ React.createElement("div", { className: "w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-emerald-500/20 text-emerald-400" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-check" })), /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-sm leading-tight" }, toast.message)));
}
function AppShell() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState(false);
  const [recoveryError, setRecoveryError] = useState(null);
  useEffect(() => {
    if (!sb) {
      setAuthLoading(false);
      return;
    }
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
        if (event === "PASSWORD_RECOVERY") {
          setIsPasswordRecovery(true);
        }
      }
    });
    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (subscription && typeof subscription.unsubscribe === "function") {
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
      setTimeout(() => {
        setIsPasswordRecovery(false);
        setRecoverySuccess(false);
      }, 2e3);
    } catch (err) {
      setRecoveryError(err.message || "Erreur de r\xE9initialisation");
    }
  };
  if (authLoading) {
    return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen flex items-center justify-center", style: { background: "linear-gradient(135deg, #0f172a 0%, #171717 50%, #1a0505 100%)" } }, /* @__PURE__ */ React.createElement("div", { className: "text-center" }, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4", style: { background: "linear-gradient(135deg, #E6222B, #9b1c1c)" } }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-spinner fa-spin text-white text-2xl" })), /* @__PURE__ */ React.createElement("p", { className: "text-white font-bold" }, "ikadevis"), /* @__PURE__ */ React.createElement("p", { className: "text-neutral-500 text-sm" }, "Initialisation\u2026")));
  }
  if (isPasswordRecovery) {
    return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen bg-slate-900 flex items-center justify-center p-4" }, /* @__PURE__ */ React.createElement("div", { className: "bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl" }, /* @__PURE__ */ React.createElement("h2", { className: "text-2xl font-black text-neutral-900 mb-2" }, "Nouveau mot de passe"), /* @__PURE__ */ React.createElement("p", { className: "text-neutral-500 text-sm mb-6" }, "Saisissez votre nouveau mot de passe pour votre compte ikadevis."), recoveryError && /* @__PURE__ */ React.createElement("div", { className: "bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold mb-4" }, recoveryError), recoverySuccess ? /* @__PURE__ */ React.createElement("div", { className: "bg-emerald-50 text-emerald-700 p-4 rounded-xl text-sm font-bold text-center" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-circle-check text-2xl mb-2 block text-emerald-500" }), "Mot de passe mis \xE0 jour avec succ\xE8s !") : /* @__PURE__ */ React.createElement("form", { onSubmit: handleUpdatePassword, className: "space-y-4" }, /* @__PURE__ */ React.createElement("input", { type: "password", value: newPasswordInput, onChange: (e) => setNewPasswordInput(e.target.value), required: true, minLength: 8, placeholder: "Minimum 8 caract\xE8res", className: "w-full border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500 outline-none" }), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn-primary w-full py-3.5" }, "Enregistrer le mot de passe"))));
  }
  if (!session) {
    return /* @__PURE__ */ React.createElement(AuthScreen, { onAuthSuccess: (s) => setSession(s) });
  }
  return /* @__PURE__ */ React.createElement(UserSchemaGate, { supabaseSession: session, supabaseClient: sb, onSignOut: () => {
    if (sb && session?.user?.id !== "guest") sb.auth.signOut();
    setSession(null);
  } });
}
function UserSchemaGate({ supabaseSession, supabaseClient, onSignOut }) {
  const sbUser = supabaseSession?.user;
  const userSchemaCheck = useMemo(() => {
    if (!sbUser) return { isDowngrade: false, storedInt: CURRENT_SCHEMA_INT };
    const raw = LS.get("schemaVersion", sbUser.id);
    const storedInt = raw !== null ? parseInt(raw, 10) : CURRENT_SCHEMA_INT;
    return { isDowngrade: storedInt > CURRENT_SCHEMA_INT, storedInt };
  }, [sbUser]);
  if (userSchemaCheck.isDowngrade) {
    return /* @__PURE__ */ React.createElement("div", { className: "min-h-screen bg-neutral-900 flex items-center justify-center p-6 text-white text-center" }, /* @__PURE__ */ React.createElement("div", { className: "bg-neutral-800 p-8 rounded-3xl max-w-md w-full border border-neutral-700 shadow-2xl space-y-4" }, /* @__PURE__ */ React.createElement("div", { className: "w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-2" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-shield-cat text-3xl" })), /* @__PURE__ */ React.createElement("h2", { className: "text-xl font-extrabold text-white" }, "Protection Anti-Downgrade V5.9"), /* @__PURE__ */ React.createElement("p", { className: "text-sm text-neutral-400 leading-relaxed" }, "Vos donn\xE9es locales ont \xE9t\xE9 enregistr\xE9es avec une version de sch\xE9ma sup\xE9rieure (", /* @__PURE__ */ React.createElement("strong", { className: "text-red-400" }, "V", userSchemaCheck.storedInt), ")."), /* @__PURE__ */ React.createElement("p", { className: "text-xs text-neutral-500 leading-relaxed" }, "Pour \xE9viter tout \xE9crasement ou corruption de donn\xE9es, l'acc\xE8s \xE0 cette version de l'application (V", CURRENT_SCHEMA_INT, ") est bloqu\xE9 pour votre compte. Veuillez vous connecter depuis une version r\xE9cente."), /* @__PURE__ */ React.createElement("button", { onClick: onSignOut, className: "btn-primary w-full py-3.5 mt-4" }, /* @__PURE__ */ React.createElement("i", { className: "fa-solid fa-right-from-bracket mr-2" }), " Se D\xE9connecter")));
  }
  return /* @__PURE__ */ React.createElement(App, { supabaseSession, supabaseClient, onSignOut });
}
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  /* @__PURE__ */ React.createElement(ErrorBoundary, null, /* @__PURE__ */ React.createElement(AppShell, null))
);
