<p align="center">
  <img src="assets/images/cuisko/cuisko-winking-head.webp" alt="Cuisko, the chef red panda" width="180" />
</p>

<h1 align="center">Cuisko</h1>

<p align="center">
  <strong>Cuisko looks at the food you already own and hands you a week of meals, plus the short
  list of what is still missing.</strong>
</p>

<p align="center">
  <img alt="Expo" src="https://img.shields.io/badge/Expo-React%20Native-000020?logo=expo&logoColor=white" />
  <img alt="Convex" src="https://img.shields.io/badge/Convex-backend-EE342F" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="Platforms" src="https://img.shields.io/badge/iOS%20·%20Android%20·%20Web-555" />
</p>

## 🥕 Why

Meal-planning apps plan a week that needs a full shop. Inventory apps make you catalogue your
kitchen and give nothing back. Cuisko does both at once: the plan is generated from the stock, so
the food you own gets cooked before it rots, and the shopping list only holds what you lack.

> [!NOTE]
> **This repository is public for viewing only.** It is not open source. See [License](#-license).

## 🧰 Stack

- 📱 **App:** Expo (React Native) with Expo Router, for iOS, Android and web
- 🗄️ **Backend:** Convex (database, functions, auth)
- 🤖 **Agent:** `@convex-dev/agent` and the AI SDK, calling models through OpenRouter
- ⚛️ **State:** Jotai
- 🔷 **Language:** TypeScript throughout

## 🗂️ Layout

```
app/          Expo Router screens
src/modules/  one folder per domain: its hooks, components and screen logic
src/ui/       the design system, isolated from Convex and the domains
convex/       schema, procedures, router and domain functions
shared/       code both the app and the backend run
scripts/      database seeding and the project's own rule checks
docs/         product intent, architecture, conventions and ADRs
```

## 🚀 Running it locally

Requires Node 22 and pnpm.

```bash
pnpm install
cp .env.example .env.local   # then fill in the EXPO_PUBLIC_* keys
pnpm convex:dev              # keep it running
pnpm start                   # in a second terminal
```

🔐 The backend reads its secrets from the Convex deployment, not from `.env.local`. The keys it
expects are listed in [.env.example](.env.example).

✅ `pnpm verify` runs typecheck, lint, the project's rule checks and the test suite. CI runs it on
every push.

## 📚 Documentation

- 🎯 [docs/PRODUCT.md](docs/PRODUCT.md): what the app is for, and what it refuses to be
- 🏗️ [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): layers and data flow
- 📏 [docs/CONVENTIONS.md](docs/CONVENTIONS.md): naming and where code goes
- 🧭 [docs/adr/](docs/adr/): the decisions that constrain the code
- 🤖 [AGENTS.md](AGENTS.md): the rules coding agents follow in this repo

## 📄 License

Copyright (c) 2026 Sellest-AI. All rights reserved.

The source is published so it can be read. It may not be used, copied, modified or redistributed
without written permission. The full terms are in [LICENSE](LICENSE).
