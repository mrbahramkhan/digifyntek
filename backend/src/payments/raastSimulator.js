/**
 * Raast adapter SIMULATOR — not a live SBP/Raast connection.
 * All outcomes are labeled SIMULATED. Do not treat as settled bank money movement
 * unless posting_status=POSTED after internal ledger step.
 */

function simulateOutbound({ amount, creditorIban, raastId }) {
  const amt = Number(amount) || 0;
  // Deterministic-ish demo rules (not real network codes)
  if (amt <= 0) {
    return {
      external_status: 'REJECTED',
      code: 'SIM-AMT',
      message: 'SIMULATED reject: invalid amount',
      network_ref: null,
    };
  }
  if (!creditorIban && !raastId) {
    return {
      external_status: 'REJECTED',
      code: 'SIM-BEN',
      message: 'SIMULATED reject: creditor IBAN or Raast ID required',
      network_ref: null,
    };
  }
  if (String(creditorIban || '').toUpperCase().includes('REJECT')) {
    return {
      external_status: 'REJECTED',
      code: 'SIM-BEN-RJCT',
      message: 'SIMULATED reject: beneficiary flagged',
      network_ref: null,
    };
  }
  // Large amount → accepted but not auto-settled in sim
  if (amt >= 1000000) {
    return {
      external_status: 'ACCEPTED',
      code: 'SIM-ACCP',
      message: 'SIMULATED accepted (high value — settlement pending in sim)',
      network_ref: `SIM-RAAST-${Date.now()}`,
    };
  }
  return {
    external_status: 'SETTLED',
    code: 'SIM-SETTLED',
    message: 'SIMULATED settled (demo only — not real Raast)',
    network_ref: `SIM-RAAST-${Date.now()}`,
  };
}

function simulateStatusInquiry(payment) {
  return {
    payment_ref: payment.payment_ref,
    external_status: payment.external_status,
    posting_status: payment.posting_status,
    settlement_status: payment.settlement_status,
    simulator: true,
    note: 'Status from local simulator store — not an official Raast inquiry',
  };
}

module.exports = { simulateOutbound, simulateStatusInquiry };
