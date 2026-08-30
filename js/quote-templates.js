// Gabarits de devis 1-clic (Assistant Intelligent) — données pures, aucun JSX.
// Extrait de index_jsx.js le 2026-08-16 (PROJECT_MASTER_TRACKER.md § 15).
// Chargé en script classique AVANT app.compiled.js (voir index.html).
const R1_TEMPLATE_QUOTE = {
    id: 1001,
    number: 'DEV-2026-R1',
    clientName: 'M. & Mme KOUASSI',
    projectRef: 'Construction Villa Duplex R+1 — Cocody Ambassades',
    status: 'draft',
    vatRate: 18,
    overheadRate: 5,
    margin: 30,
    marginType: 'reel',
    discountRate: 0,
    notes: 'Devis tous corps d’état (TCE) pour la construction d’une villa duplex de standing.\nValidité : 30 jours. Règlement : 40% démarrage, 30% hors d’eau, 20% second œuvre, 10% réception.',
    lots: [
        {
            id: 'lot_1',
            code: '01',
            name: 'Installation de Chantier & Travaux Préparatoires',
            items: [
                {
                    id: 'item_1_1',
                    solutionId: 1,
                    name: 'Panneau de Chantier & Clôture Sécurisée',
                    description: 'Fourniture et pose de panneau d’information et palissade métallique sécurisée 4m x 2m',
                    qty: 1,
                    calcForm: { solutionId: 1, takeoffMode: 'rectangle', width: 4, height: 2, qty: 1, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: {} }
                }
            ]
        },
        {
            id: 'lot_2',
            code: '02',
            name: 'Terrassement & Fouilles en Rigoles',
            items: [
                {
                    id: 'item_2_1',
                    solutionId: 10,
                    name: 'Fouilles en pleine masse et décapage terre végétale',
                    description: 'Déblais mécaniques (500 m³) avec évacuation des terres excédentaires à la décharge publique',
                    qty: 1,
                    calcForm: { solutionId: 10, takeoffMode: 'volume', width: 25, height: 20, depth: 1.0, qty: 1, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: {} }
                }
            ]
        },
        {
            id: 'lot_3',
            code: '03',
            name: 'Fondations & Béton Armé d’Infrastructure',
            items: [
                {
                    id: 'item_3_1',
                    solutionId: 4,
                    name: 'Semelles isolées et filantes en béton armé B25 dosé à 350 kg/m³',
                    description: 'Béton prêt à l’emploi (72 m³) avec armature haute adhérence FeE500 dosée à 80 kg/m³',
                    qty: 1,
                    calcForm: { solutionId: 4, takeoffMode: 'volume', width: 15, height: 24, depth: 0.20, qty: 1, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: { DOSAGE_ACIER: 80 } }
                }
            ]
        },
        {
            id: 'lot_4',
            code: '04',
            name: 'Structure & Gros Œuvre RDC',
            items: [
                {
                    id: 'item_4_1',
                    solutionId: 4,
                    name: 'Poteaux, poutres et chaînages RDC en béton armé',
                    description: 'Coffrage soigné contreplaqué bakélisé et coulage béton prêt à l’emploi (56 m³)',
                    qty: 1,
                    calcForm: { solutionId: 4, takeoffMode: 'volume', width: 14, height: 20, depth: 0.20, qty: 1, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: { DOSAGE_ACIER: 90 } }
                }
            ]
        },
        {
            id: 'lot_5',
            code: '05',
            name: 'Plancher Haut RDC & Structure Étage R+1',
            items: [
                {
                    id: 'item_5_1',
                    solutionId: 4,
                    name: 'Dalle de compression et plancher hourdis nervuré 16+4',
                    description: 'Hourdis creux avec treillis soudé et béton dosé à 350 kg/m³ (320 m²)',
                    qty: 1,
                    calcForm: { solutionId: 4, takeoffMode: 'volume', width: 16, height: 20, depth: 0.15, qty: 1, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: { DOSAGE_ACIER: 75 } }
                }
            ]
        },
        {
            id: 'lot_6',
            code: '06',
            name: 'Maçonnerie & Cloisonnements',
            items: [
                {
                    id: 'item_6_1',
                    solutionId: 5,
                    name: 'Murs extérieurs en agglos pleins de 15 et cloisons intérieures',
                    description: 'Élévation de 640 m² de murs hourdés au mortier de ciment dosé à 300 kg/m³',
                    qty: 1,
                    calcForm: { solutionId: 5, takeoffMode: 'surface', surfaceDirect: 640, qty: 1, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: {} }
                }
            ]
        },
        {
            id: 'lot_7',
            code: '07',
            name: 'Électricité Courants Forts & Faibles',
            items: [
                {
                    id: 'item_7_1',
                    solutionId: 15,
                    name: 'Tableau divisionnaire & Câblage complet appareillage Legrand',
                    description: 'Distribution encastrée, disjoncteurs différentiels, prises et 90 points électriques (villa R+1)',
                    qty: 90,
                    calcForm: { solutionId: 15, takeoffMode: 'unit', qty: 90, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: {} }
                }
            ]
        },
        {
            id: 'lot_8',
            code: '08',
            name: 'Plomberie Sanitaire & Évacuations',
            items: [
                {
                    id: 'item_8_1',
                    solutionId: 16,
                    name: 'Réseau alimentation multicouche & Évacuations PVC EU/EV',
                    description: 'Fourniture et raccordement sanitaires complets (8 SDB complètes + Cuisine moderne, villa R+1)',
                    qty: 10,
                    calcForm: { solutionId: 16, takeoffMode: 'unit', qty: 10, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: {} }
                }
            ]
        },
        {
            id: 'lot_9',
            code: '09',
            name: 'Menuiserie Aluminium & Serrurerie',
            items: [
                {
                    id: 'item_9_1',
                    solutionId: 7,
                    name: 'Baies vitrées coulissantes & Portes-fenêtres alu vitrage feuilleté 44.2',
                    description: 'Profilés aluminium thermolaqués avec vitrage isolant de sécurité 44.2 (12 ensembles 2.4m x 2.2m)',
                    qty: 12,
                    calcForm: { solutionId: 7, takeoffMode: 'rectangle', width: 2.4, height: 2.2, qty: 12, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: {} }
                }
            ]
        },
        {
            id: 'lot_10',
            code: '10',
            name: 'Revêtements de Sol & Peinture Intérieure/Extérieure',
            items: [
                {
                    id: 'item_10_1',
                    solutionId: 6,
                    name: 'Carrelage Grès Cérame 60x60 Poli & Plinthes assorties (440 m²)',
                    description: 'Pose collée avec mortier colle C2TE et jointoiement soigné hydrofuge',
                    qty: 1,
                    calcForm: { solutionId: 6, takeoffMode: 'surface', surfaceDirect: 440, qty: 1, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: {} }
                },
                {
                    id: 'item_10_2',
                    solutionId: 3,
                    name: 'Peinture Murale Satinée 2 Couches (Intérieur + Façades 1300 m²)',
                    description: 'Ponçage, impression fixatrice et application de 2 couches de finition satinée lessivable',
                    qty: 1,
                    calcForm: { solutionId: 3, takeoffMode: 'surface', surfaceDirect: 1300, qty: 1, faces: 2, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: { COUCHES: 2 } }
                }
            ]
        },
        {
            id: 'lot_11',
            code: '11',
            name: 'Finitions, Nettoyage & Réception de Chantier',
            items: [
                {
                    id: 'item_11_1',
                    isCustom: true,
                    name: 'Nettoyage industriel de fin de chantier & Enlèvement gravats',
                    description: 'Remise en état impeccable avant livraison des clés au maître d’ouvrage',
                    qty: 1,
                    unit: 'forfait',
                    unitPriceHT: 600000,
                    totalHT: 600000
                }
            ]
        }
    ]
};


