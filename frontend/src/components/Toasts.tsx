import { AnimatePresence, motion } from "motion/react";
import { useT } from "../hooks/useT";
import { useUi } from "../stores/ui";

export function Toasts() {
  const t = useT();
  const toasts = useUi((state) => state.toasts);
  const dismiss = useUi((state) => state.dismissToast);
  const announce = useUi((state) => state.announce);

  return (
    <>
      <div className="toast-stack" aria-live="polite">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.button
              key={toast.id}
              type="button"
              className={`toast${toast.tone === "error" ? " error" : ""}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => dismiss(toast.id)}
            >
              {toast.text}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {announce ?? ""}
      </div>
      <span className="sr-only">{t("app.name")}</span>
    </>
  );
}
