export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${stableStringify(item)}`
      )
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function getHash(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
}

export function getCacheKey(payload: unknown, prefix = ""): string {
  const value = stableStringify(payload);
  return `${prefix}${getHash(value)}`;
}