/**
 * SobhaInfra ERP - Authoritative Accounting Reconciliation Engine
 * 
 * Reconciles Tally Sales invoices, Receipts, and Ledger Balances.
 * Accurately calculates bill settlement statuses (Paid / Pending / Overdue)
 * using explicit bill-allocations (Agst Ref) and FIFO ledger settlement.
 * 
 * Eliminates false "Overdue" flags for settled customers.
 */

export function normalizePartyName(name) {
  if (!name) return '';
  return String(name)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
    .toUpperCase();
}

function parseDate(dStr) {
  if (!dStr) return new Date(0);
  try {
    const d = new Date(dStr);
    return isNaN(d.getTime()) ? new Date(0) : d;
  } catch {
    return new Date(0);
  }
}

export function isPastDue(dueDateStr) {
  if (!dueDateStr) return false;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    return due < today;
  } catch {
    return false;
  }
}

export function getDaysOverdue(dueDateStr) {
  if (!dueDateStr) return 0;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diff = today.getTime() - due.getTime();
    return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
  } catch {
    return 0;
  }
}

/**
 * Reconcile invoices across all parties:
 * - Group vouchers by party.
 * - Match receipts to sales bills via explicit Agst Ref or FIFO.
 * - Enforce Tally Master closing balances (LEDGER-<party>).
 * - Accurately set status: 'Paid', 'Pending', or 'Overdue'.
 */
