// Detector de comentarios largos (convención en docs/codigo/README.md, §3 y §10).
// Uso: `pnpm lint:comments [rutas...]`; sin rutas revisa `src/`. Sale con 1 si hay hallazgos.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const MAX_LINE_COMMENTS = 2; // `//` seguidos
const MAX_BLOCK_LINES = 6; // `/**` + 4 de descripción + `*/` (las líneas `* @tag` no cuentan)
const MAX_HTML_LINES = 1;
const EXTENSIONS = ['.ts', '.scss', '.html'];

function* walk(path) {
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) yield* walk(join(path, entry));
  } else if (EXTENSIONS.some((ext) => path.endsWith(ext))) {
    yield path;
  }
}

function check(file) {
  const findings = [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  let run = 0;
  let runStart = 0;
  let block = null; // { start, lines, limit }

  const closeRun = () => {
    if (run > MAX_LINE_COMMENTS) findings.push(`${runStart}: ${run} líneas seguidas de //`);
    run = 0;
  };

  lines.forEach((line, index) => {
    const n = index + 1;
    if (block) {
      if (!/^[ \t]*\*[ \t]*@/.test(line)) block.lines++;
      if (/\*\/|-->/.test(line)) {
        if (block.lines > block.limit) {
          findings.push(`${block.start}: bloque con ${block.lines} líneas sin tag (máx. ${block.limit})`);
        }
        block = null;
      }
      return;
    }
    if (/^[ \t]*\/\//.test(line)) {
      if (!run) runStart = n;
      run++;
      return;
    }
    closeRun();
    if (/^[ \t]*\/\*/.test(line) && !/\*\//.test(line)) {
      block = { start: n, lines: 1, limit: MAX_BLOCK_LINES };
    } else if (/^[ \t]*<!--/.test(line) && !/-->/.test(line)) {
      block = { start: n, lines: 1, limit: MAX_HTML_LINES };
    }
  });
  closeRun();
  return findings;
}

const roots = process.argv.slice(2);
let total = 0;
for (const root of roots.length ? roots : ['src']) {
  for (const file of walk(root)) {
    for (const finding of check(file)) {
      console.log(`${relative(process.cwd(), file).replaceAll('\\', '/')}:${finding}`);
      total++;
    }
  }
}
console.log(total ? `\n${total} hallazgo(s). Ver docs/codigo/README.md.` : 'Sin comentarios largos.');
process.exit(total ? 1 : 0);
