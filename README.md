# Roster Tracker

Workspace for the Roster Tracker app and its supporting API, shared libraries, and mockup sandbox.

## Run and verify

- `pnpm --filter @workspace/roster-tracker dev` starts the app on port 5173.
- `pnpm --filter @workspace/api-server dev` starts the API server on port 5000.
- `pnpm run typecheck` checks the workspace.
- `pnpm run build` typechecks and builds all packages.

## Stack

- pnpm workspaces, Node.js 24, and TypeScript 5.9
- React and Vite for the roster tracker and mockup sandbox
- Express 5, PostgreSQL, and Drizzle ORM for the API and database
- OpenAPI, Orval, and Zod for API contracts and generated clients