# Fruit Frenzy 🍉

A self-contained, responsive HTML5 fruit-slicing arcade game. It uses Canvas 2D, CSS, and vanilla JavaScript, with no backend, build step, API keys, or external game assets. Optional sound effects are synthesized with Web Audio after player interaction.

## Features

- Mouse, touch, and keyboard slicing controls
- 60-second rounds, score, best score saved locally, pause, resume, restart, and game-over screen
- Combo multiplier for quick consecutive fruit slices
- Bomb hazards: hitting one subtracts 10 points and resets the combo
- Original canvas-drawn fruit/bomb graphics, juice particles, slash trail, and score popups
- Optional sound toggle, responsive mobile layout, reduced-motion awareness, and swipe-only scroll suppression inside the game arena

## Run locally

Requirements: Node.js 18 or newer. No npm install is required.

```bash
npm start
```

Open <http://localhost:4173> in a browser. To use a different port, set `PORT`, for example `PORT=8080 npm start`.

You can also open `index.html` directly, but using the local server is recommended for testing browser storage and normal web serving behavior.

## Controls

- **Mouse / touch:** press and swipe across fruit.
- **Keyboard:** arrow keys create a quick slash through the center of the arena; `P` or `Escape` pauses/resumes; `R` restarts; `Enter` or `Space` starts from the opening/game-over screen.
- **Sound:** tap the speaker button in the top-right.

## Deploy to Vercel

### Option A: Vercel CLI

1. Install the Vercel CLI if needed: `npm i -g vercel`
2. From this directory, run `vercel` and follow the prompts.
3. For a production deployment, run `vercel --prod`.

### Option B: Git import

1. Push this project folder to a Git repository.
2. In the Vercel dashboard, import the repository.
3. Keep the framework preset as **Other** (or static site), leave the build command empty, and set the output directory to `.`.
4. Deploy. Vercel serves `index.html` and the static assets directly.

No environment variables or backend services are required.

## Test

```bash
npm test
```

The test suite performs static integrity checks and exercises core game math in a small isolated VM harness. Browser-specific visual/input checks should also be done in desktop and mobile browsers after deployment.
