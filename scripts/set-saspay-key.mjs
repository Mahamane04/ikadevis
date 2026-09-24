#!/usr/bin/env node
/**
 * Script de configuration sécurisée de la clé API SasPay pour ikadevis
 * Usage :
 *   npm run set-saspay-key
 *   ou : node scripts/set-saspay-key.mjs sk_live_...
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, '.env');
const platformConfigPath = path.join(projectRoot, 'js', 'saspay-platform-config.js');

async function askKey() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('\n🔑 Collez votre clé API SasPay (sk_live_... ou sk_test_...) : ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function testSasPayKey(key) {
    console.log('\n⏳ Vérification de la clé auprès de SasPay (https://api.saspay.me/api/v1/networks/)...');
    try {
        const res = await fetch('https://api.saspay.me/api/v1/networks/', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${key}`,
                'Accept': 'application/json'
            }
        });

        if (res.ok) {
            console.log('✅ Clé API validée avec succès par les serveurs SasPay !');
            return true;
        } else if (res.status === 401) {
            console.error('❌ Erreur 401 : Clé API refusée par SasPay. Vérifiez la clé saisie.');
            return false;
        } else {
            console.warn(`⚠️ Réponse SasPay HTTP ${res.status}. Enregistrement maintenu.`);
            return true;
        }
    } catch (err) {
        console.warn(`⚠️ Impossible de joindre api.saspay.me (${err.message}). La clé sera enregistrée en local.`);
        return true;
    }
}

async function main() {
    let key = process.argv[2]?.trim();

    if (!key) {
        key = await askKey();
    }

    if (!key) {
        console.error('❌ Aucune clé fournie. Annulation.');
        process.exit(1);
    }

    if (!key.startsWith('sk_live_') && !key.startsWith('sk_test_') && !key.startsWith('sk_')) {
        console.warn('⚠️ Avertissement : la clé ne commence pas par "sk_live_" ou "sk_test_". Assurez-vous qu\'il s\'agit bien de votre clé secrète SasPay.');
    }

    // Tester la clé
    await testSasPayKey(key);

    // 1. Mise à jour du fichier .env
    let envContent = '';
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }

    if (envContent.includes('SASPAY_API_KEY=')) {
        envContent = envContent.replace(/SASPAY_API_KEY=.*/g, `SASPAY_API_KEY=${key}`);
    } else {
        envContent += `\n# Passerelle SasPay (Mobile Money & Carte Bancaire)\nSASPAY_API_KEY=${key}\n`;
    }
    fs.writeFileSync(envPath, envContent, 'utf8');
    console.log(`\n📁 Clé enregistrée dans ${envPath}`);

    // 2. Information pour le stockage navigateur
    console.log(`💡 Pour l'utiliser dans le navigateur, définissez la clé dans le localStorage :`);
    console.log(`   localStorage.setItem('ikadevis_platform_saspay_key', '${key}');`);

    console.log('\n🎉 Configuration terminée avec succès !');
    console.log('Vous pouvez relancer le build si nécessaire avec : npm run build:js\n');
}

main().catch(err => {
    console.error('Erreur :', err);
    process.exit(1);
});
