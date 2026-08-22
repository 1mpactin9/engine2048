<div align="center">
  <h1>2048 Engine</h1>

  <p>
    <a href="#prerequisites">Prerequisites</a> • 
    <a href="#getting-started">Quick Start</a> • 
    <a href="#commands">Dev</a>
  </p>

  <a href="LICENSE"><img src="https://img.shields.io/github/license/1mpactin9/engine2048" alt="License"></a>
  <a href="https://github.com/1mpactin9/engine2048/actions"><img src="https://img.shields.io/github/actions/workflow/status/1mpactin9/engine2048/ci.yml" alt="Actions"></a>

</div>

## Prerequisites

Ensure you have the following tools installed locally:

* **Node.js:** `>=18.0.0`
* **pnpm:** `>=8.0.0` (Install via `npm install -g pnpm` or `corepack enable`)

## Getting Started

### 1. Clone

```bash
git clone https://github.com/1mpactin9/engine2048
cd engine2048
```

### 2. Dependencies

Install all workspace dependencies at once:

```bash
pnpm install
```

### 3. Build

```bash
pnpm build
```

```bash
pnpm --filter backend test
```

### 4. Frontend

```bash
pnpm dev

# or
pnpm --filter frontend dev
```

## Commands

You can run commands for the entire project from the root directory or target individual applications directly.

### Running Applications

| Command | Description |
| --- | --- |
| `pnpm dev` | Run both frontend and backend concurrently in dev mode |
| `pnpm --filter frontend dev` | Run **frontend** dev server only |
| `pnpm --filter backend dev` | Run **backend** dev server only |

### Building for Production

| Command | Description |
| --- | --- |
| `pnpm build` | Build all apps and shared packages |
| `pnpm --filter frontend build` | Build frontend production assets |
| `pnpm --filter backend build` | Compile backend service |

### Testing & Quality Checks

| Command | Description |
| --- | --- |
| `pnpm test` | Run test suites across all packages |
| `pnpm lint` | Run ESLint across all packages |
| `pnpm format` | Run Prettier code formatting |

## Adding Dependencies

Always add dependencies through `pnpm` workspace filters rather than installing directly inside workspace directories.

```bash
# Add a dependency to the frontend
pnpm --filter frontend add axios

# Add a dev dependency to the backend
pnpm --filter backend add -D @types/node

# Add a shared dependency across all workspaces
pnpm add -w -D typescript prettier
```

## License

**Copyright (C) 2026 1mpactin9.**
This project is licensed under the GNU General Public License v3.0.

## Credits

This project interacts with the following external open-source tools:

- [game-difficulty/2048EndgameTablebase](https://github.com/game-difficulty/2048EndgameTablebase) - Licensed under GPL-3.0
- [gabrielecirulli/2048](https://github.com/gabrielecirulli/2048) - Licensed under MIT
- [nneonneo/2048-ai](https://github.com/nneonneo/2048-ai) - Licensed under MIT
- [ziap/2048-ai](https://github.com/ziap/2048-ai) - Licensed under MIT

&nbsp;

> _If you are a **rights holder** and believe that any content in this repository infringes upon your copyright, trademark, or intellectual property rights, please contact the repository maintainer directly._
