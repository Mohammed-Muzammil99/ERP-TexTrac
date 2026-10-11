import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, RotateCcw, Send, HelpCircle, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  type?: 'success' | 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm & Proceed',
  cancelText = 'Cancel',
  type = 'info',
  onConfirm,
  onCancel,
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          icon: <RotateCcw className="w-6 h-6 text-rose-500" />,
          iconBg: 'bg-rose-500/10 text-rose-500 border border-rose-500/20',
          btnBg: 'bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-600/30 text-white',
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="w-6 h-6 text-emerald-500" />,
          iconBg: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20',
          btnBg: 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 text-white',
        };
      case 'warning':
        return {
          icon: <AlertCircle className="w-6 h-6 text-amber-500" />,
          iconBg: 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
          btnBg: 'bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-600/30 text-white',
        };
      default:
        return {
          icon: <Send className="w-6 h-6 text-indigo-500" />,
          iconBg: 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20',
          btnBg: 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 text-white',
        };
    }
  };

  const style = getTypeStyles();

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="bg-bg2 border border-bg4 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className={`p-3 rounded-2xl shrink-0 ${style.iconBg}`}>
                {style.icon}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h4 className="text-sm font-black uppercase tracking-wider text-text">{title}</h4>
                <div className="text-xs text-text3 mt-2 leading-relaxed">
                  {message}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="text-text3 hover:text-text p-1 rounded-lg hover:bg-bg3 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-bg4">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="px-5 py-2.5 bg-bg3 hover:bg-bg4 text-text font-black text-xs uppercase tracking-wider rounded-xl transition-all border border-bg4 cursor-pointer disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-6 py-2.5 font-black text-xs uppercase tracking-wider text-center rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer ${style.btnBg}`}
            >
              {isLoading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : null}
              {confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