const EVENT_TEMPLATE_QUOTE = {
    id: 1002,
    number: 'DEV-2026-EVT-01',
    clientName: 'AGENCE IMPACT COM',
    projectRef: 'Salon International de l’Innovation — Stand Premium 36m²',
    status: 'draft',
    activityType: 'event',
    eventDetails: {
        name: 'Salon International de l’Innovation',
        venue: 'Centre de conférences',
        date: '',
        participants: '250',
        responsible: ''
    },
    paymentSchedule: [
        { label: 'À la commande', pct: 50 },
        { label: 'Avant l’événement', pct: 30 },
        { label: 'Après installation', pct: 20 }
    ],
    vatRate: 18,
    overheadRate: 5,
    margin: 30,
    marginType: 'reel',
    discountRate: 0,
    notes: 'Prestation événementielle tout compris : Scénographie, Impression, Mobilier, Éclairage et Régie technique.\nValidité : 15 jours. Acompte : 50% à la commande, 50% à la livraison du stand.',
    lots: [
        {
            id: 'lot_evt_1',
            code: '01',
            name: 'Scénographie, Podium & Structures Modulaires',
            items: [
                {
                    id: 'item_evt_1_1',
                    isCustom: true,
                    name: 'Podium Scène surélevé 6m × 4m avec juponnage noir',
                    description: 'Structure praticable aluminium renforcée avec plancher bois antidérapant et escalier 2 marches',
                    qty: 1,
                    unit: 'forfait',
                    unitPriceHT: 1200000,
                    totalHT: 1200000
                },
                {
                    id: 'item_evt_1_2',
                    solutionId: 1,
                    name: 'Structure Autoportante Backdrop Fond de Scène 8m × 3m',
                    description: 'Cadre métallique tubulaire avec platines de lestage pour tension de bâche grand format',
                    qty: 1,
                    calcForm: {
                        solutionId: 1, takeoffMode: 'rectangle', width: 8, height: 3, qty: 1, faces: 1,
                        margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0,
                        includeInstall: true, customVarValues: {}
                    }
                },
                {
                    id: 'item_evt_1_3',
                    isCustom: true,
                    name: 'Arche d’Accueil Monumentale 4m × 3m & Photocall VIP',
                    description: 'Structure 3D habillée avec éclairage intégré et fond photocall pour prises de vue partenaires',
                    qty: 1,
                    unit: 'forfait',
                    unitPriceHT: 850000,
                    totalHT: 850000
                }
            ]
        },
        {
            id: 'lot_evt_2',
            code: '02',
            name: 'Impression Grand Format, Bâches & Signalétique',
            items: [
                {
                    id: 'item_evt_2_1',
                    solutionId: 1,
                    name: 'Impression Bâche PVC 510g M1 Anti-reflet HD',
                    description: 'Bâche occultante haute définition avec fourreaux et œillets de tension périphériques',
                    qty: 1,
                    calcForm: {
                        solutionId: 1, takeoffMode: 'rectangle', width: 8, height: 3, qty: 1, faces: 1,
                        margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0,
                        includeInstall: true, customVarValues: {}
                    }
                },
                {
                    id: 'item_evt_2_2',
                    isCustom: true,
                    name: 'Totems Signalétiques Triangulaires 2.00m × 0.80m (x3)',
                    description: 'Totems autoportants en Alucobond imprimé vinyle lamination mate anti-reflet',
                    qty: 3,
                    unit: 'u',
                    unitPriceHT: 220000,
                    totalHT: 660000
                }
            ]
        },
        {
            id: 'lot_evt_3',
            code: '03',
            name: 'Équipements, Mobilier & Technique Lumière',
            items: [
                {
                    id: 'item_evt_3_1',
                    isCustom: true,
                    name: 'Moquette Événementielle Ignifugée M1 avec film protecteur',
                    description: 'Fourniture et pose de moquette velours 36m² avec découpe et ruban adhésif double-face résistant',
                    qty: 36,
                    unit: 'm²',
                    unitPriceHT: 12000,
                    totalHT: 432000
                },
                {
                    id: 'item_evt_3_2',
                    isCustom: true,
                    name: 'Kit Éclairage Scénique LED Wash 54x3W & Projecteurs Découpe',
                    description: 'Rampe de 6 projecteurs LED RGBW orientables avec gradateur DMX et câblage sécurisé',
                    qty: 1,
                    unit: 'forfait',
                    unitPriceHT: 650000,
                    totalHT: 650000
                },
                {
                    id: 'item_evt_3_3',
                    isCustom: true,
                    name: 'Pack Mobilier Lounge (Canapés, Table basse, Mange-debout x4)',
                    description: 'Mobilier design haut standing pour espace networking et accueil VIP',
                    qty: 1,
                    unit: 'forfait',
                    unitPriceHT: 750000,
                    totalHT: 750000
                }
            ]
        },
        {
            id: 'lot_evt_4',
            code: '04',
            name: 'Logistique, Montage Nuit, Régie & Démontage',
            items: [
                {
                    id: 'item_evt_4_1',
                    isCustom: true,
                    name: 'Transport Camion 20m³ & Manutention sécurisée A/R',
                    description: 'Acheminement sur site expo, déchargement et rechargement après clôture',
                    qty: 1,
                    unit: 'forfait',
                    unitPriceHT: 350000,
                    totalHT: 350000
                },
                {
                    id: 'item_evt_4_2',
                    isCustom: true,
                    name: 'Équipe de Montage Nuit & Démontage Express (8 techniciens)',
                    description: 'Installation complète en horaires décalés (J-1 20h à J0 06h) et repli en 3 heures',
                    qty: 1,
                    unit: 'forfait',
                    unitPriceHT: 950000,
                    totalHT: 950000
                }
            ]
        }
    ]
};

