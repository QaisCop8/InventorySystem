import React from 'react';
import styles from './ProgressSpinner.module.scss';

interface ProgressSpinnerProps {
  loading: boolean;
}

export default function ProgressSpinner({ loading }: ProgressSpinnerProps) {
  return (
    <div
      className={`${styles.progressSpinner} ${loading ? styles.progressVisible : styles.progressHide}`}
      style={{
        display: loading ? 'flex' : 'none',
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
