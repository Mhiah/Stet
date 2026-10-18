"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { trace, refKind, type RefKind } from "@/lib/trace";
import type { ResearchProject } from "@/lib/types";

/**
 * Every record ID (S3, C7, A2, X1) renders as a chip that opens the audit trail for it.
 * The panel keeps a history stack so you can follow a chain and step back.
 */

type RefsContext = { project: ResearchProject; open: (id: string) => void };

const Ctx = createContext<RefsContext | null>(null);

function useRefs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Ref chips must be inside <RefsProvider>.");
  return ctx;
}

/** Opens the audit-trail panel for a record, for buttons that aren't ID chips. */
export function useTrace() {
  return useRefs().open;
}

export const KIND_LABEL: Record<RefKind, string> = {
  source: "Source",
  claim: "Claim",
  assumption: "Assumption",
  challenge: "Challenge",
};

const KIND_STYLE: Record<RefKind, string> = {
  source: "bg-surface text-muted ring-line",
  claim: "bg-info-soft text-info ring-info/20",
  assumption: "bg-accent-soft text-accent ring-accent/20",
  challenge: "bg-bad-soft text-bad ring-bad/20",
};

export function Ref({ id }: { id: string }) {
  const { open } = useRefs();
  const kind = refKind(id);
  if (!kind) return <span>{id}</span>;
  return (
    <button
      type="button"
      onClick={() => open(id)}
      title={`${KIND_LABEL[kind]} ${id}: show where it comes from and what relies on it`}
      className={`mx-0.5 inline-flex items-center rounded px-1.5 py-px align-baseline font-mono text-[0.75em] font-medium ring-1 ring-inset transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current ${KIND_STYLE[kind]}`}
    >
      {id}
    </button>
  );
}

export function RefList({ ids, label }: { ids: string[]; label?: string }) {
  if (ids.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-y-1 text-sm">
      {label && <span className="mr-1 text-xs text-muted">{label}</span>}
      {ids.map((id) => (
        <Ref key={id} id={id} />
      ))}
    </span>
  );
}

const ID_PATTERN = /\b([SCAX]\d{1,3})\b/;

/** Text from SERV cites IDs inline ("… (C3, X2)"); turn the ones that exist into chips. */
export function Linked({ text }: { text: string }) {
  const { project } = useRefs();
  const parts = text.split(new RegExp(ID_PATTERN, "g"));
  return <>{parts.map((part, i) => (i % 2 === 1 && trace(project, part) ? <Ref key={i} id={part} /> : part))}</>;
}

export function RefsProvider({ project, children }: { project: ResearchProject; children: ReactNode }) {
  const [stack, setStack] = useState<string[]>([]);
  const open = useCallback((id: string) => setStack((s) => (s.at(-1) === id ? s : [...s, id])), []);
  const close = useCallback(() => setStack([]), []);

  useEffect(() => {
    if (!stack.length) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stack.length, close]);

  return (
    <Ctx.Provider value={{ project, open }}>
      {children}
      {stack.length > 0 && (
        <TracePanel id={stack.at(-1)!} canGoBack={stack.length > 1} onBack={() => setStack((s) => s.slice(0, -1))} onClose={close} />
      )}
    </Ctx.Provider>
  );
}

function TracePanel({ id, canGoBack, onBack, onClose }: { id: string; canGoBack: boolean; onBack: () => void; onClose: () => void }) {
  const { project } = useRefs();
  const node = trace(project, id);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Audit trail for ${id}`}>
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-black/30" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-background shadow-xl">
        <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-background px-4 py-3">
          {canGoBack && (
            <button type="button" onClick={onBack} className="rounded px-2 py-1 text-sm text-muted hover:bg-surface">
              ← Back
            </button>
          )}
          <p className="text-sm font-medium">
            {node ? KIND_LABEL[node.kind] : "Record"} <span className="font-mono">{id}</span>
          </p>
          <button type="button" onClick={onClose} className="ml-auto rounded px-2 py-1 text-sm text-muted hover:bg-surface">
            Close
          </button>
        </div>

        {!node ? (
          <p className="p-4 text-sm text-muted">This record isn&apos;t in the project yet.</p>
        ) : (
          <div className="space-y-6 p-4">
            <div>
              <p className="leading-relaxed">{node.title}</p>
              {node.meta.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {node.meta.map((m) => (
                    <span key={m} className="rounded bg-surface px-1.5 py-0.5 text-xs text-muted">
                      {m}
                    </span>
                  ))}
                </p>
              )}
              {node.body && (
                <blockquote className="mt-3 whitespace-pre-line border-l-2 border-line pl-3 text-sm text-muted">{node.body}</blockquote>
              )}
              {node.url && (
                <a href={node.url} target="_blank" rel="noreferrer" className="mt-3 inline-block break-all text-sm text-info underline underline-offset-2">
                  {node.url} ↗
                </a>
              )}
            </div>

            {node.restsOn.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Rests on</h3>
                {node.restsOn.map((link) => (
                  <div key={link.label} className="mt-2">
                    <p className="text-xs text-muted">{link.label}</p>
                    <ul className="mt-1 space-y-1">
                      {link.ids.map((ref) => (
                        <li key={ref} className="flex items-start gap-2 text-sm">
                          <Ref id={ref} />
                          <span className="line-clamp-2 text-muted">{trace(project, ref)?.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Used by</h3>
              {node.usedBy.length === 0 ? (
                <p className="mt-2 text-sm text-muted">Nothing later in the reasoning cites this.</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {node.usedBy.map((u, i) => (
                    <li key={i} className="rounded border border-line p-2.5 text-sm">
                      <p className="flex flex-wrap items-center gap-1 text-xs font-medium text-muted">
                        {u.label}
                        {u.ids.filter((ref) => ref !== id && !u.label.includes(ref)).map((ref) => (
                          <Ref key={ref} id={ref} />
                        ))}
                      </p>
                      {u.text && (
                        <p className="mt-1 line-clamp-4">
                          <Linked text={u.text} />
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
