/**
 * AI Report engine — NL order → structured report from DB
 * Default: intent classifier (no external key required)
 * Optional: OPENAI_API_KEY or XAI_API_KEY for freer NL
 */
const pool = require('../config/db');

const INTENTS = [
  {
    id: 'customers_list',
    patterns: [/customer/i, /cif/i, /member list/i, /client/i, /کسٹمر/i, /گاہک/i],
    title: 'Customer register',
  },
  {
    id: 'accounts_balances',
    patterns: [/account/i, /casa/i, /balance/i, /deposit account/i, /اکاؤنٹ/i, /بیلنس/i],
    title: 'Account balances',
  },
  {
    id: 'trial_balance',
    patterns: [/trial\s*balance/i, /\btb\b/i, /gl balance/i, /ledger summary/i, /ٹرائل/i],
    title: 'Trial balance',
  },
  {
    id: 'loan_portfolio',
    patterns: [/loan/i, /financ/i, /portfolio/i, /disburse/i, /قرض/i, /فنانس/i],
    title: 'Financing portfolio',
  },
  {
    id: 'term_deposits',
    patterns: [/term\s*deposit/i, /\btd\b/i, /tdr/i, /fixed deposit/i, /میعادی/i],
    title: 'Term deposits',
  },
  {
    id: 'eod_status',
    patterns: [/eod/i, /end of day/i, /day.?end/i, /accrual/i],
    title: 'EOD status',
  },
  {
    id: 'approvals_pending',
    patterns: [/approval/i, /pending/i, /maker.?checker/i, /queue/i],
    title: 'Pending approvals',
  },
  {
    id: 'nadra_history',
    patterns: [/nadra/i, /verif/i, /cnic check/i],
    title: 'NADRA verifications',
  },
  {
    id: 'cheque_books',
    patterns: [/cheque/i, /check book/i, /instrument/i],
    title: 'Cheque books',
  },
  {
    id: 'kyc_pending',
    patterns: [/kyc/i, /onboard/i, /compliance case/i],
    title: 'KYC cases',
  },
];

function classify(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return null;
  let best = null;
  let score = 0;
  for (const intent of INTENTS) {
    let s = 0;
    for (const p of intent.patterns) {
      if (p.test(text)) s += 1;
    }
    if (s > score) {
      score = s;
      best = intent;
    }
  }
  return best;
}

function limitFromPrompt(prompt, def = 100) {
  const m = String(prompt).match(/\b(top|last|limit)\s+(\d{1,4})\b/i) ||
    String(prompt).match(/\b(\d{1,4})\s+(rows|records|customers|accounts)\b/i);
  if (m) {
    const n = parseInt(m[2] || m[1], 10);
    if (n > 0 && n <= 500) return n;
  }
  return def;
}

