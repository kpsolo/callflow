/** Dotted-path get/set/delete utilities used by the Inspector to edit nested node data. */

type Obj = Record<string, unknown>;

export function getAtPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, seg) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Obj)[seg];
  }, obj);
}

/** Returns a NEW object with the value set at `path`. Empty-string / undefined values clear the leaf. */
export function setAtPath(obj: Obj, path: string, value: unknown): Obj {
  const segs = path.split(".");
  const next = { ...obj };
  let cursor: Obj = next;
  for (let i = 0; i < segs.length - 1; i++) {
    const key = segs[i];
    const existing = cursor[key];
    const cloned: Obj = existing && typeof existing === "object" ? { ...(existing as Obj) } : {};
    cursor[key] = cloned;
    cursor = cloned;
  }
  const leaf = segs[segs.length - 1];
  if (value === undefined || value === "") {
    delete cursor[leaf];
  } else {
    cursor[leaf] = value;
  }
  return next;
}