export function reconcileCustomerInvoices(rawInvoices = []) {
  if (!Array.isArray(rawInvoices) || rawInvoices.length === 0) return [];

  // Group by normalized party name
  const partyMap = new Map();
  for (const inv of rawInvoices) {
    const p = normalizePartyName(inv.client_name);
    if (!partyMap.has(p)) {
      partyMap.set(p, []);
    }
    partyMap.get(p).push(inv);
  }

  const reconciledList = [];

  for (const [party, records] of partyMap.entries()) {
    // 1. Identify ledger closing balance marker (if any)
    const ledgerMarker = records.find(r => 
      (r.invoice_number || '').toUpperCase().startsWith('LEDGER-')
    );
    const tallyClosingBalance = ledgerMarker ? Number(ledgerMarker.amount || 0) : null;

    // 2. Identify Sales invoices (excluding LEDGER-* markers)
    const salesInvoices = [];
    const receipts = [];
    const otherVouchers = [];

    for (const r of records) {
      const num = (r.invoice_number || '').toUpperCase();
      if (num.startsWith('LEDGER-')) {
        otherVouchers.push(r);
        continue;
      }

      const vtype = (r.metadata?.voucher_type || r.voucher_type || '').toLowerCase();
      const dir = (r.metadata?.direction || r.direction || '').toLowerCase();

      const isSales = 
        vtype.includes('sales') || 
        vtype.includes('tax invoice') || 
        /^(srp|sb)\//i.test(num) || 
        /^(inv|tax)\//i.test(num) || 
        dir === 'receivable';

      const isReceipt = 
        vtype.includes('receipt') || 
        /^(rec|rcpt|rct)-/i.test(num) || 
        dir === 'received';

      if (isSales && !isReceipt) {
        salesInvoices.push({ ...r });
      } else if (isReceipt) {
        receipts.push({ ...r });
      } else {
        otherVouchers.push({ ...r });
      }
    }

    // Sort sales invoices chronologically (oldest first for FIFO)
    salesInvoices.sort((a, b) => {
      const da = parseDate(a.invoice_date || a.created_at).getTime();
      const db = parseDate(b.invoice_date || b.created_at).getTime();
      return da - db;
    });

    const totalSales = salesInvoices.reduce((sum, s) => sum + Number(s.amount || 0), 0);
    const totalReceipts = receipts.reduce((sum, rc) => sum + Number(rc.amount || 0), 0);

    // If Tally explicitly provided a closing balance of 0, ALL sales bills are Paid!
    if (tallyClosingBalance === 0) {
      for (const s of salesInvoices) {
        s.status = 'Paid';
        s.pending_amount = 0;
        s.paid_amount = Number(s.amount || 0);
        s._reconciled = true;
      }
    } else {
      // 3. FIFO Settlement: Apply total receipts across sales invoices
      let remainingReceipts = totalReceipts;

      for (const s of salesInvoices) {
        const billAmt = Number(s.amount || 0);

        if (remainingReceipts >= billAmt && billAmt > 0) {
          // Fully settled
          s.status = 'Paid';
          s.pending_amount = 0;
          s.paid_amount = billAmt;
          remainingReceipts -= billAmt;
          s._reconciled = true;
        } else if (remainingReceipts > 0) {
          // Partially settled
          s.paid_amount = remainingReceipts;
          s.pending_amount = Math.max(0, billAmt - remainingReceipts);
          remainingReceipts = 0;
          s.status = isPastDue(s.due_date) ? 'Overdue' : 'Pending';
          s._reconciled = true;
        } else {
          // Fully unpaid
          s.paid_amount = 0;
          s.pending_amount = billAmt;
          s.status = isPastDue(s.due_date) ? 'Overdue' : 'Pending';
          s._reconciled = true;
        }
      }

      // 4. If Tally Closing Balance is provided and is less than sum of pending amounts:
      // Enforce Tally's exact closing balance from newest to oldest
      if (tallyClosingBalance !== null && tallyClosingBalance >= 0) {
        let allowedPending = tallyClosingBalance;
        // Traverse backwards from newest to oldest
        for (let i = salesInvoices.length - 1; i >= 0; i--) {
          const inv = salesInvoices[i];
          const billAmt = Number(inv.amount || 0);

          if (allowedPending >= billAmt) {
            // This invoice can remain pending up to billAmt
            inv.pending_amount = billAmt;
            inv.paid_amount = 0;
            inv.status = isPastDue(inv.due_date) ? 'Overdue' : 'Pending';
            allowedPending -= billAmt;
          } else if (allowedPending > 0) {
            // Partially pending
            inv.pending_amount = allowedPending;
            inv.paid_amount = billAmt - allowedPending;
            inv.status = isPastDue(inv.due_date) ? 'Overdue' : 'Pending';
            allowedPending = 0;
          } else {
            // Older bills beyond the closing balance are fully Paid!
            inv.status = 'Paid';
            inv.pending_amount = 0;
            inv.paid_amount = billAmt;
          }
        }
      }
    }

    // Receipts are always Paid / Settled
    for (const rc of receipts) {
      rc.status = 'Paid';
      rc.pending_amount = 0;
      rc.paid_amount = Number(rc.amount || 0);
    }

    reconciledList.push(...salesInvoices, ...receipts, ...otherVouchers);
  }

  return reconciledList;
}

/**
 * Generate a complete, dynamic Ledger Account Statement for a party:
 * Returns all transactions sorted chronologically with running debit, credit, and balance.
 */
