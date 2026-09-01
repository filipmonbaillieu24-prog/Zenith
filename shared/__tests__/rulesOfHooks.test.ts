import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

/**
 * A hook called after an early return is a crash waiting for a state change.
 *
 * React counts hooks per render. A component that returns early while loading runs
 * fewer of them than the same component once loading finishes, and the moment the
 * extra ones appear React throws "rendered more hooks than during the previous
 * render" and the page goes blank.
 *
 * This shipped. Three useMemo calls were added below `if (loadingSession) return`
 * in Kratos, and the symptom was a loading spinner followed by a black screen.
 * Neither tsc nor vite build can see it - both are perfectly happy - and it does
 * not reproduce on a login gate, because that is an early return too, so the
 * broken path is never reached until someone signs in with real data.
 *
 * eslint-plugin-react-hooks is the proper tool for this and the repo has no ESLint
 * at all. Until it does, this is the guard.
 */
describe('no hooks after an early return', () => {
  const REPO = join(__dirname, '..', '..');
  const APPS = join(REPO, 'apps');

  const HOOK = /^\s{2}(?:const\s+[\w{}[\],\s:]+\s*=\s*)?(useMemo|useState|useEffect|useCallback|useRef|useReducer|useContext)\s*\(/;
  // A top-level guard inside a component: two-space `if (...)` whose body returns.
  const GUARD = /^\s{2}if\s*\(/;
  const RETURN = /^\s{4}return[\s(;]/;
  // The same guard written on one line. RunModal had `if (!isOpen) return null;`
  // directly above sixteen useState calls, and this test walked straight past it
  // because it only ever looked for the return on a FOLLOWING line.
  const INLINE_GUARD = /^\s{2}if\s*\(.*\)\s*return[\s(;]/;
  // A guard only applies to the component it is in. Without this, a small helper
  // component with an early return made every hook in every component BELOW it in
  // the same file look like a violation.
  const NEW_TOP_LEVEL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|class)\s/;

  const offenders: string[] = [];

  const check = (file: string, src: string) => {
    const lines = src.split('\n');
    let guardLine = -1;

    for (let i = 0; i < lines.length; i++) {
      if (NEW_TOP_LEVEL.test(lines[i])) guardLine = -1;
      if (guardLine === -1 && INLINE_GUARD.test(lines[i])) {
        guardLine = i + 1;
        continue;
      }
      if (guardLine === -1 && GUARD.test(lines[i])) {
        // Does this guard's body return? Look at the next few lines only.
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (RETURN.test(lines[j])) { guardLine = i + 1; break; }
          if (/^\s{2}\}/.test(lines[j])) break;
        }
        continue;
      }
      if (guardLine !== -1 && HOOK.test(lines[i])) {
        offenders.push(
          `${relative(REPO, file)}:${i + 1} — ${lines[i].trim().slice(0, 60)} (guard at line ${guardLine})`
        );
        return; // one report per file is enough to act on
      }
    }
  };

  // withFileTypes rather than a statSync per entry. This walk crosses two Android
  // projects as well as the web apps, and on Windows the extra syscall per file took
  // the test to ~4.5s against vitest's 5s default - so it passed on an idle machine
  // and failed as a timeout whenever anything else was running. That is what the
  // intermittent "2 failed" runs were.
  const SKIP = new Set(['node_modules', 'dist', 'build', '.git', '__tests__', '.gradle', 'gradle', '.idea', 'coverage']);
  let visited = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.tsx$/.test(entry.name)) continue;
      visited++;
      check(full, readFileSync(full, 'utf8'));
    }
  };

  it('every hook runs on every render', () => {
    walk(APPS);
    // A walk that quietly stops walking passes with zero offenders, which is the one
    // failure mode a greppy guard cannot survive. Hold the floor.
    expect(visited, 'the walk stopped finding components').toBeGreaterThan(60);
    expect(offenders).toEqual([]);
  });

  it('catches the shape that actually shipped', () => {
    // The Kratos regression, reduced.
    const broken = [
      'export default function App() {',
      '  const [loading, setLoading] = useState(true);',
      '',
      '  if (loading) {',
      '    return <Spinner />;',
      '  }',
      '',
      '  const trends = useMemo(() => analyse(x), [x]);',
      '  return <div>{trends}</div>;',
      '}'
    ].join('\n');

    const found: string[] = [];
    const save = offenders.length;
    check('synthetic.tsx', broken);
    found.push(...offenders.slice(save));
    offenders.length = save;

    expect(found).toHaveLength(1);
    expect(found[0]).toContain('useMemo');
  });
});