// ═══════════════════════════════════════════════════════════════
// BLOC 4/10 : MODÈLES & GÉNÉRATEURS MÉTIERS PROFESSIONNELS BTP
// ═══════════════════════════════════════════════════════════════


const PAINTING_PRO_TEMPLATE_QUOTE = {
    id: 1005,
    number: 'DEV-2026-PNT-01',
    clientName: 'SCI RÉSIDENCE DU PARC',
    projectRef: 'Travaux de Peinture Complète, Préparation & Enduit — 350m²',
    status: 'draft',
    vatRate: 18,
    overheadRate: 5,
    margin: 30,
    marginType: 'reel',
    discountRate: 0,
    notes: 'Travaux de peinture intérieure soignée : protection des sols et menuiseries, lessivage, impression hydrofuge, enduit de lissage 2 passes, ponçage dépoussiérage et application de 2 couches de peinture satinée velours.',
    lots: [
        {
            id: 'lot_pnt_1',
            code: '01',
            name: 'Protection, Masquage & Préparation des Supports',
            items: [
                {
                    id: 'item_pnt_1_1',
                    isCustom: true,
                    name: 'Protection des sols, fenêtres et plinthes (bâche polyane + adhésif de masquage)',
                    description: 'Fourniture et pose de films de protection sur l’ensemble des surfaces non peintes',
                    qty: 350,
                    unit: 'm²',
                    unitPriceHT: 850,
                    totalHT: 297500
                },
                {
                    id: 'item_pnt_1_2',
                    isCustom: true,
                    name: 'Lessivage, égrenage et rebouchage des fissures',
                    description: 'Nettoyage des fonds et traitement des microfissures à l’enduit fibré',
                    qty: 350,
                    unit: 'm²',
                    unitPriceHT: 1200,
                    totalHT: 420000
                }
            ]
        },
        {
            id: 'lot_pnt_2',
            code: '02',
            name: 'Couche d’Impression & Enduisage 2 Passes',
            items: [
                {
                    id: 'item_pnt_2_1',
                    isCustom: true,
                    name: 'Application d’une sous-couche primaire d’accrochage hydrofuge',
                    description: 'Régulation de la porosité du plâtre et uniformisation des supports',
                    qty: 350,
                    unit: 'm²',
                    unitPriceHT: 1800,
                    totalHT: 630000
                },
                {
                    id: 'item_pnt_2_2',
                    isCustom: true,
                    name: 'Enduit de surfaçage et lissage en 2 passes croisées avec ponçage fin',
                    description: 'Application manuelle au couteau et ponçage mécanique avec aspiration',
                    qty: 350,
                    unit: 'm²',
                    unitPriceHT: 2600,
                    totalHT: 910000
                }
            ]
        },
        {
            id: 'lot_pnt_3',
            code: '03',
            name: 'Peinture de Finition Satinée Velours (2 Couches)',
            items: [
                {
                    id: 'item_pnt_3_1',
                    solutionId: 3,
                    name: 'Peinture murale acrylique satinée velours — 2 couches croisées',
                    description: 'Peinture haute résistance lavable, certifiée sans COV (350 m²)',
                    qty: 1,
                    calcForm: { solutionId: 3, takeoffMode: 'surface', surfaceDirect: 350, qty: 1, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: { COUCHES: 2, RENDEMENT: 9 } }
                }
            ]
        }
    ]
};


