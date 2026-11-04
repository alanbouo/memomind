# État et prochaines étapes — MemoMind

Ce fichier reflète l'état actuel ; l'historique est dans git. Il est le point
d'entrée d'une session de travail sur ce dépôt. Les actions qui attendent Alan
sont dans `rappels.md` du dépôt de pilotage, pas ici.

## Statut

En production, en exploitation : pas d'heures de build produit, seulement des
corrections et la prochaine build.

App Store : https://apps.apple.com/fr/app/memomind-m%C3%A9mos-vocaux-ia/id6825675614
(en ligne, constaté par Alan le 2026-11-01). Version publiée : 1.0, mise en ligne le
2026-10-31 (API iTunes, relevé du 2026-11-01).

## Ce que contient la version publiée

Dernière build iOS sur Expo : build 3 (1.0.0) du 2026-10-22, commit `22d409c`.
Aucune build cloud ultérieure. Si rien n'a été construit en local depuis (non
vérifié), la 1.0 ne contient pas `50adc1b`.

Le projet n'a pas `expo-updates` : le code mobile n'atteint les téléphones que par
une nouvelle build. Le code serveur part à chaque push sur `main` (Coolify, dit par
Alan le 2026-11-02).

## Changements mobiles en attente de la prochaine build

Version 1.0.1 posée par `638c7d6`, numéro de build attribué par EAS.

- `50adc1b` (2026-10-29), côté mobile : phrase de consentement IA (`AiConsent.tsx`),
  qui mentionne la recherche web ; reprise après coupure réseau, sans l'erreur
  « network connection was lost ».

Règle des builds iOS : `backlog-projets.md` du dépôt de pilotage.

## Décisions prises

- Le chat part de la transcription, utilise ses connaissances générales quand la
  demande dépasse l'enregistrement (en distinguant les deux), et lance une recherche
  web seulement quand c'est nécessaire (3 au maximum par réponse).
- Pas d'interrupteur de recherche web, ni sur mobile ni sur le web : le modèle décide.

## Ouvert

- Les prompts déjà enregistrés par les utilisateurs gardent l'ancien texte (leur
  réglage contient une copie) ; ils doivent re-sélectionner le préréglage.
- Le chat invité passe par le même code et dispose donc aussi de la recherche web.

## Non constaté

- Aucune requête réelle n'a été faite avec la recherche web.
- Réussite des déploiements de `50adc1b` et de `16c5e7b` (correctif `pause_turn`).
- Enregistrement web (invité, pause) : testé dans Chrome avec un flux audio généré et
  une API simulée. Ni vrai micro, ni Safari, ni transcription réelle par le serveur.
