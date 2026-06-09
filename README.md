# BienScore 🏠

Analyseur immobilier intelligent avec import d'annonces par IA.

## Structure du projet

```
bienscore/
├── api/
│   └── analyse.js       ← Backend serverless (clé API sécurisée ici)
├── public/
│   └── index.html       ← Frontend complet
├── vercel.json          ← Config Vercel
├── package.json
└── README.md
```

## Déploiement sur Vercel (5 minutes)

### 1. Créer un repo GitHub

1. Va sur [github.com](https://github.com) → **New repository**
2. Nomme-le `bienscore`, laisse-le **public** ou **private**
3. Clique **Create repository**
4. Upload tous les fichiers de ce dossier (drag & drop ou via l'interface)

### 2. Déployer sur Vercel

1. Va sur [vercel.com](https://vercel.com) → connecte-toi avec GitHub
2. Clique **Add New Project**
3. Importe ton repo `bienscore`
4. Clique **Deploy** (Vercel détecte automatiquement la config)

### 3. Ajouter la clé API (IMPORTANT)

1. Dans ton projet Vercel → **Settings** → **Environment Variables**
2. Ajoute :
   - **Name** : `ANTHROPIC_API_KEY`
   - **Value** : `sk-ant-api03-...` (ta clé Anthropic)
   - **Environment** : Production + Preview + Development
3. Clique **Save**
4. Va dans **Deployments** → **Redeploy** pour appliquer

### 4. Ton site est en ligne !

Vercel te donne une URL du type `https://bienscore-xxx.vercel.app`

---

## Fonctionnalités

- 🔗 **Import URL** : scraping côté serveur + analyse IA
- 📝 **Import texte** : extraction des données depuis une description collée
- 📊 **Score /100** : pondéré sur 5 critères (configurable)
- 💶 **Métriques** : rendement brut/net, cash-flow, prix/m²
- 🏦 **Simulation crédit** : mensualité, coût total, CF après crédit
- 📈 **Comparateur** : tous vos biens côte à côte
- 📁 **Historique** : sauvegarde en localStorage
- ⚙️ **Paramètres** : pondération et seuils personnalisables

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Clé API Anthropic (obligatoire) |
