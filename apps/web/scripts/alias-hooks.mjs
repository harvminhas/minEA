const root = new URL("../", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return { url: new URL(`${specifier.slice(2)}.ts`, root).href, shortCircuit: true };
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (!/\.(ts|tsx|js|jsx|json|mjs|cjs)$/.test(specifier)) {
      const parent = context.parentURL ?? "";
      const ext = parent.endsWith(".js") ? ".js" : ".ts";
      return { url: new URL(`${specifier}${ext}`, context.parentURL).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.split("?")[0].endsWith(".json")) {
    return nextLoad(url, {
      ...context,
      importAttributes: { ...(context.importAttributes ?? {}), type: "json" },
    });
  }
  return nextLoad(url, context);
}
