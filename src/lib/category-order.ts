import type { GaapType } from "@/api/gaap";

export type Cat = {
  id: string;
  name: string;
  type: GaapType;
  parent_category?: string | null | undefined;
  sort_order?: number | undefined;
};

/** Chart order, with each sub-category listed (indented) right under its parent. */
export function orderWithChildren<T extends Cat>(list: T[]): (T & { depth: number })[] {
  const ids = new Set(list.map((c) => c.id));
  const key = (c: T) => [c.sort_order || 1e6, c.name.toLowerCase()] as const;
  const cmp = (a: T, b: T) => {
    const [ao, an] = key(a);
    const [bo, bn] = key(b);
    return ao - bo || an.localeCompare(bn);
  };
  const out: (T & { depth: number })[] = [];
  for (const top of list
    .filter((c) => !c.parent_category || !ids.has(c.parent_category))
    .sort(cmp)) {
    out.push({ ...top, depth: 0 });
    for (const kid of list.filter((c) => c.parent_category === top.id).sort(cmp))
      out.push({ ...kid, depth: 1 });
  }
  return out;
}