async function runIntent(intent, prompt) {
  const limit = limitFromPrompt(prompt);
  const id = intent.id;

  if (id === 'customers_list') {
    const [rows] = await pool.query(
      `SELECT id, customer_no, full_name, cnic, phone, kyc_status, status, city, created_at
       FROM cbs_customers ORDER BY id DESC LIMIT ?`,
      [limit]
    );
    return {
      columns: ['id', 'customer_no', 'full_name', 'cnic', 'phone', 'kyc_status', 'status', 'city'],
      rows,
      summary: `${rows.length} customers (latest first)`,
    };
  }

  if (id === 'accounts_balances') {
    try {
      const [rows] = await pool.query(
        `SELECT id, account_no, customer_id, product_code, account_type, balance, status, branch_code
         FROM cbs_accounts ORDER BY id DESC LIMIT ?`,
        [limit]
      );
      const total = rows.reduce((s, r) => s + Number(r.balance || 0), 0);
      return {
        columns: ['account_no', 'customer_id', 'product_code', 'balance', 'status', 'branch_code'],
        rows,
        summary: `${rows.length} accounts · sum balance ${total.toFixed(2)}`,
      };
    } catch (e) {
      return { columns: [], rows: [], summary: e.message, error: true };
    }
  }

  if (id === 'trial_balance') {
    try {
      const [rows] = await pool.query(
        `SELECT account_code AS gl_code,
                SUM(CASE WHEN dc='D' OR dc='DR' THEN amount ELSE 0 END) AS debit,
                SUM(CASE WHEN dc='C' OR dc='CR' THEN amount ELSE 0 END) AS credit
         FROM cbs_journal_lines
         GROUP BY account_code
         ORDER BY account_code
         LIMIT ?`,
        [limit]
      );
      return {
        columns: ['gl_code', 'debit', 'credit'],
        rows,
        summary: `Trial balance lines: ${rows.length}`,
      };
    } catch (e) {
      try {
        const [rows] = await pool.query(
          `SELECT gl_code, debit_balance AS debit, credit_balance AS credit FROM cbs_coa LIMIT ?`,
          [limit]
        );
        return { columns: ['gl_code', 'debit', 'credit'], rows, summary: 'COA balances' };
      } catch (e2) {
        return { columns: [], rows: [], summary: e.message, error: true };
      }
    }
  }

  if (id === 'loan_portfolio') {
    try {
      const [rows] = await pool.query(
        `SELECT id, contract_no, customer_id, product_code, principal, outstanding, status, disbursed_at
         FROM cbs_financing_contracts ORDER BY id DESC LIMIT ?`,
        [limit]
      );
      const os = rows.reduce((s, r) => s + Number(r.outstanding || r.principal || 0), 0);
      return {
        columns: ['contract_no', 'customer_id', 'product_code', 'principal', 'outstanding', 'status'],
        rows,
        summary: `${rows.length} contracts · OS ${os.toFixed(2)}`,
      };
    } catch (e) {
      return { columns: [], rows: [], summary: e.message, error: true };
    }
  }

  if (id === 'term_deposits') {
    try {
      const [rows] = await pool.query(
        `SELECT id, td_no, customer_id, principal, maturity_date, status, product_code
         FROM cbs_term_deposits ORDER BY id DESC LIMIT ?`,
        [limit]
      );
      return {
        columns: ['td_no', 'customer_id', 'principal', 'maturity_date', 'status', 'product_code'],
        rows,
        summary: `${rows.length} term deposits`,
      };
    } catch (e) {
      return { columns: [], rows: [], summary: e.message, error: true };
    }
  }

  if (id === 'eod_status') {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM eod_calendar ORDER BY business_date DESC LIMIT 10`
      );
      return {
        columns: Object.keys(rows[0] || { business_date: 1, status: 1 }),
        rows,
        summary: 'Recent EOD calendar',
      };
    } catch (e) {
      return { columns: [], rows: [], summary: e.message, error: true };
    }
  }

  if (id === 'approvals_pending') {
    try {
      const [rows] = await pool.query(
        `SELECT id, request_type, status, created_by, created_at
         FROM cbs_approval_requests
         WHERE status IN ('pending','PENDING') OR status IS NULL
         ORDER BY id DESC LIMIT ?`,
        [limit]
      );
      return {
        columns: ['id', 'request_type', 'status', 'created_by', 'created_at'],
        rows,
        summary: `${rows.length} pending approvals`,
      };
    } catch (e) {
      return { columns: [], rows: [], summary: e.message, error: true };
    }
  }

  if (id === 'nadra_history') {
    try {
      const [rows] = await pool.query(
        `SELECT id, cnic, status, verified, match_score, mode, created_at
         FROM cbs_nadra_verifications ORDER BY id DESC LIMIT ?`,
        [limit]
      );
      return {
        columns: ['id', 'cnic', 'status', 'verified', 'match_score', 'mode', 'created_at'],
        rows,
        summary: `${rows.length} NADRA checks`,
      };
    } catch (e) {
      return { columns: [], rows: [], summary: e.message, error: true };
    }
  }

  if (id === 'cheque_books') {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM cbs_cheque_books ORDER BY id DESC LIMIT ?`,
        [limit]
      );
      const cols = rows[0] ? Object.keys(rows[0]).slice(0, 8) : [];
      return { columns: cols, rows, summary: `${rows.length} cheque books` };
    } catch (e) {
      return { columns: [], rows: [], summary: e.message, error: true };
    }
  }

  if (id === 'kyc_pending') {
    try {
      const [rows] = await pool.query(
        `SELECT id, customer_id, status, risk_rating, created_at
         FROM cbs_kyc_cases ORDER BY id DESC LIMIT ?`,
        [limit]
      );
      return {
        columns: ['id', 'customer_id', 'status', 'risk_rating', 'created_at'],
        rows,
        summary: `${rows.length} KYC cases`,
      };
    } catch (e) {
      return { columns: [], rows: [], summary: e.message, error: true };
    }
  }

  return { columns: [], rows: [], summary: 'Unknown intent', error: true };
}

async function optionalLlmHint(prompt) {
  const key = process.env.XAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const base = process.env.XAI_API_KEY
      ? 'https://api.x.ai/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';
    const model = process.env.XAI_API_KEY ? (process.env.XAI_MODEL || 'grok-2-latest') : 'gpt-4o-mini';
    const catalog = INTENTS.map((i) => i.id).join(', ');
    const res = await fetch(base, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `Map user report request to one intent id only: ${catalog}. Reply with JSON {"intent":"..."} only.`,
          },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const m = text.match(/"intent"\s*:\s*"([^"]+)"/);
    if (m) return INTENTS.find((i) => i.id === m[1]) || null;
  } catch (_) {}
  return null;
}

async function generateReport(prompt, user) {
  const started = Date.now();
  let intent = classify(prompt);
  if (!intent) intent = await optionalLlmHint(prompt);
  if (!intent) {
    return {
      ok: false,
      prompt,
      message:
        'Samajh nahi aya. Examples: "customer list", "account balances", "trial balance", "loan portfolio", "pending approvals", "NADRA history", "term deposits", "EOD status"',
      intents: INTENTS.map((i) => ({ id: i.id, title: i.title })),
    };
  }
  const data = await runIntent(intent, prompt);
  return {
    ok: !data.error,
    prompt,
    intent: intent.id,
    title: intent.title,
    summary: data.summary,
    columns: data.columns,
    rows: data.rows,
    row_count: (data.rows || []).length,
    generated_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    requested_by: user?.userId || user?.id || null,
    engine: process.env.XAI_API_KEY || process.env.OPENAI_API_KEY ? 'nl+llm' : 'nl-rules',
  };
}

module.exports = { generateReport, INTENTS, classify };
