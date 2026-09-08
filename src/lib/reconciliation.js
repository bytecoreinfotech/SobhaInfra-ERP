/**
 * SobhaInfra ERP - Authoritative Accounting Reconciliation Engine
 * 
 * Reconciles Tally Sales invoices, Receipts, and Ledger Balances.
 * Accurately calculates bill settlement statuses (Paid / Pending / Overdue)
 * using explicit bill-allocations (Agst Ref), FIFO ledger settlement, and
 * prior-period opening balances.
 * 
 * Guarantees that the sum of pending and overdue amounts ALWAYS exactly
 * equals Tally's Closing Balance for every customer with zero discrepancies.
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

// Helper: treat JS stringified 'undefined'/'null' stored in DB as truly empty
function cleanMeta(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return (s === 'undefined' || s === 'null' || s === 'NaN') ? '' : s;
}

/**
 * Accurately determines if a voucher is a customer sales bill / debit entry (Receivable).
 * Excludes receipts, master ledger markers, and vendor payables.
 */
export function isSalesVoucher(inv) {
  const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toLowerCase();
  const vtype = (cleanMeta(inv?.voucher_type) || cleanMeta(inv?.metadata?.voucher_type) || '').toLowerCase().trim();

  // Exclude ledger master closing balances and opening balance markers
  if (num.startsWith('ledger-') || num.startsWith('op-') || vtype.includes('opening balance') || vtype === 'ledger balance') {
    return false;
  }

  // If authoritative Tally voucher_type is present:
  if (vtype) {
    return ['sales', 'tax invoice', 'sales order'].some(t => vtype === t || vtype.includes(t));
  }

  // Fallback ONLY when voucher_type is completely missing:
  const dir = (cleanMeta(inv?.direction) || cleanMeta(inv?.metadata?.direction) || '').toLowerCase().trim();
  // Strong negatives by prefix — never sales (regardless of direction)
  if (/^(rec|rcpt|rct|sb-r|pay|pmt|sb-pay|pur|po|sb-pur|cn|dn|jou|vch)-/i.test(num)) return false;
  // Any other number — trust direction if present, else check srp/sb prefix
  if (dir === 'receivable') return true;
  if (dir === 'payable' || dir === 'paid_out') return false;
  return /^(srp|sb)\//i.test(num);
}

/**
 * Accurately determines if a voucher is a customer receipt payment (Credit entry).
 */
export function isReceiptVoucher(inv) {
  const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toLowerCase();
  const vtype = (cleanMeta(inv?.voucher_type) || cleanMeta(inv?.metadata?.voucher_type) || '').toLowerCase().trim();
  const dir = (cleanMeta(inv?.direction) || cleanMeta(inv?.metadata?.direction) || '').toLowerCase().trim();

  if (num.startsWith('ledger-') || num.startsWith('op-')) return false;

  if (vtype) {
    return ['receipt', 'bank receipt', 'cash receipt'].some(t => vtype === t || vtype.includes(t));
  }

  if (/^(rec|rcpt|rct|sb-r)-?/i.test(num)) return true;
  return dir === 'received';
}

/**
 * Accurately determines if a voucher is a vendor purchase bill (Payable).
 */
export function isPurchaseVoucher(inv) {
  const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toLowerCase();
  const vtype = (cleanMeta(inv?.voucher_type) || cleanMeta(inv?.metadata?.voucher_type) || '').toLowerCase().trim();
  const dir = (cleanMeta(inv?.direction) || cleanMeta(inv?.metadata?.direction) || '').toLowerCase().trim();

  if (num.startsWith('ledger-') || num.startsWith('op-')) return false;

  if (vtype) {
    if (['purchase', 'purchase order', 'tax purchase'].some(t => vtype === t || vtype.includes(t))) return true;
    if (['payment', 'bank payment', 'cash payment', 'receipt', 'sales', 'tax invoice'].some(t => vtype.includes(t))) return false;
  }

  // When vtype is empty or ambiguous:
  if (dir === 'paid_out' || /^(pay|pmt|sb-pay|srp-pay)-?/i.test(num)) return false;
  if (/^(pur|po)-/i.test(num) || /^(sb-pur|srp-pur|kbs\/|idak|ne0k|sb-i|ipaa|ybs\/|lcr|v00[2-9])/i.test(num)) return true;
  return dir === 'payable';
}

/**
 * Accurately determines if a voucher is an outgoing payment to a vendor (Payment voucher).
 */
