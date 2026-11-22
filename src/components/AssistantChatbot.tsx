import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAssistantProcess } from "../auth/AssistantProcessContext";
import { useAuth } from "../auth/AuthContext";
import { askAssistant, type ChatMessage } from "../lib/assistantChat";
import { buildNextSteps } from "../lib/processAssistantHints";

type Props = {
  context?: {
    jobTitle?: string | null;
    orgUnit?: string | null;
  };
};

const NEXT_STEPS_PROMPT =
  "Co mam teraz zrobić? Podaj 2–3 konkretne kroki na bieżącym etapie otwartego procesu (albo ogólnie, jeśli procesu nie ma).";

const PANEL_MIN_W = 320;
const PANEL_BASE_W = 380;
const PANEL_MIN_H = 360;

/** Max szerokość = 1/4 ekranu, ale nigdy mniej niż rozmiar bazowy. */
function clampPanelSize(w: number, h: number): { w: number; h: number } {
  const maxW = Math.min(
    Math.max(PANEL_BASE_W, window.innerWidth * 0.25),
    window.innerWidth - 18,
  );
  const maxH = window.innerHeight - 88;
  return {
    w: Math.round(Math.min(Math.max(w, PANEL_MIN_W), maxW)),
    h: Math.round(Math.min(Math.max(h, PANEL_MIN_H), maxH)),
  };
}

export function AssistantChatbot({ context }: Props) {
  const { profile } = useAuth();
  const { openProcess } = useAssistantProcess();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelSize, setPanelSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    if (!panel) return;
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    function onMove(ev: PointerEvent) {
      setPanelSize(
        clampPanelSize(
          rect.width + (startX - ev.clientX),
          rect.height + (startY - ev.clientY),
        ),
      );
    }
    function onUp() {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    }
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  useEffect(() => {
    if (!panelSize) return;
    function onWindowResize() {
      setPanelSize((s) => (s ? clampPanelSize(s.w, s.h) : s));
    }
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, [panelSize]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (busy || !trimmed) return;

    const nextHistory: ChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];
    setError(null);
    setBusy(true);
    setMessages(nextHistory);
    setDraft("");

    try {
      const reply = await askAssistant({
        userText: trimmed,
        history: nextHistory.slice(0, -1),
        profileContext: {
          jobTitle: context?.jobTitle ?? profile?.job_title,
          orgUnit: context?.orgUnit ?? profile?.org_unit,
        },
        openProcess,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : "Nie udało się uzyskać odpowiedzi",
      );
    } finally {
      setBusy(false);
    }
  }

  const stageHint = openProcess
    ? `Etap ${openProcess.viewStage}/3 · ${
        openProcess.evaluationType === "periodic" ? "okresowa" : "pierwsza"
      }${openProcess.sheetType && openProcess.sheetType !== "first" ? ` · ${openProcess.sheetType}` : ""}`
    : null;

  return (
    <div className={`assistant-root${open ? " is-open" : ""}`}>
      {open ? (
        <div
          ref={panelRef}
          className="assistant-panel"
          role="dialog"
          aria-label="Asystent AI"
          style={
            panelSize
              ? {
                  width: panelSize.w,
                  height: panelSize.h,
                  maxHeight: "none",
                }
              : undefined
          }
        >
          <div
            className="assistant-resize"
            onPointerDown={startResize}
            onDoubleClick={() => setPanelSize(null)}
            title="Przeciągnij, aby powiększyć (dwuklik — rozmiar domyślny)"
            aria-hidden="true"
          />
          <div className="assistant-head">
            <div>
              <strong>Asystent AI</strong>
              <p className="muted">
                {stageHint
                  ? `Kontekst otwartego procesu: ${stageHint}`
                  : "Pytania o przepisy i proces oceny"}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={() => setOpen(false)}
              aria-label="Zamknij asystenta"
            >
              Zamknij
            </button>
          </div>

          <div className="assistant-quick">
            <button
              type="button"
              className="btn btn-pdf-glow btn-small"
              disabled={busy}
              onClick={() => void send(NEXT_STEPS_PROMPT)}
              title={
                openProcess
                  ? buildNextSteps(openProcess).join(" · ")
                  : "Ogólne wskazówki procesu"
              }
            >
              Co mam teraz zrobić?
            </button>
          </div>

          <div className="assistant-messages" ref={listRef}>
            {messages.length === 0 && !busy ? (
              <p className="muted assistant-empty">
                {openProcess
                  ? "Widzę otwarty proces (etap, terminy, sprawozdanie/uwagi). Zapytaj albo kliknij „Co mam teraz zrobić?”."
                  : "Otwórz proces, żeby dostać wskazówki pod etap — albo pytaj ogólnie o przepisy i B/C."}
              </p>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`assistant-bubble assistant-bubble-${m.role}`}
              >
                <span className="assistant-bubble-label">
                  {m.role === "user" ? "Ty" : "Asystent"}
                </span>
                <div className="assistant-bubble-body md-out">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {busy ? (
              <p className="muted assistant-typing">Asystent pisze…</p>
            ) : null}
            {error ? <div className="alert alert-warn">{error}</div> : null}
          </div>

          <div className="assistant-compose">
            <textarea
              className="textarea"
              rows={3}
              value={draft}
              disabled={busy}
              placeholder="Np. czym różni się B od C? kiedy uzasadnienie jest obowiązkowe?"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !draft.trim()}
              onClick={() => void send(draft)}
            >
              Wyślij
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="assistant-fab"
        aria-expanded={open}
        aria-label={open ? "Ukryj asystenta AI" : "Otwórz asystenta AI"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "×" : "AI"}
      </button>
    </div>
  );
}