const TILING_PRO_TEMPLATE_QUOTE = {
    id: 1006,
    number: 'DEV-2026-CRL-01',
    clientName: 'IMMEUBLE LE SÉMAPHORE',
    projectRef: 'Revêtement Sols & Murs en Grès Cérame 60x60 — 220m²',
    status: 'draft',
    vatRate: 18,
    overheadRate: 5,
    margin: 30,
    marginType: 'reel',
    discountRate: 0,
    notes: 'Fourniture et pose de carrelage en grès cérame émaillé 60x60 rectifié avec ragréage préalable autolissant, colle haute performance C2S1, joints hydrofuges 2mm et plinthes assorties.',
    lots: [
        {
            id: 'lot_crl_1',
            code: '01',
            name: 'Ragréage Autolissant & Préparation du Support',
            items: [
                {
                    id: 'item_crl_1_1',
                    isCustom: true,
                    name: 'Ragréage autolissant P3 fibré épaisseur 3 à 5mm',
                    description: 'Primaire d’adhérence et coulage de mortier autolissant fibré pour planéité parfaite',
                    qty: 220,
                    unit: 'm²',
                    unitPriceHT: 3500,
                    totalHT: 770000
                }
            ]
        },
        {
            id: 'lot_crl_2',
            code: '02',
            name: 'Pose Carrelage Grès Cérame 60x60 & Jointoiement',
            items: [
                {
                    id: 'item_crl_2_1',
                    isCustom: true,
                    name: 'Fourniture et pose carrelage grès cérame 60x60 rectifié (pose droite)',
                    description: 'Double encollage au mortier-colle C2S1, croisillons autonivelants et découpes soignées (+7% perte)',
                    qty: 235.4,
                    unit: 'm²',
                    unitPriceHT: 16500,
                    totalHT: 3884100
                },
                {
                    id: 'item_crl_2_2',
                    isCustom: true,
                    name: 'Jointoiement hydrofuge fin (2mm) et nettoyage de fin de chantier',
                    description: 'Mortier de jointoiement haute résistance aux taches et anti-moisissures',
                    qty: 220,
                    unit: 'm²',
                    unitPriceHT: 1200,
                    totalHT: 264000
                }
            ]
        },
        {
            id: 'lot_crl_3',
            code: '03',
            name: 'Plinthes Assorties & Profilés de Seuil',
            items: [
                {
                    id: 'item_crl_3_1',
                    isCustom: true,
                    name: 'Fourniture et pose de plinthes en grès cérame 8cm avec coupe d’onglet',
                    description: 'Pose collée avec joint silicone d’étanchéité périphérique (140 ml)',
                    qty: 140,
                    unit: 'ml',
                    unitPriceHT: 4500,
                    totalHT: 630000
                },
                {
                    id: 'item_crl_3_2',
                    isCustom: true,
                    name: 'Profilés de transition et de seuil en aluminium anodisé',
                    description: 'Barres de seuil invisibles extra-plates pour portes et baies vitrées',
                    qty: 8,
                    unit: 'u',
                    unitPriceHT: 7500,
                    totalHT: 60000
                }
            ]
        }
    ]
};