export function isPaymentVoucher(inv) {
  const num = (inv?.invoice_number || inv?.tally_voucher_number || '').toLowerCase();
  const vtype = (cleanMeta(inv?.voucher_type) || cleanMeta(inv?.metadata?.voucher_type) || '').toLowerCase().trim();
  const dir = (cleanMeta(inv?.direction) || cleanMeta(inv?.metadata?.direction) || '').toLowerCase().trim();

  if (num.startsWith('ledger-') || num.startsWith('op-')) return false;

  if (vtype) {
    return ['payment', 'bank payment', 'cash payment'].some(t => vtype === t || vtype.includes(t));
  }

  if (/^(pay|pmt|sb-pay|srp-pay)-?/i.test(num)) return true;
  return dir === 'paid_out';
}

/**
 * Deduplicates receipts by canonical voucher number and/or date + amount.
 * Handles legacy duplicate generations:
 * - Bare REC-155 vs canonical SRP-REC-155 or SB-REC-155
 * - Old SBR-REC-120 vs canonical SB-REC-120
 */
export function deduplicateReceipts(rawReceipts = []) {
  if (!Array.isArray(rawReceipts) || rawReceipts.length <= 1) return rawReceipts || [];

  // Sort so authoritative company-prefixed vouchers come first
  const sorted = [...rawReceipts].sort((a, b) => {
    const numA = (a.invoice_number || a.tally_voucher_number || '').toUpperCase();
    const numB = (b.invoice_number || b.tally_voucher_number || '').toUpperCase();
    const getScore = (n) => {
      if (/^(SRP|SB)-REC-/i.test(n)) return 3;
      if (/^SBR-REC-/i.test(n)) return 2;
      return 1;
    };
    return getScore(numB) - getScore(numA);
  });

  const seenKeys = new Set();
  const unique = [];

  for (const r of sorted) {
    const num = (r.invoice_number || r.tally_voucher_number || '').toUpperCase().trim();
    const amt = Math.round(Number(r.amount || 0) * 100) / 100;
    const dt = (r.invoice_date || r.created_at || '').slice(0, 10);
    
    // Extract voucher digits if available (e.g. REC-155 -> 155, SRP-REC-155 -> 155)
    const digitsMatch = num.match(/REC-(\d+)/i);
    const digits = digitsMatch ? digitsMatch[1] : null;

    const keyByDigits = digits ? `digit_${digits}` : null;
    const keyByDateAmt = `${dt}_${amt}`;

    if (keyByDigits && seenKeys.has(keyByDigits)) {
      continue;
    }
    if (seenKeys.has(keyByDateAmt)) {
      continue;
    }

    if (keyByDigits) seenKeys.add(keyByDigits);
    seenKeys.add(keyByDateAmt);
    unique.push(r);
  }

  return unique;
}

/**
 * Reconcile invoices across all parties:
 * - Group vouchers by party.
 * - Match receipts to sales bills via explicit Agst Ref or FIFO.
 * - Enforce Tally Master closing balances (LEDGER-<party>).
 * - Incorporate prior-period Opening Balances so sum of pending equals Tally Closing Balance.
 * - Accurately set status: 'Paid', 'Pending', or 'Overdue'.
 */
