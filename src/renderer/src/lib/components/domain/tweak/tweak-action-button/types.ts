import type { TweakOperationStatus } from '../../../../../../../main/interfaces/tweak-agent.interface';

/**
 * State object for TweakActionButton component.
 * Groups all the state and handlers needed for apply/revert functionality.
 */
export interface TweakActionState {
  /** Whether this tweak is currently being applied */
  isRunning?: boolean;
  /** Whether this tweak has been applied */
  isCompleted?: boolean;
  /** Whether this tweak can be reverted */
  isRevertable?: boolean;
  /** Whether this tweak is currently being reverted */
  isReverting?: boolean;
  /** Whether the agent is busy processing any tweak */
  isAgentBusy?: boolean;
  /** Whether the apply button should be shown (default: true) */
  canApply?: boolean;
  /** Completion status for badge display */
  completionStatus?: TweakOperationStatus;
  /** Warning message for hover card */
  warningMessage?: string;
  /** Handler called when apply button is clicked */
  onApply: () => void;
  /** Handler called when revert button is clicked */
  onRevert: () => void;
}
