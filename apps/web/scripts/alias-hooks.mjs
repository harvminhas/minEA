const root = new URL("../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return { url: new URL(`${specifier.slice(2)}.ts`, root).href, shortCircuit: true };
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (!/\.(ts|js|json|mjs|cjs)$/.test(specifier)) {
      return { url: new URL(`${specifier}.ts`, context.parentURL).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