const METALLERIE_PRO_TEMPLATE_QUOTE = {
    id: 1007,
    number: 'DEV-2026-MET-01',
    clientName: 'INDUSTRIE MÉTALLURGIQUE SA',
    projectRef: 'Ouvrages de Métallerie & Châssis Tubulaires avec Plan de Débit',
    status: 'draft',
    vatRate: 18,
    overheadRate: 5,
    margin: 30,
    marginType: 'reel',
    discountRate: 0,
    notes: 'Fabrication et pose d’ouvrages métalliques sur-mesure : débit optimisé de profilés acier 6m (chute < 5%), soudure semi-automatique MIG/MAG, meulage, décapage, primaire antirouille au phosphate de zinc et thermolaquage.',
    lots: [
        {
            id: 'lot_met_1',
            code: '01',
            name: 'Débit 1D des Profilés Acier & Usinage Atelier',
            items: [
                {
                    id: 'item_met_1_1',
                    isCustom: true,
                    name: 'Débit optimisé de tubes carrés 50x50x2mm (Barres commerciales 6m)',
                    description: 'Coupe d’angle 45°/90° à la scie à ruban, ébavurage et perçage des platines de fixation',
                    qty: 36,
                    unit: 'barre',
                    unitPriceHT: 18500,
                    totalHT: 666000
                },
                {
                    id: 'item_met_1_2',
                    isCustom: true,
                    name: 'Fourniture cornières et fers plats de renfort 40x4mm',
                    description: 'Débit et grugeage des goussets et équerres de renfort',
                    qty: 12,
                    unit: 'barre',
                    unitPriceHT: 9500,
                    totalHT: 114000
                }
            ]
        },
        {
            id: 'lot_met_2',
            code: '02',
            name: 'Assemblage, Soudure MIG/MAG & Consommables',
            items: [
                {
                    id: 'item_met_2_1',
                    isCustom: true,
                    name: 'Soudure semi-automatique continue MIG/MAG sous gaz Argon/CO2',
                    description: 'Fil d’apport SG2 0.8mm, gaz de protection, meulage affleurant des cordons et contrôle visuel',
                    qty: 48,
                    unit: 'h',
                    unitPriceHT: 8500,
                    totalHT: 408000
                },
                {
                    id: 'item_met_2_2',
                    isCustom: true,
                    name: 'Consommables de métallerie (disques à tronçonner/ébarber, gaz, électrodes)',
                    description: 'Pack complet consommables pour débit et assemblage de 48h atelier',
                    qty: 1,
                    unit: 'forfait',
                    unitPriceHT: 125000,
                    totalHT: 125000
                }
            ]
        },
        {
            id: 'lot_met_3',
            code: '03',
            name: 'Traitement Anticorrosion, Laque de Finition & Pose Site',
            items: [
                {
                    id: 'item_met_3_1',
                    isCustom: true,
                    name: 'Traitement primaire anticorrosion au phosphate de zinc (2 passes)',
                    description: 'Dégraissage préalable et application de 2 couches d’apprêt antirouille 60µm',
                    qty: 120,
                    unit: 'm²',
                    unitPriceHT: 3200,
                    totalHT: 384000
                },
                {
                    id: 'item_met_3_2',
                    isCustom: true,
                    name: 'Peinture de finition laque polyuréthane industrielle RAL au choix',
                    description: 'Application au pistolet haute pression, séchage rapide et film protecteur',
                    qty: 120,
                    unit: 'm²',
                    unitPriceHT: 4500,
                    totalHT: 540000
                },
                {
                    id: 'item_met_3_3',
                    isCustom: true,
                    name: 'Pose et ancrage sur site par chevilles métalliques haute charge M12',
                    description: 'Mise à niveau au laser, calage, chevillage chimique et réglage final',
                    qty: 2,
                    unit: 'j',
                    unitPriceHT: 140000,
                    totalHT: 280000
                }
            ]
        }
    ]
};


