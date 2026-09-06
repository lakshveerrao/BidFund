import { useMemo } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';

export const USERNAME_RE = /^[a-z0-9_]{1,24}$/;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
}

// Usernames are public profile rows, so availability is checked live in the
// browser; the reducer re-checks atomically on claim.
export function useUsernames() {
  const [profiles] = useTable(tables.profile);
  return useMemo(() => new Set(profiles.map(p => p.username).filter(Boolean)), [profiles]);
}

export function suggestUsernames(name: string, taken: Set<string>): string[] {
  const base = slugify(name) || 'builder';
  const seeds = [
    base,
    `${base}_builds`,
    `${base}${Math.floor(10 + Math.random() * 90)}`,
    `${base}_hw`,
    `${base}_${new Date().getFullYear() % 100}`,
    `${base}${Math.floor(100 + Math.random() * 900)}`,
  ];
  const out: string[] = [];
  for (const s of seeds) {
    const u = s.slice(0, 24);
    if (USERNAME_RE.test(u) && !taken.has(u) && !out.includes(u)) out.push(u);
    if (out.length === 3) break;
  }
  return out;
}

export default function UsernameField({
  value,
  onChange,
  name,
  taken,
}: {
  value: string;
  onChange: (v: string) => void;
  name: string;
  taken: Set<string>;
}) {
  const clean = value.trim().toLowerCase();
  const suggestions = useMemo(() => suggestUsernames(name, taken), [name, taken]);
  const state = !clean ? 'empty' : !USERNAME_RE.test(clean) ? 'invalid' : taken.has(clean) ? 'taken' : 'ok';
  return (
    <label className="field">
      <span>Username (required)</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24))}
        placeholder={suggestions[0] ?? 'underdogbuilder'}
        maxLength={24}
        autoComplete="off"
        required
      />
      <div className={`unote ${state}`}>
        {state === 'empty' && 'Letters, numbers, underscore. Up to 24.'}
        {state === 'invalid' && 'Letters, numbers, underscore only.'}
        {state === 'taken' && `@${clean} is taken — try one of these.`}
        {state === 'ok' && `@${clean} is available ✓`}
      </div>
      {(state !== 'ok' || !clean) && suggestions.length > 0 && (
        <div className="suggest">
          {suggestions.map(s => (
            <button key={s} type="button" className="chip" onClick={() => onChange(s)}>
              @{s}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
