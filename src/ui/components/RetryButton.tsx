import React from "react";

export interface RetryButtonProps {
  onClick: () => void | Promise<void>;
  size?: 'xs' | 'sm' | 'md';
  disabled?: boolean;
  children?: React.ReactNode;
}

export function RetryButton({ onClick, size = 'sm', disabled, children }: RetryButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn-outline btn-${size} min-h-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus:outline-offset-2`}
      onClick={() => void onClick()}
      disabled={disabled}
    >
      {children ?? '重试'}
    </button>
  );
}