const MENUISERIE_PRO_TEMPLATE_QUOTE = {
    id: 1008,
    number: 'DEV-2026-MNU-01',
    clientName: 'ARCHITECTES & ASSOCIÉS',
    projectRef: 'Agencement sur Mesure Dressing & Caissons MDF 18mm',
    status: 'draft',
    vatRate: 18,
    overheadRate: 5,
    margin: 30,
    marginType: 'reel',
    discountRate: 0,
    notes: 'Fabrication et pose de dressing sur mesure : panneaux MDF hydrofuge 18mm mélaminé Chêne Naturel, chants ABS 2mm plaqués à chaud, tiroirs coulisses amorties invisibles, charnières clipsables 110° et poignées profilées alu.',
    lots: [
        {
            id: 'lot_mnu_1',
            code: '01',
            name: 'Panneaux MDF 18mm & Calepinage Débit 2D',
            items: [
                {
                    id: 'item_mnu_1_1',
                    isCustom: true,
                    name: 'Fourniture panneaux mélaminé 18mm hydrofuge 2.80m × 2.07m',
                    description: 'Calepinage optimisé (taux de chute < 8%), découpe sur scie à format numérique',
                    qty: 8,
                    unit: 'plaque',
                    unitPriceHT: 45000,
                    totalHT: 360000
                },
                {
                    id: 'item_mnu_1_2',
                    isCustom: true,
                    name: 'Placage des chants en bande ABS 2mm assortie avec colle thermofusible',
                    description: 'Placage automatique, affleurage, raclage et polissage des chants visibles',
                    qty: 95,
                    unit: 'ml',
                    unitPriceHT: 1500,
                    totalHT: 142500
                }
            ]
        },
        {
            id: 'lot_mnu_2',
            code: '02',
            name: 'Quincaillerie Haute Performance & Tiroirs Amortis',
            items: [
                {
                    id: 'item_mnu_2_1',
                    isCustom: true,
                    name: 'Charnières invisibles grand angle 110° avec amortisseur intégré (Blum)',
                    description: 'Embases réglables 3D et fermeture progressive amortie (Soft-Close)',
                    qty: 24,
                    unit: 'u',
                    unitPriceHT: 3800,
                    totalHT: 91200
                },
                {
                    id: 'item_mnu_2_2',
                    isCustom: true,
                    name: 'Coulisses de tiroirs invisibles à sortie totale avec frein (charge 40kg)',
                    description: 'Système d’ouverture synchronisée ultra-fluide avec réglage micrométrique',
                    qty: 8,
                    unit: 'u',
                    unitPriceHT: 14500,
                    totalHT: 116000
                },
                {
                    id: 'item_mnu_2_3',
                    isCustom: true,
                    name: 'Poignées profilées aluminium noir mat brossé',
                    description: 'Fixation traversante invisible avec visserie inox',
                    qty: 16,
                    unit: 'u',
                    unitPriceHT: 4500,
                    totalHT: 72000
                }
            ]
        },
        {
            id: 'lot_mnu_3',
            code: '03',
            name: 'Assemblage Atelier & Pose Soignée sur Site',
            items: [
                {
                    id: 'item_mnu_3_1',
                    isCustom: true,
                    name: 'Pré-assemblage des caissons et tiroirs en atelier par tourillons & confirmat',
                    description: 'Équerrage rigide sous presse et contrôle dimensionnel',
                    qty: 24,
                    unit: 'h',
                    unitPriceHT: 7500,
                    totalHT: 180000
                },
                {
                    id: 'item_mnu_3_2',
                    isCustom: true,
                    name: 'Livraison, installation et ajustement sur site avec fileurs de finition',
                    description: 'Fixation murale sécurisée, réglage des portes et tiroirs, nettoyage complet',
                    qty: 2,
                    unit: 'j',
                    unitPriceHT: 120000,
                    totalHT: 240000
                }
            ]
        }
    ]
};



