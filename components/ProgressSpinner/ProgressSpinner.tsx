import React from 'react';
import styles from './ProgressSpinner.module.scss';

interface ProgressSpinnerProps {
  loading: boolean;
}

export default function ProgressSpinner({ loading }: ProgressSpinnerProps) {
  // Do not leave a hidden, full-screen fixed element in the DOM. Some browsers
  // can retain its composited backdrop/pointer layer after a modal is removed.
  if (!loading) return null;

  return (
    <div
      className={`${styles.progressSpinner} ${styles.progressVisible}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.78)',
      }}
      aria-live="polite"
      aria-busy={loading}
      role="status"
    >
      <div className={styles.spinnerRing} aria-label="Loading" />
    </div>
  );
}
