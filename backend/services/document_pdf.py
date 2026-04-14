"""PDF renderers for auto-filled documents."""

from __future__ import annotations

import base64
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


def _money(value: object) -> str:
    try:
        num = float(value or 0)
    except (TypeError, ValueError):
        return "-"
    return f"INR {num:,.0f}"


def _text(value: object) -> str:
    if value is None:
        return ""
    return str(value)


def _draw_aadhaar_photo(pdf: canvas.Canvas, photo_data_url: str | None, page_width: float, page_height: float) -> None:
    if not photo_data_url:
        return
    try:
        payload = photo_data_url.split(",", 1)[1] if "," in photo_data_url else photo_data_url
        raw = base64.b64decode(payload)
        img = ImageReader(BytesIO(raw))
        photo_w = 96
        photo_h = 118
        x = page_width - 40 - photo_w
        y = page_height - 50 - photo_h + 8
        pdf.drawImage(img, x, y, width=photo_w, height=photo_h, preserveAspectRatio=True, mask="auto")
        pdf.rect(x, y, photo_w, photo_h)
    except Exception:
        return


def render_application_form_pdf(doc: dict) -> bytes:
    """Generate a simple printable PDF for the application form."""
    fields = doc.get("fields") or {}

    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    y = height - 50

    def title(line: str) -> None:
        nonlocal y
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(40, y, line)
        y -= 24

    def section(line: str) -> None:
        nonlocal y
        y -= 8
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(40, y, line)
        y -= 16

    def row(label: str, value: object) -> None:
        nonlocal y
        if y < 70:
            pdf.showPage()
            y = height - 50
        pdf.setFont("Helvetica", 10)
        pdf.drawString(48, y, f"{label}:")
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(200, y, _text(value))
        y -= 14

    title("Poonawalla Fincorp - Loan Application Form")
    _draw_aadhaar_photo(pdf, _text(fields.get("aadhaar_photo_base64")), width, height)
    row("Session ID", fields.get("session_id"))
    row("Application Time", fields.get("application_timestamp"))

    section("Applicant Details")
    row("Applicant Name", fields.get("applicant_name"))
    row("Phone", fields.get("phone"))
    row("Declared Age", fields.get("declared_age"))
    row("Employment Type", fields.get("employment_type"))
    row("Monthly Income", _money(fields.get("monthly_income_inr")))
    row("Loan Purpose", fields.get("loan_purpose"))
    row("Verbal Consent Captured", "Yes" if fields.get("verbal_consent_captured") else "No")

    section("Risk and Decision")
    row("Risk Band", fields.get("risk_band"))
    row("Risk Score", fields.get("risk_score"))
    row("Bureau Score", fields.get("bureau_score"))
    row("Propensity Score", fields.get("propensity_score"))

    section("Offer Summary")
    row("Offer Status", fields.get("offer_status"))
    row("Approved Amount", _money(fields.get("approved_amount")))
    row("Interest Rate", f"{_text(fields.get('interest_rate'))}%")
    row("Tenure", f"{_text(fields.get('tenure_months'))} months")
    row("Monthly EMI", _money(fields.get("monthly_emi")))

    y -= 24
    pdf.setFont("Helvetica", 9)
    pdf.drawString(40, y, "This is an auto-generated pre-fill document. Final sanction remains subject to policy and verification.")
    y -= 36
    pdf.line(40, y, 240, y)
    pdf.line(320, y, 520, y)
    y -= 12
    pdf.setFont("Helvetica", 9)
    pdf.drawString(40, y, "Applicant Signature")
    pdf.drawString(320, y, "Authorized Signatory")

    pdf.save()
    return buf.getvalue()