const ACM_FACADE_TEMPLATE_QUOTE = {
    id: 1003,
    number: 'DEV-2026-ACM-01',
    clientName: 'SOCIÉTÉ IMMOBILIÈRE DU GOLFE',
    projectRef: 'Habillage Façade Moderne en Panneaux Alucobond 4mm PVDF — 180m²',
    status: 'draft',
    vatRate: 18,
    overheadRate: 5,
    margin: 30,
    marginType: 'reel',
    discountRate: 0,
    notes: 'Habillage composite aluminium Alucobond PVDF 4mm résistant aux UV et intempéries.\nComprend échafaudage, ossature métallique primaire et secondaire, découpes rainurage V, pose en cassettes.',
    lots: [
        {
            id: 'lot_acm_1',
            code: '01',
            name: 'Travaux Préparatoires & Échafaudage Façade',
            items: [
                {
                    id: 'item_acm_1_1',
                    isCustom: true,
                    name: 'Montage et location échafaudage tubulaire sécurisé 180m²',
                    description: 'Échafaudage conforme aux normes avec filet de protection et garde-corps',
                    qty: 180,
                    unit: 'm²',
                    unitPriceHT: 4500,
                    totalHT: 810000
                }
            ]
        },
        {
            id: 'lot_acm_2',
            code: '02',
            name: 'Habillage Complet Façade Panneaux ACM Alucobond 4mm PVDF',
            items: [
                {
                    id: 'item_acm_2_1',
                    solutionId: 2,
                    name: 'Fourniture, Ossature galva, Usinage Cassettes ACM & Pose Nacelle (180 m²)',
                    description: 'Ensemble complet incluant ossature primaire/secondaire 40x40, plaques Alucobond PVDF, usinage V-groove, fixations et pose',
                    qty: 1,
                    // Fix P0-2 (2026-08-30) — takeoffMode 'surface' retiré des
                    // allowedModes de la solution 2 (ACM) : le calepinage réel
                    // (matériau refId 32, formule id 8) a besoin de largeur ET
                    // hauteur séparément, une aire agrégée ne suffit pas.
                    // 18×10m conserve les 180 m² de référence de ce modèle.
                    calcForm: { solutionId: 2, takeoffMode: 'rectangle', width: 18, height: 10, qty: 1, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: {} }
                }
            ]
        }
    ]
};


