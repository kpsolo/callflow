import { useRef, useState } from "react";
import { parseAndValidate } from "./exportImport";
import type { Flow } from "@/schema";
import "./ImportDialog.css";

export function ImportDialog({
  hasContent,
  onConfirm,
  onClose,
}: {
  hasContent: boolean;
  onConfirm: (flow: Flow) => void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [warning, setWarning] = useState<string | undefined>();
  const [preview, setPreview] = useState<Flow | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const validate = (text: string) => {
    const r = parseAndValidate(text);
    setErrors(r.errors ?? []);
    setWarning(r.warning);
    setPreview(r.flow ?? null);
  };

  const onFile = (f: File) => {
    f.text().then((t) => {
      setRaw(t);
      validate(t);
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import flow">
      <div className="modal">
        <header>
          <strong>Import flow JSON</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="modal-body">
          <div className="import-controls">
            <button type="button" onClick={() => fileRef.current?.click()}>
              Choose file…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <span className="import-hint">or paste below</span>
          </div>
          <textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              if (e.target.value.trim()) validate(e.target.value);
              else {
                setErrors([]);
                setWarning(undefined);
                setPreview(null);
              }
            }}
            placeholder='{"schema_version":"1.0", …}'
            rows={10}
          />

          {warning && <div className="import-warning">{warning}</div>}
          {errors.length > 0 && (
            <ul className="import-errors">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {preview && (
            <div className="import-preview">
              <strong>Preview:</strong> {preview.entity.type} · {preview.entity.id} ·{" "}
              {preview.nodes.length} nodes · {preview.edges.length} edges ·{" "}
              {preview.scenarios.length} scenarios
            </div>
          )}
          {hasContent && preview && (
            <div className="import-warning">
              Existing workspace will be <strong>replaced</strong>.
            </div>
          )}
        </div>

        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!preview}
            onClick={() => preview && onConfirm(preview)}
          >
            Replace
          </button>
        </footer>
      </div>
    </div>
  );
}