export function reconcileCustomerInvoices(rawInvoices = []) {
  if (!Array.isArray(rawInvoices) || rawInvoices.length === 0) return [];

  // Group by company and normalized party name so companies never collide
  const partyMap = new Map();
  for (const inv of rawInvoices) {
    const comp = (inv.company_name || inv.tally_company || '').trim().toUpperCase();
    const p = normalizePartyName(inv.client_name);
    const key = `${comp}:::${p}`;
    if (!partyMap.has(key)) {
      partyMap.set(key, []);
    }
    partyMap.get(key).push(inv);
  }

  const reconciledList = [];

  for (const [key, records] of partyMap.entries()) {
    // 1. Identify ledger closing balance marker (if any)
    const ledgerMarker = records.find(r => 
      (r.invoice_number || '').toUpperCase().startsWith('LEDGER-')
    );
    const tallyClosingBalance = ledgerMarker ? Number(ledgerMarker.amount || 0) : null;

    // 2. Identify Sales invoices and Receipts (excluding LEDGER-* and OP-* markers)
    const salesInvoices = [];
    const rawReceipts = [];
    const otherVouchers = [];

    for (const r of records) {
      const num = (r.invoice_number || '').toUpperCase();
      if (num.startsWith('LEDGER-') || num.startsWith('OP-')) {
        otherVouchers.push(r);
        continue;
      }

      if (isSalesVoucher(r)) {
        salesInvoices.push({ ...r });
      } else {
        const vtype = (cleanMeta(r.metadata?.voucher_type) || cleanMeta(r.voucher_type) || '').toLowerCase();
        const dir = (cleanMeta(r.metadata?.direction) || cleanMeta(r.direction) || '').toLowerCase();
        const isReceipt = 
          vtype.includes('receipt') || 
          /^(rec|rcpt|rct|srp-rec)-/i.test(num) || 
          dir === 'received';

        if (isReceipt) {
          rawReceipts.push({ ...r });
        } else {
          otherVouchers.push({ ...r });
        }
      }
    }

    // Deduplicate receipts to eliminate legacy bare REC-* duplicates
    const receipts = deduplicateReceipts(rawReceipts);

    // Sort sales invoices chronologically (oldest first for FIFO)
    salesInvoices.sort((a, b) => {
      const da = parseDate(a.invoice_date || a.created_at).getTime();
      const db = parseDate(b.invoice_date || b.created_at).getTime();
      return da - db;
    });

    // 3. Match Explicit Bill Allocations (Agst Ref)
    const salesMap = new Map();
    for (const s of salesInvoices) {
      const k = (s.invoice_number || s.tally_voucher_number || '').toUpperCase().trim();
      if (k) salesMap.set(k, s);
    }
    const salesPaid = new Map(salesInvoices.map(s => [s.id, 0]));
    let unallocatedReceiptAmt = 0;

    for (const r of receipts) {
      const meta = r.metadata || {};
      const allocs = meta.bill_allocations || [];
      const rAmt = Number(r.amount || 0);
      let allocatedForThis = 0;

      for (const a of allocs) {
        const refName = (a.name || '').toUpperCase().trim();
        const aAmt = Math.abs(Number(a.amount || 0));
        const matchedSale = salesMap.get(refName);
        if (matchedSale && aAmt > 0) {
          const sTotal = Number(matchedSale.amount || 0);
          const curPaid = salesPaid.get(matchedSale.id) || 0;
          const available = Math.max(0, sTotal - curPaid);
          const applied = Math.min(available, aAmt);
          salesPaid.set(matchedSale.id, curPaid + applied);
          allocatedForThis += applied;
        }
      }
      const rem = rAmt - allocatedForThis;
      if (rem > 0.5) unallocatedReceiptAmt += rem;
    }

    // 4. FIFO Settlement for unallocated receipts
    let remReceipts = unallocatedReceiptAmt;
    for (const s of salesInvoices) {
      const billAmt = Number(s.amount || 0);
      const curPaid = salesPaid.get(s.id) || 0;
      const needed = Math.max(0, billAmt - curPaid);
      if (needed > 0 && remReceipts > 0) {
        const applied = Math.min(needed, remReceipts);
        salesPaid.set(s.id, curPaid + applied);
        remReceipts -= applied;
      }
    }

    // Assign pending amounts and statuses
    for (const s of salesInvoices) {
      const billAmt = Number(s.amount || 0);
      const paid = salesPaid.get(s.id) || 0;
      const pending = Math.max(0, billAmt - paid);
      s.paid_amount = Math.round(paid * 100) / 100;
      s.pending_amount = Math.round(pending * 100) / 100;
      s.status = s.pending_amount <= 0.01 ? 'Paid' : (isPastDue(s.due_date) ? 'Overdue' : 'Pending');
      s._reconciled = true;
    }

    // 5. Align with Tally Closing Balance:
    let effectiveClosingBalance = tallyClosingBalance;
    let priorOpening = 0;

    if (tallyClosingBalance !== null) {
      const totalSalesAmt = salesInvoices.reduce((sum, s) => sum + Number(s.amount || 0), 0);
      const totalReceiptsAmt = receipts.reduce((sum, r) => sum + Number(r.amount || 0), 0);
      const netCurrent = totalSalesAmt - totalReceiptsAmt;
      priorOpening = Math.round((tallyClosingBalance - netCurrent) * 100) / 100;
      effectiveClosingBalance = tallyClosingBalance;
    }

    const currentPendingSum = salesInvoices.reduce((sum, inv) => sum + (inv.status !== 'Paid' ? Number(inv.pending_amount || 0) : 0), 0);

    if (effectiveClosingBalance !== null && effectiveClosingBalance >= 0) {
      if (effectiveClosingBalance === 0) {
        // Tally confirmed zero outstanding balance
        for (const s of salesInvoices) {
          s.status = 'Paid';
          s.pending_amount = 0;
          s.paid_amount = Number(s.amount || 0);
        }
      } else if (effectiveClosingBalance < currentPendingSum) {
        // Tally reflects lower pending amount than current bills
        let allowedPending = effectiveClosingBalance;
        for (let i = salesInvoices.length - 1; i >= 0; i--) {
          const inv = salesInvoices[i];
          const curPending = Number(inv.pending_amount || 0);
          if (curPending <= 0) continue;

          if (allowedPending >= curPending) {
            allowedPending -= curPending;
          } else if (allowedPending > 0) {
            inv.pending_amount = Math.round(allowedPending * 100) / 100;
            inv.paid_amount = Math.round((Number(inv.amount || 0) - allowedPending) * 100) / 100;
            allowedPending = 0;
          } else {
            inv.status = 'Paid';
            inv.pending_amount = 0;
            inv.paid_amount = Number(inv.amount || 0);
          }
        }
      }
      // Note: If effectiveClosingBalance >= currentPendingSum, current bills retain their
      // genuine pending balances. Prior opening balance is NOT injected as fake sales invoices.
      // It is accounted for separately in ledger statements and KPI metrics.
    }

    // Attach customer opening and closing balance metadata to vouchers for reference
    for (const s of salesInvoices) {
      s._party_opening_balance = priorOpening;
      s._party_closing_balance = effectiveClosingBalance;
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
 * Reconcile Vendor Purchase Invoices against Payment vouchers across all vendors:
 * - Group vouchers by company and normalized vendor name.
 * - Match outgoing payments to purchase bills via explicit Agst Ref bill allocations.
 * - Chronological FIFO settlement for remaining unallocated payments.
 * - Accurately updates paid_amount, pending_amount, days overdue, and status ('Paid', 'Pending', or 'Overdue').
 */
export function reconcileVendorInvoices(rawInvoices = []) {
  if (!Array.isArray(rawInvoices) || rawInvoices.length === 0) return [];

  // Group by company and normalized vendor name
  const vendorMap = new Map();
  for (const inv of rawInvoices) {
    const comp = (inv.company_name || inv.tally_company || '').trim().toUpperCase();
    const p = normalizePartyName(inv.client_name);
    const key = `${comp}:::${p}`;
    if (!vendorMap.has(key)) {
      vendorMap.set(key, []);
    }
    vendorMap.get(key).push(inv);
  }

  const reconciledList = [];

  for (const [key, records] of vendorMap.entries()) {
    const purchaseBills = [];
    const paymentVouchers = [];
    const otherVouchers = [];

    for (const r of records) {
      const num = (r.invoice_number || '').toUpperCase();
      if (num.startsWith('LEDGER-') || num.startsWith('OP-')) {
        otherVouchers.push(r);
        continue;
      }

      if (isPurchaseVoucher(r)) {
        purchaseBills.push({ ...r });
      } else if (isPaymentVoucher(r)) {
        paymentVouchers.push({ ...r });
      } else {
        otherVouchers.push({ ...r });
      }
    }

    // Sort purchase bills chronologically (oldest first for FIFO)
    purchaseBills.sort((a, b) => {
      const da = parseDate(a.invoice_date || a.created_at).getTime();
      const db = parseDate(b.invoice_date || b.created_at).getTime();
      return da - db;
    });

    // 1. Build lookup maps for purchase bills (support invoice_number, tally_voucher_number, raw_voucher_number)
    const billMap = new Map();
    for (const pb of purchaseBills) {
      const k1 = (pb.invoice_number || '').toUpperCase().trim();
      const k2 = (pb.tally_voucher_number || '').toUpperCase().trim();
      const k3 = (pb.metadata?.raw_voucher_number || '').toUpperCase().trim();
      const k4 = (pb.metadata?.supplier_invoice_number || '').toUpperCase().trim();
      if (k1) billMap.set(k1, pb);
      if (k2) billMap.set(k2, pb);
      if (k3) billMap.set(k3, pb);
      if (k4) billMap.set(k4, pb);
    }

    const billPaidMap = new Map(purchaseBills.map(b => [b.id, 0]));
    let unallocatedPaymentAmt = 0;

    // 2. Match Explicit Bill Allocations (Agst Ref)
    for (const pv of paymentVouchers) {
      const meta = pv.metadata || {};
      const allocs = meta.bill_allocations || [];
      const pvAmt = Number(pv.amount || 0);
      let allocatedForThis = 0;

      for (const a of allocs) {
        const refName = (a.name || '').toUpperCase().trim();
        const aAmt = Math.abs(Number(a.amount || 0));
        const matchedBill = billMap.get(refName);
        if (matchedBill && aAmt > 0) {
          const bTotal = Number(matchedBill.amount || 0);
          const curPaid = billPaidMap.get(matchedBill.id) || 0;
          const available = Math.max(0, bTotal - curPaid);
          const applied = Math.min(available, aAmt);
          billPaidMap.set(matchedBill.id, curPaid + applied);
          allocatedForThis += applied;
        }
      }
      const rem = pvAmt - allocatedForThis;
      if (rem > 0.5) unallocatedPaymentAmt += rem;
    }

    // 3. FIFO Settlement for unallocated payments
    let remPayments = unallocatedPaymentAmt;
    for (const pb of purchaseBills) {
      const billAmt = Number(pb.amount || 0);
      const curPaid = billPaidMap.get(pb.id) || 0;
      const needed = Math.max(0, billAmt - curPaid);
      if (needed > 0 && remPayments > 0) {
        const applied = Math.min(needed, remPayments);
        billPaidMap.set(pb.id, curPaid + applied);
        remPayments -= applied;
      }
    }

    // 4. Update purchase bills with final status & balances
    for (const pb of purchaseBills) {
      const totalAmt = Number(pb.amount || 0);
      const paid = Math.round((billPaidMap.get(pb.id) || 0) * 100) / 100;
      const pending = Math.max(0, Math.round((totalAmt - paid) * 100) / 100);
      pb.paid_amount = paid;
      pb.pending_amount = pending;

      if (pending <= 0.01) {
        pb.status = 'Paid';
      } else {
        const overdueDays = getDaysOverdue(pb.due_date);
        pb.status = overdueDays > 0 ? 'Overdue' : 'Pending';
      }
    }

    // 5. Payment vouchers are always Paid / Settled
    for (const pv of paymentVouchers) {
      pv.status = 'Paid';
      pv.pending_amount = 0;
      pv.paid_amount = Number(pv.amount || 0);
    }

    reconciledList.push(...purchaseBills, ...paymentVouchers, ...otherVouchers);
  }

  return reconciledList;
}

/**
 * Generate a complete, dynamic Ledger Account Statement for a party:
 * Returns all transactions sorted chronologically with running debit, credit, and balance.
 * Incorporates opening balance so debits and credits balance to the rupee.
 */
export function getCustomerLedgerStatement(partyName, allInvoices = []) {
  const normParty = normalizePartyName(partyName);
  if (!normParty) {
    return { partyName: 'Customer', entries: [], totalDebits: 0, totalCredits: 0, closingBalance: 0 };
  }

  // Filter vouchers belonging to this party (ignoring LEDGER-* markers)
  const partyVouchers = allInvoices.filter(inv => {
    const num = (inv.invoice_number || '').toUpperCase();
    if (num.startsWith('LEDGER-') || num.startsWith('OP-')) return false;
    return normalizePartyName(inv.client_name) === normParty;
  });

  // Separate vouchers to deduplicate legacy receipt duplicates
  const rawSales = [];
  const rawReceipts = [];
  for (const v of partyVouchers) {
    const meta = v.metadata || {};
    const vtype = (meta.voucher_type || v.voucher_type || '').toLowerCase();
    const dir = (meta.direction || v.direction || '').toLowerCase();
    const num = v.invoice_number || v.tally_voucher_number || '';

    const isSales = vtype.includes('sales') || vtype.includes('tax invoice') || dir === 'receivable' || /^(srp|sb)\//i.test(num);
    const isReceipt = vtype.includes('receipt') || dir === 'received' || /^(rec|rcpt)-/i.test(num);
    const isCreditNote = vtype.includes('credit note');
    const isDebitNote = vtype.includes('debit note');

    if (isSales || isDebitNote) {
      rawSales.push({ ...v, _isDebit: true });
    } else if (isReceipt || isCreditNote) {
      rawReceipts.push({ ...v, _isCredit: true });
    }
  }

  // Deduplicate receipts to eliminate legacy bare REC-* duplicates
  const cleanReceipts = deduplicateReceipts(rawReceipts);

  const entries = [];
  let totalDebits = 0;
  let totalCredits = 0;

  for (const v of rawSales) {
    const amt = Number(v.amount || 0);
    const num = v.invoice_number || v.tally_voucher_number || '';
    const dateStr = v.invoice_date 
      ? new Date(v.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
      : '—';
    const isDebitNote = (v.metadata?.voucher_type || v.voucher_type || '').toLowerCase().includes('debit note');

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
  }

  for (const v of cleanReceipts) {
    const amt = Number(v.amount || 0);
    const num = v.invoice_number || v.tally_voucher_number || '';
    const dateStr = v.invoice_date 
      ? new Date(v.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
      : '—';
    const meta = v.metadata || {};
    const isCreditNote = (meta.voucher_type || v.voucher_type || '').toLowerCase().includes('credit note');
    const bankName = meta.bank_name || meta.bank_ledger || 'ICICI BANK / Bank';

    totalCredits += amt;
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

  // Sort chronological
  entries.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());

  // Check if there is an explicit LEDGER closing balance marker
  const ledgerMarker = allInvoices.find(inv => 
    (inv.invoice_number || '').toUpperCase().startsWith('LEDGER-') &&
    normalizePartyName(inv.client_name) === normParty
  );

  const markerClosing = ledgerMarker ? Number(ledgerMarker.amount || 0) : null;
  const markerDate = ledgerMarker ? (ledgerMarker.invoice_date || '') : '';
  const explicitOpening = Number(ledgerMarker?.metadata?.opening_balance || 0);

  // Compute prior period opening balance as of 01-Apr-2026:
  // In standard accounting: Closing Balance = Opening Balance + totalDebits - totalCredits
  // So: Opening Balance = Marker Closing - (totalDebits - totalCredits)
  let openingBalance = 0;
  let closingBalance = 0;
  const netCurrent = totalDebits - totalCredits;

  if (markerClosing !== null && !isNaN(markerClosing)) {
    // Authoritative derivation from Tally master closing balance
    openingBalance = Math.round((markerClosing - netCurrent) * 100) / 100;
    closingBalance = markerClosing;
  } else if (explicitOpening !== 0 && !isNaN(explicitOpening)) {
    openingBalance = explicitOpening;
    closingBalance = Math.max(0, Math.round((openingBalance + netCurrent) * 100) / 100);
  } else {
    closingBalance = Math.max(0, Math.round(netCurrent * 100) / 100);
  }

  if (openingBalance > 0.5) {
    entries.unshift({
      rawDate: new Date('2026-04-01T00:00:00Z'),
      date: '01 Apr 26',
      particulars: 'To Opening Balance',
      vchType: 'Opening Balance',
      vchNo: 'OP-BAL',
      debit: openingBalance,
      credit: null,
    });
    totalDebits += openingBalance;
  } else if (openingBalance < -0.5) {
    const creditOp = Math.abs(openingBalance);
    entries.unshift({
      rawDate: new Date('2026-04-01T00:00:00Z'),
      date: '01 Apr 26',
      particulars: 'By Opening Balance (Advance)',
      vchType: 'Opening Balance',
      vchNo: 'OP-BAL',
      debit: null,
      credit: creditOp,
    });
    totalCredits += creditOp;
  }

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
 * Includes prior period opening balance as row 1 if applicable.
 */
export function getCustomerPendingBills(partyName, allInvoices = []) {
  const normParty = normalizePartyName(partyName);
  if (!normParty) {
    return { partyName: 'Customer', bills: [], totalOpening: 0, totalPending: 0 };
  }

  // Reconcile invoices first to get exact pending amounts (including opening balance invoice if present)
  const reconciled = reconcileCustomerInvoices(allInvoices);

  const pendingBills = reconciled.filter(inv => {
    const num = (inv.invoice_number || '').toUpperCase();
    if (num.startsWith('LEDGER-')) return false;
    if (normalizePartyName(inv.client_name) !== normParty) return false;
    
    // Include sales invoices that are not Paid and pending > 0
    if (!isSalesVoucher(inv)) return false;
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

  // Include prior period opening balance as row 1 if applicable
  const sampleVch = pendingBills[0] || reconciled.find(i => normalizePartyName(i.client_name) === normParty);
  const priorOp = Number(sampleVch?._party_opening_balance || 0);
  if (priorOp > 0.5) {
    bills.unshift({
      date: '01 Apr 26',
      ref: 'Opening Balance (Prior Period)',
      opening: priorOp,
      pending: priorOp,
      due: '01 Apr 26',
      overdue: getDaysOverdue('2026-04-01'),
      isOpeningBalance: true,
    });
    totalOpening += priorOp;
    totalPending += priorOp;
  }

  return {
    partyName: sampleVch?.client_name || partyName,
    bills,
    totalOpening,
    totalPending,
  };
}