const SIGNAGE_BRANDING_TEMPLATE_QUOTE = {
    id: 1004,
    number: 'DEV-2026-SGN-01',
    clientName: 'BOUTIQUE CONCEPT STORE',
    projectRef: 'Enseigne Lumineuse LED & Identité Visuelle de Façade',
    status: 'draft',
    vatRate: 18,
    overheadRate: 5,
    margin: 30,
    marginType: 'reel',
    discountRate: 0,
    notes: 'Fabrication et pose d’enseigne lumineuse LED haute luminosité avec caisson profilé aluminium thermolaqué et lettres reliefs rétro-éclairées.',
    lots: [
        {
            id: 'lot_sgn_1',
            code: '01',
            name: 'Caisson Enseigne Lumineuse LED & Lettres Découpées',
            items: [
                {
                    id: 'item_sgn_1_1',
                    solutionId: 8,
                    name: 'Caisson Lumineux LED Double Face 3.00m × 0.80m',
                    description: 'Structure aluminium étanche avec modules LED IP67 1.2W, alimentation MeanWell et faces Plexi diffusant',
                    qty: 1,
                    calcForm: { solutionId: 8, takeoffMode: 'rectangle', width: 3, height: 0.8, qty: 1, faces: 2, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: {} }
                },
                {
                    id: 'item_sgn_1_2',
                    solutionId: 9,
                    name: 'Lettres Reliefs Découpées en Acrylique Rétroéclairé LED (12 lettres)',
                    description: 'Lettres bloc plexi 20mm diffusant avec rétro-éclairage halo blanc chaud et entretoises de fixation',
                    qty: 1,
                    calcForm: { solutionId: 9, takeoffMode: 'rectangle', width: 2.5, height: 0.5, qty: 1, faces: 1, margin: 30, marginType: 'reel', overheadRate: 5, vatRate: 18, discountRate: 0, includeInstall: true, customVarValues: { NOMBRE_LETTRES: 12 } }
                }
            ]
        },
        {
            id: 'lot_sgn_2',
            code: '02',
            name: 'Habillage Vitrine en Adhésif Vinyle Microperforé',
            items: [
                {
                    id: 'item_sgn_2_1',
                    isCustom: true,
                    name: 'Film vinyle microperforé One-Way Vision imprimé HD 12m²',
                    description: 'Impression éco-solvant haute durabilité et pose soignée sans bulles sur vitrine',
                    qty: 12,
                    unit: 'm²',
                    unitPriceHT: 18000,
                    totalHT: 216000
                }
            ]
        }
    ]
};
