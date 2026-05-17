import { useFlowStore } from "@/state/store";
import type { Entity } from "@/schema";
import "./EntitySettingsModal.css";

const COMMON_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
];

export function EntitySettingsModal({ onClose }: { onClose: () => void }) {
  const entity = useFlowStore((s) => s.entity);
  const setEntity = useFlowStore((s) => s.setEntity);

  const patch = (next: Partial<Entity>) => setEntity({ ...entity, ...next } as Entity);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Entity settings">
      <div className="modal esm">
        <header>
          <strong>Entity settings — {entity.name}</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal-body">
          <div className="esm-field">
            <span className="esm-label">Type</span>
            <span className="esm-readonly">{entity.type}</span>
          </div>
          <div className="esm-field">
            <span className="esm-label">ID</span>
            <span className="esm-readonly">{entity.id}</span>
          </div>
          <label className="esm-field">
            <span className="esm-label">Name</span>
            <input
              value={entity.name}
              onChange={(e) => patch({ name: e.target.value } as Partial<Entity>)}
            />
          </label>
          {entity.type === "auto_attendant" ? (
            <label className="esm-field">
              <span className="esm-label">DID</span>
              <input
                value={entity.did}
                onChange={(e) => patch({ did: e.target.value } as Partial<Entity>)}
              />
            </label>
          ) : (
            <label className="esm-field">
              <span className="esm-label">Extension</span>
              <input
                value={entity.extension}
                onChange={(e) => patch({ extension: e.target.value } as Partial<Entity>)}
              />
            </label>
          )}
          <label className="esm-field">
            <span className="esm-label">
              Preferred IVR language
              <small className="esm-hint">
                Prompts are played in this language; account-level setting overrides per-call.
              </small>
            </span>
            <div className="esm-lang-row">
              <select
                value={entity.preferred_ivr_language ?? ""}
                onChange={(e) =>
                  patch({
                    preferred_ivr_language: e.target.value || undefined,
                  } as Partial<Entity>)
                }
              >
                <option value="">(system default)</option>
                {COMMON_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} ({l.code})
                  </option>
                ))}
              </select>
              <input
                placeholder="custom code"
                value={
                  entity.preferred_ivr_language &&
                  !COMMON_LANGUAGES.some((l) => l.code === entity.preferred_ivr_language)
                    ? entity.preferred_ivr_language
                    : ""
                }
                onChange={(e) =>
                  patch({
                    preferred_ivr_language: e.target.value || undefined,
                  } as Partial<Entity>)
                }
              />
            </div>
          </label>

          {entity.type === "auto_attendant" && (
            <section className="esm-directory">
              <div className="esm-directory-header">
                <span className="esm-label">Directory ({(entity.directory ?? []).length})</span>
                <button
                  type="button"
                  onClick={() =>
                    patch({
                      directory: [
                        ...(entity.directory ?? []),
                        { extension: "", name: "", published: true },
                      ],
                    } as Partial<Entity>)
                  }
                >
                  + Entry
                </button>
              </div>
              <p className="esm-hint">
                "Published" entries are visible to the Dial-by-Name directory.
              </p>
              <ul>
                {(entity.directory ?? []).map((d, i) => (
                  <li key={i}>
                    <input
                      placeholder="ext"
                      value={d.extension}
                      onChange={(e) => {
                        const next = [...(entity.directory ?? [])];
                        next[i] = { ...d, extension: e.target.value };
                        patch({ directory: next } as Partial<Entity>);
                      }}
                    />
                    <input
                      placeholder="name"
                      value={d.name}
                      onChange={(e) => {
                        const next = [...(entity.directory ?? [])];
                        next[i] = { ...d, name: e.target.value };
                        patch({ directory: next } as Partial<Entity>);
                      }}
                    />
                    <label className="esm-published">
                      <input
                        type="checkbox"
                        checked={d.published}
                        onChange={(e) => {
                          const next = [...(entity.directory ?? [])];
                          next[i] = { ...d, published: e.target.checked };
                          patch({ directory: next } as Partial<Entity>);
                        }}
                      />
                      published
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          directory: (entity.directory ?? []).filter((_, j) => j !== i),
                        } as Partial<Entity>)
                      }
                      aria-label="Remove entry"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer>
          <button type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
