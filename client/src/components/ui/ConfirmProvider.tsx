import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Modal } from './Modal';

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
};

type ConfirmContextValue = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

  const showConfirm = (options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setOpts(options || {});
      setResolver(() => resolve);
      setOpen(true);
    });
  };

  const handleClose = (result: boolean) => {
    setOpen(false);
    if (resolver) resolver(result);
    setResolver(null);
  };

  return (
    <ConfirmContext.Provider value={showConfirm}>
      {children}
      <Modal
        isOpen={open}
        onClose={() => handleClose(false)}
        title={opts.title || ''}
        hideFooter
      >
        <div className="p-6 text-center">
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: opts.danger ? 'rgba(239,68,68,0.06)' : 'rgba(58,122,254,0.06)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path d="M12 2C10.8954 2 10 2.89543 10 4H6C5.44772 4 5 4.44772 5 5C5 5.55228 5.44772 6 6 6H18C18.5523 6 19 5.55228 19 5C19 4.44772 18.5523 4 18 4H14C14 2.89543 13.1046 2 12 2Z" fill={opts.danger ? '#EF4444' : '#3A7AFE'} />
              <path d="M6 7L7 21C7 21.5523 7.44772 22 8 22H16C16.5523 22 17 21.5523 17 21L18 7H6Z" fill={opts.danger ? '#EF4444' : '#3A7AFE'} opacity="0.15" />
              {opts.danger ? (
                <path d="M9 9L15 15M15 9L9 15" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M9 9L15 15M15 9L9 15" stroke="#3A7AFE" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </div>

          <h3 className="text-[18px] font-[700] mb-2">{opts.title}</h3>
          <p className="text-[14px] text-[var(--text-muted)] mb-6">{opts.description}</p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => handleClose(true)}
              className={`w-full px-4 py-3 rounded-lg font-[700] ${opts.danger ? 'bg-[#EF4444] text-white shadow-md' : 'bg-[#3A7AFE] text-white shadow-sm'}`}>
              {opts.confirmText || (opts.danger ? 'Yes, Delete' : 'Confirm')}
            </button>
            <button onClick={() => handleClose(false)} className="w-full px-4 py-3 rounded-lg font-[700] text-[var(--text-primary)] bg-[transparent] border border-[rgba(0,0,0,0.06)]">
              {opts.cancelText || 'Cancel'}
            </button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
};

export default ConfirmProvider;
