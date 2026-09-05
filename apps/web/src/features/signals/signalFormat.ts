import type { SignalSeverity } from '@jb/contracts';
import type { Tone } from '@/components/Pill';

export const SEVERITY_TONE: Record<SignalSeverity, Tone> = {
  SEVERE: 'crit',
  HIGH: 'crit',
  MEDIUM: 'warn',
  LOW: 'neutral',
};
export const SEVERITY_SHORT: Record<SignalSeverity, string> = {
  SEVERE: 'SEVERE',
  HIGH: 'HIGH',
  MEDIUM: 'MED',
  LOW: 'LOW',
};

export function ageLabel(days: number): string {
  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return '1 day ago';
  }
  if (days < 60) {
    return `${days} days ago`;
  }
  return `${Math.round(days / 30)} months ago`;
}
