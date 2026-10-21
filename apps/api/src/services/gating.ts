import type { ApprovalStatus, ApprovalType } from '@vulcaestus/db';

export interface ApprovalLike {
  id: string;
  type: ApprovalType | string;
  entityId: string;
  status: ApprovalStatus | string;
  expiresAt?: Date | null;
}

export interface GateInput {
  approval: ApprovalLike | null | undefined;
  expectedType: ApprovalType | string;
  entityId: string;
  now?: Date;
}

export interface GateResult {
  ok: boolean;
  reason?: string;
}

/**
 * Central precondition for every external action. An action may only proceed
 * with an APPROVED approval of the matching type and entity.
 */
export function evaluateApprovalGate(input: GateInput): GateResult {
  const { approval, expectedType, entityId, now = new Date() } = input;
  if (!approval) return { ok: false, reason: 'No approval request found for this action.' };
  if (approval.type !== expectedType) {
    return { ok: false, reason: `Approval type ${approval.type} does not match required ${expectedType}.` };
  }
  if (approval.entityId !== entityId) {
    return { ok: false, reason: 'Approval does not belong to the requested entity.' };
  }
  if (approval.expiresAt && approval.expiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: 'Approval has expired.' };
  }
  if (approval.status !== 'APPROVED') {
    return { ok: false, reason: `Approval is ${String(approval.status).toLowerCase()}, not approved.` };
  }
  return { ok: true };
}

export function assertApprovalGate(input: GateInput): void {
  const result = evaluateApprovalGate(input);
  if (!result.ok) throw new Error(result.reason ?? 'Approval gate failed');
}

export interface BrowserActionRequest {
  kind: string;
  dryRun: boolean;
  approvalId?: string;
  expectedApprovalType?: string;
  entityId?: string;
  applicationStatus?: string;
  outreachStatus?: string;
}

/**
 * The worker boundary re-checks that dry-run never submits and that a live
 * action carries an approved, matching approval.
 */
export function assertExternalActionAllowed(input: {
  dryRun: boolean;
  approval?: ApprovalLike | null;
  expectedApprovalType?: string;
  entityId?: string;
}): GateResult {
  if (input.dryRun) return { ok: true };
  if (!input.expectedApprovalType || !input.entityId) {
    return { ok: false, reason: 'Live external actions require an approval type and entity id.' };
  }
  return evaluateApprovalGate({
    approval: input.approval,
    expectedType: input.expectedApprovalType,
    entityId: input.entityId,
  });
}
