# End-to-end demo: from what Lauri sees to what Nordea approves

Concept · fictional data and people · demo credit rules, not Nordea's credit policy.

## The pipeline

```
Inputs                 Airlock (Lauri's side)           Lauri decides          Context Cabinet         Nordea
smart glasses   ─┐     1 split into short signals       "From your inputs"     (Supabase)              /workspace
WhatsApp chat   ─┤     2 usefulness filter (AI) +       Save · Keep private    User DB · Context       case = only what
documents       ─┼──►    privacy floor (code)       ──► · Drop, per item  ──►  memory · Nordea DB ──►  Lauri shared for it,
bank data (CSV) ─┤     3 duplicates merged, no                                 + pipeline_records      numbers by bank code,
Abel chat       ─┤       invented numbers                                      + audit log             AI writes words only,
personal AI     ─┘     raw input & dropped signals                                                     2nd approver > 250 k
cloud (later)          are never stored
```

- **Only what is useful** reaches Lauri: something that touches a goal, changes a number the bank plans
  with, corrects something, or is a lasting preference. Health, other people's private matters and similar
  are marked private by code, whatever the AI says. Without AI, a rule check decides and says so.
- **Only what Lauri shared** reaches Nordea: a case opens when he taps "Connect me", holds only what
  matters for its purpose (for a home loan: not his car goal or a holiday), until a date, and every read is
  logged in his "Who sees it".

## One-time setup (Supabase)

Run `supabase/pipeline.sql` once in the Supabase SQL editor. It needs no passwords or new secrets: the app
uses the `SUPABASE_URL` and `SUPABASE_SECRET_KEY` it already has. Afterwards More → Demo → "Database"
says "Saved in Supabase" and a restart loses nothing.

## Three windows

| Window | URL | Who |
| --- | --- | --- |
| Smart glasses | `/glasses` | Lauri's view, plus the presenter's "Demo steps" panel |
| Customer app | `/` | Lauri's phone (Abel, What Abel knows) |
| Nordea workspace | `/workspace` | Kalle (adviser) and Sanna (credit officer), desktop |

All three are in More → Demo too.

## The story (about 6 minutes)

1. **Glasses → steps 1-4.** In front of the flat (sign 389 000 €), "Am I on track?" (Abel answers from
   what Lauri allowed), Mia calls (plans + a doctor's appointment), lunch at Field & Fork.
2. **Glasses → Sync to my Context Cabinet.** E.g. "11 heard → 3 useful + 1 private · 7 dropped". The menu,
   the bus stop and small talk never leave the glasses.
3. **Other inputs** (same pipeline): WhatsApp chat with Mia, a payslip, a bank-data update, a personal-AI
   cloud calendar.
4. **App → What Abel knows → From your inputs.** Save / Keep private / Drop. Keep the doctor's appointment
   private.
5. **App → Abel:** "Can I get a mortgage pre-approval for the flat?" The card lists only what matters for a
   home loan → **Connect me**.
6. **Workspace (Kalle) → Today → Open case.** Shared items with their sources; affordability by bank code
   (the price comes from the glasses' sign); **Draft summary** (AI, cited, number-checked); ask a question
   → it appears on Lauri's Home and in his chat; his answer lands in the case.
7. **Pre-approve 300 000 €** with a reason → above 250 000 €, so switch to **Sanna** and confirm the same
   amount. Lauri's chat gets the decision, the reason and what was used.
8. **Workspace → Pipeline** (presenter view): 31 heard → 14 useful → 12 saved → 9 shared → used in the
   decision; dropped rows are readable only here, from the server's memory, never from storage.
   **Audit log:** every read, by whom and why.

Reset: More → Demo → Reset demo data (clears this server and Supabase, reloads the demo customers).

## Later inputs and products

The pipeline takes any input as `POST /api/ingest {userId, source, signals | text | file}` with
`source` = glasses · whatsapp · document · csv · abel · cloud. New Nordea products are new case kinds next
to `home_loan_preapproval` (a meeting, a savings review): the same share → logged read → bank-code numbers
→ cited AI words → human decision → back to the customer.
