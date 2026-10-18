import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useI18n } from "../i18n";
import { Icon } from "./Icon";

export type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  detail?: string | undefined;
}

type Push = (kind: ToastKind, message: string, detail?: string) => void;
const Ctx = createContext<Push>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const { t } = useI18n();

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((x) => x.id !== id));
  }, []);

  const push = useCallback<Push>(
    (kind, message, detail) => {
      const id = next.current++;
      setToasts((ts) => [...ts.slice(-3), { id, kind, message, detail }]);
      window.setTimeout(
        () => {
          dismiss(id);
        },
        kind === "error" ? 9000 : 4500,
      );
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-relevant="additions">
        {toasts.map((x) => (
          <div
            key={x.id}
            className={`toast toast-${x.kind}`}
            role={x.kind === "error" ? "alert" : "status"}
          >
            <Icon name={x.kind === "error" ? "alert" : x.kind === "success" ? "check" : "info"} />
            <div className="toast-text">
              <strong>{x.message}</strong>
              {x.detail && <span>{x.detail}</span>}
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={t("action.close")}
              onClick={() => {
                dismiss(x.id);
              }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = (): Push => useContext(Ctx);

/** Normalise a thrown value from `invoke` into a message. */
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
