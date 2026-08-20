import type { RecoveryProcessLiveness } from './types.js';

export function systemRecoveryProcessLiveness(): RecoveryProcessLiveness {
  return {
    isAlive(pid: number): boolean {
      if (!Number.isInteger(pid) || pid <= 0) {
        return false;
      }
      try {
        process.kill(pid, 0);
        return true;
      } catch (error: unknown) {
        if (isErrnoException(error) && error.code === 'ESRCH') {
          return false;
        }
        if (isErrnoException(error) && error.code === 'EPERM') {
          return true;
        }
        return true;
      }
    },
  };
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
