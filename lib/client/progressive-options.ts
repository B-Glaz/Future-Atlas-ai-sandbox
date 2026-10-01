export const MORE_OPTION = "__future_atlas_more__";

export function getProgressiveOptions<T>(options: T[], isExpanded: boolean) {
  if (isExpanded || options.length <= 4) return options;
  return [...options.slice(0, 4), MORE_OPTION as T];
}