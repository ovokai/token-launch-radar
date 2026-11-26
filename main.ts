// Token Launch Radar — the entry point for make.fun's token-radar-01 bounty.
// Node 22, standard library only: nothing to install, nothing fetched at run time.
//
// One run does five things, in this order:
//   1. locate the sealed snapshot (default /input/snapshot.json, override with --input)
//   2. score it with the model in lib/model.ts and refuse any board the gate would refuse
//   3. write board.json and data.js into the output directory
//   4. copy dashboard/ and screenshots/ across, checking the screenshots as they go
//   5. write dossier.json last — the judge's summary, assembled by vendor/makefun-board.ts
//
// The dashboard itself is plain static files (dashboard/index.html, app.css, app.js): it reads
// the data.js written in step 3, so the page and the board can never disagree.
//
// The output directory is --output when given, else $MAKEFUN_OUTPUT_DIR, else /output.
// Local run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** Absolute path of the folder main.ts sits in — the repository root. */
const repoRoot = fileURLToPath(new URL('.', import.meta.url));

// The gate's published caps (reference/gate.json), mirrored here so a bad run fails at
// build time instead of at scoring time.
const DOSSIER_TEXT_LIMIT = 65_536;
const SHOT_LIMITS = { max: 4, max_bytes: 524_288 };
const DASH_LIMITS = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME_OK = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/**
 * Read one command-line flag, either as `--name value` or as `--name=value`.
 * Falls back when the flag is absent, or when `--name` is the last argument.
 */
function flagValue(name: string, fallback: string): string {
  const argv = process.argv;
  const at = argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < argv.length) return argv[at + 1]!;
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  return inline === undefined ? fallback : inline.slice(prefix.length);
}

/** One diagnostic line on stderr, under the program's own name. */
function complain(message: string): void {
  process.stderr.write(`token radar: ${message}\n`);
}

// --- locate the snapshot ---------------------------------------------------------
// --input takes either the snapshot file itself or the directory holding it.

const inputGiven = flagValue('input', '/input');
const snapshotPath = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  complain(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`);
  process.exit(2);
}
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// --- score the snapshot, then check the board the way the gate will -------------

const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);

const problem = boardIssue(board, snapshot);
if (problem !== null) {
  complain(`the model wrote a board the gate refuses: ${problem}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

// --- copy the static assets across ------------------------------------------------

/**
 * Copy every regular file directly inside `from` into `to`, skipping dotfiles.
 * Returns the names copied, in directory order; a missing source copies nothing.
 */
function copyFlat(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const done: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const src = join(from, name);
    if (!statSync(src).isFile()) continue;
    copyFileSync(src, join(to, name));
    done.push(name);
  }
  return done;
}

copyFlat(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));

const shotsCopied = copyFlat(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shotsCopied.length < 3) {
  complain(`screenshots/ holds ${shotsCopied.length} image${shotsCopied.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
  process.exit(1);
}
for (const name of shotsCopied) {
  if (!SHOT_NAME_OK.test(name)) {
    complain(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
    process.exit(1);
  }
}

// --- the dossier goes last ---------------------------------------------------------
// The scorer rebuilds it from this output directory and compares bytes, so nothing
// may be written to the output after it.

writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_LIMIT, screenshots: SHOT_LIMITS, dashboard: DASH_LIMITS }),
);

// --- say what happened --------------------------------------------------------------

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')} (3 files), ${join(outDir, 'screenshots')} (${shotsCopied.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