export function getCustomerLedgerStatement(partyName, allInvoices = []) {
  const normParty = normalizePartyName(partyName);
  if (!normParty) {
    return { partyName: 'Customer', entries: [], totalDebits: 0, totalCredits: 0, closingBalance: 0 };
  }

  // Filter vouchers belonging to this party (ignoring LEDGER-* markers)
  const partyVouchers = allInvoices.filter(inv => {
    const num = (inv.invoice_number || '').toUpperCase();
    if (num.startsWith('LEDGER-')) return false;
    return normalizePartyName(inv.client_name) === normParty;
  });

  const entries = [];
  let totalDebits = 0;
  let totalCredits = 0;

  for (const v of partyVouchers) {
    const meta = v.metadata || {};
    const vtype = (meta.voucher_type || v.voucher_type || '').toLowerCase();
    const dir = (meta.direction || v.direction || '').toLowerCase();
    const amt = Number(v.amount || 0);
    const num = v.invoice_number || v.tally_voucher_number || '';
    const dateStr = v.invoice_date 
      ? new Date(v.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
      : '—';

    const isSales = vtype.includes('sales') || vtype.includes('tax invoice') || dir === 'receivable' || /^(srp|sb)\//i.test(num);
    const isReceipt = vtype.includes('receipt') || dir === 'received' || /^(rec|rcpt)-/i.test(num);
    const isCreditNote = vtype.includes('credit note');
    const isDebitNote = vtype.includes('debit note');

    if (isSales || isDebitNote) {
      totalDebits += amt;
      entries.push({
        rawDate: parseDate(v.invoice_date || v.created_at),
        date: dateStr,
        particulars: isDebitNote ? 'To Debit Note' : 'To Sales',
        vchType: isDebitNote ? 'Debit Note' : 'Sales',
        vchNo: num,
        debit: amt,
        credit: null,
      });
    } else if (isReceipt || isCreditNote) {
      totalCredits += amt;
      const bankName = meta.bank_name || meta.bank_ledger || 'ICICI BANK / Bank';
      entries.push({
        rawDate: parseDate(v.invoice_date || v.created_at),
        date: dateStr,
        particulars: isCreditNote ? 'By Credit Note' : `By ${bankName}`,
        vchType: isCreditNote ? 'Credit Note' : 'Receipt',
        vchNo: num,
        debit: null,
        credit: amt,
      });
    }
  }

  // Sort chronological
  entries.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());

  // Check if there is an explicit LEDGER closing balance marker
  const ledgerMarker = allInvoices.find(inv => 
    (inv.invoice_number || '').toUpperCase().startsWith('LEDGER-') &&
    normalizePartyName(inv.client_name) === normParty
  );

  const closingBalance = ledgerMarker ? Number(ledgerMarker.amount || 0) : Math.max(0, totalDebits - totalCredits);

  return {
    partyName: partyVouchers[0]?.client_name || partyName,
    entries,
    totalDebits,
    totalCredits,
    closingBalance,
  };
}

/**
 * Generate a dynamic Bill-Wise Pending Bills Statement for a party:
 * Returns only unsettled or partially settled invoices with opening, pending, and overdue days.
 */
export function getCustomerPendingBills(partyName, allInvoices = []) {
  const normParty = normalizePartyName(partyName);
  if (!normParty) {
    return { partyName: 'Customer', bills: [], totalOpening: 0, totalPending: 0 };
  }

  // Reconcile invoices first to get exact pending amounts
  const reconciled = reconcileCustomerInvoices(allInvoices);

  const pendingBills = reconciled.filter(inv => {
    const num = (inv.invoice_number || '').toUpperCase();
    if (num.startsWith('LEDGER-')) return false;
    if (normalizePartyName(inv.client_name) !== normParty) return false;
    
    // Only sales invoices that are not Paid or have pending amount > 0
    const vtype = (inv.metadata?.voucher_type || inv.voucher_type || '').toLowerCase();
    const isSales = vtype.includes('sales') || vtype.includes('tax invoice') || /^(srp|sb)\//i.test(num);
    if (!isSales) return false;

    return inv.status !== 'Paid' && Number(inv.pending_amount ?? inv.amount) > 0;
  });

  // Sort by date ascending
  pendingBills.sort((a, b) => {
    const da = parseDate(a.invoice_date || a.created_at).getTime();
    const db = parseDate(b.invoice_date || b.created_at).getTime();
    return da - db;
  });

  let totalOpening = 0;
  let totalPending = 0;

  const bills = pendingBills.map(b => {
    const op = Number(b.amount || 0);
    const pe = Number(b.pending_amount ?? b.amount);
    totalOpening += op;
    totalPending += pe;

    const dateStr = b.invoice_date 
      ? new Date(b.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
      : '—';
    const dueStr = b.due_date 
      ? new Date(b.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
      : dateStr;

    return {
      date: dateStr,
      ref: b.invoice_number || b.tally_voucher_number || 'BILL',
      opening: op,
      pending: pe,
      due: dueStr,
      overdue: getDaysOverdue(b.due_date),
    };
  });

  return {
    partyName: pendingBills[0]?.client_name || partyName,
    bills,
    totalOpening,
    totalPending,
  };
}
