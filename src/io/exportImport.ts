import { FlowSchema, SCHEMA_VERSION, type Flow } from "@/schema";

export interface ImportResult {
  ok: boolean;
  flow?: Flow;
  errors?: string[];
  warning?: string;
}

export function serialize(flow: Flow): string {
  return JSON.stringify(flow, null, 2);
}

export function parseAndValidate(raw: string): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return { ok: false, errors: [`Invalid JSON: ${(err as Error).message}`] };
  }

  if (typeof json !== "object" || json === null) {
    return { ok: false, errors: ["Top-level value must be an object."] };
  }

  const version = (json as { schema_version?: unknown }).schema_version;
  let warning: string | undefined;
  if (typeof version === "string") {
    const [maj] = version.split(".");
    if (maj !== "1") {
      return {
        ok: false,
        errors: [
          `Unsupported schema_version "${version}". This build supports 1.x flows only.`,
        ],
      };
    }
    if (version !== SCHEMA_VERSION) {
      warning = `Imported flow uses schema ${version} (current is ${SCHEMA_VERSION}). Imported anyway.`;
    }
  }

  const result = FlowSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
    };
  }
  return { ok: true, flow: result.data, warning };
}

export function downloadJson(flow: Flow): void {
  const json = serialize(flow);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${flow.entity.type}-${flow.entity.id}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
