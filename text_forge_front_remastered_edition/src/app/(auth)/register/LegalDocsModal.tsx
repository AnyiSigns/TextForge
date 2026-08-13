'use client';

import { X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DISCLAIMER_MD, USER_AGREEMENT_MD } from './legalDocs';

export type LegalDocKind = 'agreement' | 'disclaimer';

const TITLES: Record<LegalDocKind, string> = {
  agreement: '用户协议',
  disclaimer: '免责声明',
};

export function LegalDocsModal({
  kind,
  onClose,
}: {
  kind: LegalDocKind | null;
  onClose: () => void;
}) {
  if (!kind) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
          <h2 className="text-sm font-medium">{TITLES[kind]}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="p-1 text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-xs leading-relaxed text-foreground/90">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              ul: ({ children }) => <ul className="list-disc pl-4 my-1.5 space-y-0.5">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 my-1.5 space-y-0.5">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              h1: ({ children }) => <h1 className="text-sm font-semibold my-2">{children}</h1>,
              h2: ({ children }) => <h2 className="text-[13px] font-semibold my-1.5">{children}</h2>,
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-foreground/15 pl-3 my-1.5 text-muted-foreground/80">
                  {children}
                </blockquote>
              ),
            }}
          >
            {kind === 'agreement' ? USER_AGREEMENT_MD : DISCLAIMER_MD}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
