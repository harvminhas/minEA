/** "No known AI features" names, A-Z, each once with how many times it appears ("Procore ×7"). */
export function groupNames(names: readonly string[]): { name: string; count: number }[] {
  const byKey = new Map<string, { name: string; count: number }>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const hit = byKey.get(key);
    if (hit) hit.count += 1;
    else byKey.set(key, { name, count: 1 });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

export function othersLine(total: number): string {
  return `${total} app${total === 1 ? " has" : "s have"} no known AI features`;
}
