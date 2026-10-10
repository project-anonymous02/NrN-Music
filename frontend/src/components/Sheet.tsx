import { AnimatePresence, motion } from "motion/react";
import { useEffect, type ReactNode } from "react";
import { useSettings } from "../stores/settings";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  labelledBy?: string;
}

/** Bottom sheet on phones, centred dialog on wide screens. */
export function Sheet({ open, onClose, title, children, labelledBy }: SheetProps) {
  const animate = useSettings((state) => state.settings.animation.sheetAnimation);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sheet-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: animate ? 0.18 : 0 }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={animate ? { y: 60, opacity: 0.6 } : false}
            animate={{ y: 0, opacity: 1 }}
            exit={animate ? { y: 60, opacity: 0 } : { opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-grip" aria-hidden="true" />
            {title && (
              <h2 className="sheet-title" id={labelledBy}>
                {title}
              </h2>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
