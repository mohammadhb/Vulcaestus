import { describe, expect, it } from 'vitest';
import { assertExternalActionAllowed, evaluateApprovalGate } from './gating.js';

const approved = {
  id: 'approval-1',
  type: 'LINKEDIN_MESSAGE',
  entityId: 'outreach-1',
  status: 'APPROVED',
  expiresAt: null,
};

describe('approval gating', () => {
  it('allows an approved, matching action', () => {
    expect(
      evaluateApprovalGate({
        approval: approved,
        expectedType: 'LINKEDIN_MESSAGE',
        entityId: 'outreach-1',
      }).ok,
    ).toBe(true);
  });

  it('blocks an unapproved message', () => {
    const result = evaluateApprovalGate({
      approval: { ...approved, status: 'PENDING' },
      expectedType: 'LINKEDIN_MESSAGE',
      entityId: 'outreach-1',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not approved/i);
  });

  it('blocks a mismatched type or entity', () => {
    expect(
      evaluateApprovalGate({
        approval: approved,
        expectedType: 'APPLICATION_SUBMISSION',
        entityId: 'outreach-1',
      }).ok,
    ).toBe(false);
    expect(
      evaluateApprovalGate({
        approval: approved,
        expectedType: 'LINKEDIN_MESSAGE',
        entityId: 'outreach-2',
      }).ok,
    ).toBe(false);
  });

  it('blocks expired approvals', () => {
    const result = evaluateApprovalGate({
      approval: { ...approved, expiresAt: new Date(Date.now() - 1000) },
      expectedType: 'LINKEDIN_MESSAGE',
      entityId: 'outreach-1',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/expired/i);
  });

  it('allows dry-run simulation without an approval', () => {
    expect(assertExternalActionAllowed({ dryRun: true }).ok).toBe(true);
  });

  it('refuses a live action without an approval', () => {
    expect(
      assertExternalActionAllowed({
        dryRun: false,
        expectedApprovalType: 'APPLICATION_SUBMISSION',
        entityId: 'application-1',
        approval: null,
      }).ok,
    ).toBe(false);
  });

  it('refuses a live submission with a pending approval', () => {
    expect(
      assertExternalActionAllowed({
        dryRun: false,
        expectedApprovalType: 'APPLICATION_SUBMISSION',
        entityId: 'application-1',
        approval: { ...approved, type: 'APPLICATION_SUBMISSION', entityId: 'application-1', status: 'PENDING' },
      }).ok,
    ).toBe(false);
  });
});
