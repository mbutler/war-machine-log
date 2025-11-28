## War Machine: BECMI D&D Campaign Engine

War Machine is a **Rules Cyclopedia–faithful BECMI simulator** for running long-form Dungeons & Dragons campaigns.  
It collects all the classic sub-games into a single SPA:

- **Party Registry**: BECMI-compliant character generation, XP, saving throws, spell slots, thief skills, retainers.
- **Dungeon Delver**: Turn-based dungeon exploration with encounters, treasure, torches, morale, and XP awards.
- **The Royal Cartographer**: Wilderness hexcrawl with 6‑mile hexes, terrain, weather, foraging, getting lost, and encounters.
- **Dominion, Stronghold, Siege, Merchant, Lab, Calendar, Ledger**: Name-level play—domains, battles, trade, magic research, campaign time, and economy—wired together under one state tree.

For detailed mechanics and walkthroughs, see `docs/user-guide.md`.

---

## Running the App (Bun)

This project uses **[Bun](https://bun.sh)** for bundling and dev workflow.

1. **Install Bun** (if you don’t have it yet):
   - macOS (with Homebrew): `brew install oven-sh/bun/bun`
   - Or follow the installer instructions at the Bun website.

2. **Install dependencies** (Bun handles this automatically from `package.json`):

```bash
cd war-machine
bun install
```

3. **Start the dev build** (watches and rebuilds `public/build/main.js`):

```bash
bun run dev
```

4. **Open the app**:
   - Serve the `public/` folder with your static file server of choice (or use `bun dev`/an editor plugin).
   - Open `public/index.html` in a browser pointing at the built assets in `public/build/`.

To produce a one-off build without watching:

```bash
bun run build
```
