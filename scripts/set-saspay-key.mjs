#!/usr/bin/env node
// Ancien assistant retiré : il affichait un secret et invitait à le stocker dans le navigateur.
console.error('Commande désactivée. Les clés SasPay doivent être configurées dans les secrets serveur via le processus administrateur. Aucun fichier ni service distant n’a été modifié.');
process.exitCode = 1;
