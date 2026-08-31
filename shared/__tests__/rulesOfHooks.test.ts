import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
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
  // A top-level guard inside a component: two-space `if (...) {` whose body returns.
  const GUARD = /^\s{2}if\s*\(/;
  const RETURN = /^\s{4}return[\s(;]/;

  const offenders: string[] = [];

  const check = (file: string, src: string) => {
    const lines = src.split('\n');
    let guardLine = -1;

    for (let i = 0; i < lines.length; i++) {
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

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (['node_modules', 'dist', 'build', '.git', '__tests__'].includes(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx$/.test(entry)) continue;
      check(full, readFileSync(full, 'utf8'));
    }
  };

  it('every hook runs on every render', () => {
    walk(APPS);
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
