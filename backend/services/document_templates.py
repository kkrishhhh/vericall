"""HTML renderers for auto-filled documents."""

from __future__ import annotations

from html import escape


def _money(value: object) -> str:
    try:
        num = float(value or 0)
    except (TypeError, ValueError):
        return "-"
    return f"INR {num:,.0f}"


def _text(value: object) -> str:
    if value is None:
        return ""
    return escape(str(value))


def render_application_form_html(doc: dict) -> str:
    """Return a print-friendly HTML representation of the auto-filled application form."""
    fields = doc.get("fields") or {}

    applicant_name = _text(fields.get("applicant_name"))
    phone = _text(fields.get("phone"))
    declared_age = _text(fields.get("declared_age"))
    employment_type = _text(fields.get("employment_type"))
    monthly_income = _money(fields.get("monthly_income_inr"))
    loan_purpose = _text(fields.get("loan_purpose"))
    loan_type = _text(fields.get("loan_type"))
    consent = "Yes" if fields.get("verbal_consent_captured") else "No"
    app_time = _text(fields.get("application_timestamp"))
    campaign_link = _text(fields.get("campaign_link"))
    document_requirements = fields.get("document_requirements") or []

    risk_band = _text(fields.get("risk_band"))
    risk_score = _text(fields.get("risk_score"))
    bureau_score = _text(fields.get("bureau_score"))
    propensity_score = _text(fields.get("propensity_score"))

    offer_status = _text(fields.get("offer_status"))
    approved_amount = _money(fields.get("approved_amount"))
    interest_rate = _text(fields.get("interest_rate"))
    tenure = _text(fields.get("tenure_months"))
    emi = _money(fields.get("monthly_emi"))

    session_id = _text(fields.get("session_id"))
    aadhaar_photo_base64 = _text(fields.get("aadhaar_photo_base64"))
    photo_html = ""
    if aadhaar_photo_base64:
        photo_html = f'<img class="photo" src="{aadhaar_photo_base64}" alt="Applicant photo" />'

    checklist_rows: list[str] = []
    for doc_item in document_requirements:
        if isinstance(doc_item, dict):
            label = _text(doc_item.get("label") or "Document")
            status = "Required" if doc_item.get("required", True) else "Optional"
        else:
            label = _text(doc_item)
            status = "Required"
        checklist_rows.append(
            f'<div class="row full"><div class="label">{label}</div><div class="value">{status}</div></div>'
        )
    checklist_html = "".join(checklist_rows)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Loan Application Form - {applicant_name or 'Applicant'}</title>
  <style>
    :root {{
      --ink: #0f172a;
      --muted: #475569;
      --line: #cbd5e1;
      --panel: #f8fafc;
      --brand: #0b5f82;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: 'Segoe UI', Tahoma, sans-serif; color: var(--ink); background: #eef2f7; }}
    .page {{ width: 210mm; min-height: 297mm; margin: 10mm auto; background: white; border: 1px solid var(--line); }}
    .header {{ position: relative; padding: 16mm 14mm 8mm; border-bottom: 2px solid var(--brand); }}
    .title {{ margin: 0; font-size: 24px; letter-spacing: 0.2px; }}
    .subtitle {{ margin-top: 6px; color: var(--muted); font-size: 13px; }}
    .photo {{
      position: absolute;
      top: 12mm;
      right: 14mm;
      width: 34mm;
      height: 42mm;
      border: 1px solid var(--line);
      border-radius: 4px;
      object-fit: cover;
      background: #f1f5f9;
    }}
    .section {{ padding: 10mm 14mm 0; }}
    .section h2 {{ margin: 0 0 8px; font-size: 15px; color: var(--brand); border-bottom: 1px solid var(--line); padding-bottom: 5px; }}
    .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }}
    .row {{ background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; min-height: 54px; }}
    .label {{ color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }}
    .value {{ margin-top: 5px; font-size: 15px; font-weight: 600; word-break: break-word; }}
    .full {{ grid-column: 1 / -1; }}
    .footer {{ padding: 12mm 14mm 14mm; color: var(--muted); font-size: 12px; }}
    .sign-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 18px; }}
    .sign-box {{ border-top: 1px solid var(--line); padding-top: 8px; }}
    @media print {{
      body {{ background: white; }}
      .page {{ margin: 0; border: none; width: auto; min-height: auto; }}
    }}
  </style>
</head>
<body>
  <article class="page">
    <header class="header">
      <h1 class="title">Poonawalla Fincorp - Loan Application Form</h1>
      <p class="subtitle">Auto-filled from AI onboarding session | Session ID: {session_id}</p>
      {photo_html}
    </header>

    <section class="section">
      <h2>Applicant Details</h2>
      <div class="grid">
        <div class="row"><div class="label">Applicant Name</div><div class="value">{applicant_name}</div></div>
        <div class="row"><div class="label">Phone Number</div><div class="value">{phone}</div></div>
        <div class="row"><div class="label">Declared Age</div><div class="value">{declared_age}</div></div>
        <div class="row"><div class="label">Employment Type</div><div class="value">{employment_type}</div></div>
        <div class="row"><div class="label">Monthly Income</div><div class="value">{monthly_income}</div></div>
        <div class="row"><div class="label">Loan Type</div><div class="value">{loan_type}</div></div>
        <div class="row"><div class="label">Verbal Consent Captured</div><div class="value">{consent}</div></div>
        <div class="row full"><div class="label">Loan Purpose</div><div class="value">{loan_purpose}</div></div>
        <div class="row full"><div class="label">Campaign Link</div><div class="value">{campaign_link}</div></div>
        <div class="row"><div class="label">Application Time</div><div class="value">{app_time}</div></div>
      </div>
    </section>

    <section class="section">
      <h2>Document Checklist</h2>
      <div class="grid">
        {checklist_html}
      </div>
    </section>

    <section class="section">
      <h2>Risk and Eligibility Snapshot</h2>
      <div class="grid">
        <div class="row"><div class="label">Risk Band</div><div class="value">{risk_band}</div></div>
        <div class="row"><div class="label">Risk Score</div><div class="value">{risk_score}</div></div>
        <div class="row"><div class="label">Bureau Score</div><div class="value">{bureau_score}</div></div>
        <div class="row"><div class="label">Propensity Score</div><div class="value">{propensity_score}</div></div>
      </div>
    </section>

    <section class="section">
      <h2>Offer Summary</h2>
      <div class="grid">
        <div class="row"><div class="label">Offer Status</div><div class="value">{offer_status}</div></div>
        <div class="row"><div class="label">Approved Amount</div><div class="value">{approved_amount}</div></div>
        <div class="row"><div class="label">Interest Rate (%)</div><div class="value">{interest_rate}</div></div>
        <div class="row"><div class="label">Tenure (Months)</div><div class="value">{tenure}</div></div>
        <div class="row"><div class="label">Monthly EMI</div><div class="value">{emi}</div></div>
      </div>
    </section>

    <footer class="footer">
      <p>This is an auto-generated pre-fill document. Final sanction remains subject to policy and verification.</p>
      <div class="sign-grid">
        <div class="sign-box">Applicant Signature</div>
        <div class="sign-box">Authorized Signatory</div>
      </div>
    </footer>
  </article>
</body>
</html>
"""
