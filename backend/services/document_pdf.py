"""PDF renderers for auto-filled documents."""

from __future__ import annotations

import base64
from io import BytesIO
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
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


def _draw_photo_card(pdf: canvas.Canvas, photo_data_url: str | None, x: float, y: float, w: float, h: float) -> None:
    """Draw a framed selfie area with graceful fallback when image is unavailable."""
    pdf.setStrokeColor(colors.HexColor("#CBD5E1"))
    pdf.setFillColor(colors.HexColor("#F8FAFC"))
    pdf.roundRect(x, y, w, h, 8, stroke=1, fill=1)

    if not photo_data_url:
        pdf.setFillColor(colors.HexColor("#94A3B8"))
        pdf.setFont("Helvetica", 10)
        pdf.drawCentredString(x + (w / 2), y + (h / 2), "No selfie available")
        return

    try:
        payload = photo_data_url.split(",", 1)[1] if "," in photo_data_url else photo_data_url
        raw = base64.b64decode(payload)
        img = ImageReader(BytesIO(raw))

        pad = 8
        draw_w = w - (pad * 2)
        draw_h = h - (pad * 2)
        pdf.drawImage(
            img,
            x + pad,
            y + pad,
            width=draw_w,
            height=draw_h,
            preserveAspectRatio=True,
            anchor="c",
            mask="auto",
        )
    except Exception:
        pdf.setFillColor(colors.HexColor("#94A3B8"))
        pdf.setFont("Helvetica", 10)
        pdf.drawCentredString(x + (w / 2), y + (h / 2), "Unable to render selfie")


def _clip_text(pdf: canvas.Canvas, value: object, max_width: float, font_name: str, font_size: float) -> str:
    """Clip long text with ellipsis so fixed-width cells never overlap."""
    txt = _text(value)
    if not txt:
        return "-"

    if pdf.stringWidth(txt, font_name, font_size) <= max_width:
        return txt

    ellipsis = "..."
    clipped = txt
    while clipped and pdf.stringWidth(clipped + ellipsis, font_name, font_size) > max_width:
        clipped = clipped[:-1]
    return (clipped + ellipsis) if clipped else ellipsis


def render_application_form_pdf(doc: dict) -> bytes:
    """Generate a structured printable PDF for the final application summary."""
    fields = doc.get("fields") or {}

    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    margin_x = 34
    card_w = width - (margin_x * 2)

    # Header
    header_y = height - 102
    pdf.setFillColor(colors.HexColor("#1B2B6B"))
    pdf.roundRect(margin_x, header_y, card_w, 66, 10, stroke=0, fill=1)

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(margin_x + 16, header_y + 40, "Poonawalla Fincorp")
    pdf.setFont("Helvetica", 12)
    pdf.drawString(margin_x + 16, header_y + 20, "Final Application Summary")
    pdf.setFont("Helvetica", 9)
    generated_at = datetime.now().strftime("%d %b %Y, %I:%M %p")
    pdf.drawRightString(margin_x + card_w - 16, header_y + 20, f"Generated: {generated_at}")

    main_y = 86
    main_h = header_y - main_y - 14
    pdf.setStrokeColor(colors.HexColor("#CBD5E1"))
    pdf.setFillColor(colors.white)
    pdf.roundRect(margin_x, main_y, card_w, main_h, 10, stroke=1, fill=1)

    inner_x = margin_x + 14
    inner_w = card_w - 28
    top_y = main_y + main_h - 14
    right_col_w = 182
    gap = 12
    left_col_w = inner_w - right_col_w - gap
    left_x = inner_x
    right_x = left_x + left_col_w + gap

    # Row 1: applicant + photo
    row1_h = 230
    row1_y = top_y - row1_h
    pdf.setStrokeColor(colors.HexColor("#DBEAFE"))
    pdf.setFillColor(colors.HexColor("#F8FBFF"))
    pdf.roundRect(left_x, row1_y, left_col_w, row1_h, 8, stroke=1, fill=1)
    pdf.setFillColor(colors.HexColor("#1E3A8A"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(left_x + 12, row1_y + row1_h - 22, "Applicant Profile")

    applicant_rows = [
        ("Session ID", fields.get("session_id")),
        ("Application Time", fields.get("application_timestamp")),
        ("Applicant Name", fields.get("applicant_name")),
        ("Phone", fields.get("phone")),
        ("Declared Age", fields.get("declared_age")),
        ("Employment", fields.get("employment_type")),
        ("Monthly Income", _money(fields.get("monthly_income_inr"))),
    ]

    label_w = 110
    row_h = 27
    y_line = row1_y + row1_h - 42
    for label, value in applicant_rows:
        pdf.setStrokeColor(colors.HexColor("#E2E8F0"))
        pdf.line(left_x + 10, y_line - 17, left_x + left_col_w - 10, y_line - 17)
        pdf.setFont("Helvetica", 9)
        pdf.setFillColor(colors.HexColor("#64748B"))
        pdf.drawString(left_x + 12, y_line - 9, label)
        pdf.setFont("Helvetica-Bold", 10)
        pdf.setFillColor(colors.HexColor("#0F172A"))
        clipped = _clip_text(pdf, value, left_col_w - label_w - 26, "Helvetica-Bold", 10)
        pdf.drawString(left_x + label_w, y_line - 9, clipped)
        y_line -= row_h

    pdf.setStrokeColor(colors.HexColor("#DBEAFE"))
    pdf.setFillColor(colors.HexColor("#EFF6FF"))
    pdf.roundRect(right_x, row1_y, right_col_w, row1_h, 8, stroke=1, fill=1)
    pdf.setFillColor(colors.HexColor("#1E3A8A"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(right_x + 12, row1_y + row1_h - 22, "Identity Photo")
    identity_photo = (
        _text(fields.get("aadhaar_photo_base64"))
        or _text(fields.get("selfie_image"))
        or _text(fields.get("pan_photo_base64"))
    )
    _draw_photo_card(pdf, identity_photo, right_x + 12, row1_y + 12, right_col_w - 24, row1_h - 48)

    # Row 2: loan summary + risk summary
    row2_h = 145
    row2_y = row1_y - 12 - row2_h
    pdf.setStrokeColor(colors.HexColor("#BFDBFE"))
    pdf.setFillColor(colors.HexColor("#F8FBFF"))
    pdf.roundRect(left_x, row2_y, left_col_w, row2_h, 8, stroke=1, fill=1)
    pdf.setFillColor(colors.HexColor("#1E40AF"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(left_x + 12, row2_y + row2_h - 20, "Loan Summary")

    loan_type = _clip_text(pdf, fields.get("loan_type"), left_col_w - 140, "Helvetica-Bold", 11)
    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(colors.HexColor("#475569"))
    pdf.drawString(left_x + 12, row2_y + row2_h - 44, "Loan Type")
    pdf.setFont("Helvetica-Bold", 11)
    pdf.setFillColor(colors.HexColor("#0F172A"))
    pdf.drawString(left_x + 100, row2_y + row2_h - 44, loan_type)

    purpose = _clip_text(pdf, fields.get("loan_purpose"), left_col_w - 140, "Helvetica", 10)
    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(colors.HexColor("#475569"))
    pdf.drawString(left_x + 12, row2_y + row2_h - 66, "Loan Purpose")
    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(colors.HexColor("#0F172A"))
    pdf.drawString(left_x + 100, row2_y + row2_h - 66, purpose)

    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(colors.HexColor("#475569"))
    pdf.drawString(left_x + 12, row2_y + row2_h - 88, "Approved Amount")
    pdf.setFont("Helvetica-Bold", 17)
    pdf.setFillColor(colors.HexColor("#065F46"))
    pdf.drawString(left_x + 12, row2_y + 20, _money(fields.get("approved_amount")))

    pdf.setStrokeColor(colors.HexColor("#BFDBFE"))
    pdf.setFillColor(colors.HexColor("#F8FBFF"))
    pdf.roundRect(right_x, row2_y, right_col_w, row2_h, 8, stroke=1, fill=1)
    pdf.setFillColor(colors.HexColor("#1E40AF"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(right_x + 12, row2_y + row2_h - 20, "Risk Snapshot")

    risk_rows = [
        ("Risk Band", fields.get("risk_band") or "-"),
        ("Risk Score", fields.get("risk_score") or "-"),
        ("Bureau Score", fields.get("bureau_score") or "-"),
        ("Propensity", fields.get("propensity_score") or "-"),
    ]
    ry = row2_y + row2_h - 40
    for label, value in risk_rows:
        pdf.setFont("Helvetica", 8.5)
        pdf.setFillColor(colors.HexColor("#475569"))
        pdf.drawString(right_x + 12, ry, label)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.setFillColor(colors.HexColor("#0F172A"))
        pdf.drawRightString(right_x + right_col_w - 12, ry, _clip_text(pdf, value, 80, "Helvetica-Bold", 9))
        ry -= 23

    # Row 3: offer terms + checklist
    row3_h = 126
    row3_y = row2_y - 12 - row3_h
    pdf.setStrokeColor(colors.HexColor("#DBEAFE"))
    pdf.setFillColor(colors.HexColor("#FFFFFF"))
    pdf.roundRect(inner_x, row3_y, inner_w, row3_h, 8, stroke=1, fill=1)

    pdf.setFillColor(colors.HexColor("#1E40AF"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(inner_x + 12, row3_y + row3_h - 20, "Offer Terms")

    terms = [
        ("Offer Status", fields.get("offer_status") or "-"),
        ("Interest Rate", f"{_text(fields.get('interest_rate'))}%" if _text(fields.get("interest_rate")).strip() else "-"),
        ("Tenure", f"{_text(fields.get('tenure_months'))} months" if _text(fields.get("tenure_months")).strip() else "-"),
        ("Monthly EMI", _money(fields.get("monthly_emi"))),
        ("Processing Fee", _money(fields.get("processing_fee"))),
        ("Consent Captured", "Yes" if fields.get("verbal_consent_captured") else "No"),
    ]

    col_w = (inner_w - 24) / 2
    gx = inner_x + 12
    gy = row3_y + row3_h - 42
    step = 22
    for i, (label, value) in enumerate(terms):
        col = i % 2
        row = i // 2
        x = gx + (col * col_w)
        y = gy - (row * step)
        pdf.setFont("Helvetica", 8.5)
        pdf.setFillColor(colors.HexColor("#475569"))
        pdf.drawString(x, y, label)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.setFillColor(colors.HexColor("#0F172A"))
        clipped = _clip_text(pdf, value, col_w - 92, "Helvetica-Bold", 9)
        pdf.drawRightString(x + col_w - 8, y, clipped)

    # Footer
    footer_y = main_y + 18
    pdf.setStrokeColor(colors.HexColor("#E2E8F0"))
    pdf.line(inner_x, footer_y + 30, inner_x + inner_w, footer_y + 30)
    pdf.setFillColor(colors.HexColor("#64748B"))
    pdf.setFont("Helvetica", 8.5)
    pdf.drawString(inner_x, footer_y + 16, "This document summarizes customer profile, risk checks, and generated offer terms.")
    pdf.drawString(inner_x, footer_y + 5, "Final sanction remains subject to policy controls and verification checks.")

    pdf.setStrokeColor(colors.HexColor("#94A3B8"))
    pdf.line(inner_x + 6, footer_y - 3, inner_x + 176, footer_y - 3)
    pdf.line(inner_x + inner_w - 176, footer_y - 3, inner_x + inner_w - 6, footer_y - 3)
    pdf.setFillColor(colors.HexColor("#64748B"))
    pdf.setFont("Helvetica", 8)
    pdf.drawString(inner_x + 6, footer_y - 16, "Applicant Signature")
    pdf.drawRightString(inner_x + inner_w - 6, footer_y - 16, "Authorized Signatory")

    pdf.save()
    return buf.getvalue()


def render_kyc_review_pdf(payload: dict) -> bytes:
    """Generate a printable, structured KYC review summary PDF."""
    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    margin_x = 34
    card_w = width - (margin_x * 2)

    # Header band
    header_y = height - 98
    pdf.setFillColor(colors.HexColor("#1B2B6B"))
    pdf.roundRect(margin_x, header_y, card_w, 62, 10, stroke=0, fill=1)

    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(margin_x + 16, header_y + 38, "Poonawalla Fincorp")
    pdf.setFont("Helvetica", 12)
    pdf.drawString(margin_x + 16, header_y + 19, "KYC Review Sheet")

    generated_at = datetime.now().strftime("%d %b %Y, %I:%M %p")
    pdf.setFont("Helvetica", 9)
    pdf.drawRightString(margin_x + card_w - 16, header_y + 20, f"Generated: {generated_at}")

    # Main container
    main_y = 84
    main_h = header_y - main_y - 14
    pdf.setStrokeColor(colors.HexColor("#CBD5E1"))
    pdf.setFillColor(colors.white)
    pdf.roundRect(margin_x, main_y, card_w, main_h, 10, stroke=1, fill=1)

    # Shared inner measurements
    inner_x = margin_x + 14
    inner_w = card_w - 28
    top_y = main_y + main_h - 14

    right_col_w = 180
    gap = 12
    left_col_w = inner_w - right_col_w - gap
    left_x = inner_x
    right_x = left_x + left_col_w + gap

    # Row 1: Applicant details + selfie
    row1_h = 248
    row1_y = top_y - row1_h

    pdf.setStrokeColor(colors.HexColor("#DBEAFE"))
    pdf.setFillColor(colors.HexColor("#F8FBFF"))
    pdf.roundRect(left_x, row1_y, left_col_w, row1_h, 8, stroke=1, fill=1)

    pdf.setFillColor(colors.HexColor("#1E3A8A"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(left_x + 12, row1_y + row1_h - 22, "Applicant Details")

    identity_rows = [
        ("Session ID", payload.get("session_id") or "-"),
        ("Applicant Name", payload.get("applicant_name") or "-"),
        ("Aadhaar Number", payload.get("aadhaar_number") or "-"),
        ("PAN Number", payload.get("pan_number") or "-"),
        ("Date of Birth", payload.get("dob") or "-"),
        ("Gender", payload.get("gender") or "-"),
    ]

    label_w = 106
    row_h = 33
    text_y = row1_y + row1_h - 44
    for label, value in identity_rows:
        pdf.setStrokeColor(colors.HexColor("#E2E8F0"))
        pdf.line(left_x + 10, text_y - 19, left_x + left_col_w - 10, text_y - 19)

        pdf.setFillColor(colors.HexColor("#64748B"))
        pdf.setFont("Helvetica", 9)
        pdf.drawString(left_x + 12, text_y - 10, label)

        pdf.setFillColor(colors.HexColor("#0F172A"))
        pdf.setFont("Helvetica-Bold", 11)
        max_val_w = left_col_w - label_w - 28
        clipped = _clip_text(pdf, value, max_val_w, "Helvetica-Bold", 11)
        pdf.drawString(left_x + label_w, text_y - 10, clipped)
        text_y -= row_h

    pdf.setStrokeColor(colors.HexColor("#DBEAFE"))
    pdf.setFillColor(colors.HexColor("#EFF6FF"))
    pdf.roundRect(right_x, row1_y, right_col_w, row1_h, 8, stroke=1, fill=1)

    pdf.setFillColor(colors.HexColor("#1E3A8A"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(right_x + 12, row1_y + row1_h - 22, "Live Selfie")
    _draw_photo_card(pdf, _text(payload.get("selfie_image")), right_x + 12, row1_y + 12, right_col_w - 24, row1_h - 48)

    # Row 2: Loan snapshot + verification summary
    row2_h = 160
    row2_y = row1_y - 12 - row2_h

    pdf.setStrokeColor(colors.HexColor("#BFDBFE"))
    pdf.setFillColor(colors.HexColor("#F8FBFF"))
    pdf.roundRect(left_x, row2_y, left_col_w, row2_h, 8, stroke=1, fill=1)
    pdf.setFillColor(colors.HexColor("#1E40AF"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(left_x + 12, row2_y + row2_h - 22, "Loan Snapshot")

    pdf.setFillColor(colors.HexColor("#475569"))
    pdf.setFont("Helvetica", 10)
    pdf.drawString(left_x + 12, row2_y + row2_h - 50, "Loan Type")
    pdf.setFillColor(colors.HexColor("#0F172A"))
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(left_x + 110, row2_y + row2_h - 50, _clip_text(pdf, payload.get("loan_type") or "-", left_col_w - 130, "Helvetica-Bold", 13))

    pdf.setFillColor(colors.HexColor("#475569"))
    pdf.setFont("Helvetica", 10)
    pdf.drawString(left_x + 12, row2_y + row2_h - 80, "Pre-approved Amount")
    pdf.setFillColor(colors.HexColor("#065F46"))
    pdf.setFont("Helvetica-Bold", 24)
    pdf.drawString(left_x + 12, row2_y + 28, _money(payload.get("preapproved_amount") or 0))

    pdf.setStrokeColor(colors.HexColor("#BFDBFE"))
    pdf.setFillColor(colors.HexColor("#F8FBFF"))
    pdf.roundRect(right_x, row2_y, right_col_w, row2_h, 8, stroke=1, fill=1)
    pdf.setFillColor(colors.HexColor("#1E40AF"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(right_x + 12, row2_y + row2_h - 22, "Verification Summary")

    checks = [
        ("Identity fields", all(_text(payload.get(k)).strip() for k in ["applicant_name", "aadhaar_number", "pan_number", "dob", "gender"])),
        ("Loan fields", bool(_text(payload.get("loan_type")).strip() and _money(payload.get("preapproved_amount") or 0) != "-")),
        ("Selfie attached", bool(_text(payload.get("selfie_image")).strip())),
    ]
    check_y = row2_y + row2_h - 50
    for label, ok in checks:
        tone = colors.HexColor("#059669") if ok else colors.HexColor("#B45309")
        status = "Present" if ok else "Missing"
        pdf.setFillColor(colors.HexColor("#334155"))
        pdf.setFont("Helvetica", 9)
        pdf.drawString(right_x + 12, check_y, label)
        pdf.setFillColor(tone)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawRightString(right_x + right_col_w - 12, check_y, status)
        pdf.setStrokeColor(colors.HexColor("#DBEAFE"))
        pdf.line(right_x + 12, check_y - 8, right_x + right_col_w - 12, check_y - 8)
        check_y -= 30

    # Row 3: Completeness grid (fills page without inventing values)
    row3_y = row2_y - 12 - 144
    row3_h = 144
    pdf.setStrokeColor(colors.HexColor("#DBEAFE"))
    pdf.setFillColor(colors.HexColor("#FFFFFF"))
    pdf.roundRect(inner_x, row3_y, inner_w, row3_h, 8, stroke=1, fill=1)
    pdf.setFillColor(colors.HexColor("#1E40AF"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(inner_x + 12, row3_y + row3_h - 20, "KYC Data Completeness")

    completeness_items = [
        ("Applicant name", payload.get("applicant_name")),
        ("Aadhaar number", payload.get("aadhaar_number")),
        ("PAN number", payload.get("pan_number")),
        ("Date of birth", payload.get("dob")),
        ("Gender", payload.get("gender")),
        ("Loan type", payload.get("loan_type")),
        ("Pre-approved amount", payload.get("preapproved_amount")),
        ("Selfie image", payload.get("selfie_image")),
    ]

    grid_x = inner_x + 12
    grid_y = row3_y + row3_h - 42
    col_w = (inner_w - 24) / 2
    item_h = 24
    for idx, (label, value) in enumerate(completeness_items):
        col = idx % 2
        row = idx // 2
        x = grid_x + (col * col_w)
        y = grid_y - (row * item_h)
        ok = bool(_text(value).strip())
        status = "Provided" if ok else "Missing"
        tone = colors.HexColor("#059669") if ok else colors.HexColor("#B45309")

        pdf.setFillColor(colors.HexColor("#334155"))
        pdf.setFont("Helvetica", 8.5)
        pdf.drawString(x, y, label)
        pdf.setFillColor(tone)
        pdf.setFont("Helvetica-Bold", 8.5)
        pdf.drawRightString(x + col_w - 8, y, status)

    # Footer note + signatures
    footer_y = main_y + 20
    pdf.setStrokeColor(colors.HexColor("#E2E8F0"))
    pdf.line(inner_x, footer_y + 36, inner_x + inner_w, footer_y + 36)

    pdf.setFillColor(colors.HexColor("#64748B"))
    pdf.setFont("Helvetica", 8.5)
    pdf.drawString(
        inner_x,
        footer_y + 22,
        "This sheet captures customer-reviewed KYC details prior to final loan document verification.",
    )
    pdf.drawString(
        inner_x,
        footer_y + 10,
        "All fields above reflect values submitted in the pre-approval review step.",
    )

    pdf.setStrokeColor(colors.HexColor("#94A3B8"))
    pdf.line(inner_x + 6, footer_y + 2, inner_x + 176, footer_y + 2)
    pdf.line(inner_x + inner_w - 176, footer_y + 2, inner_x + inner_w - 6, footer_y + 2)
    pdf.setFillColor(colors.HexColor("#64748B"))
    pdf.setFont("Helvetica", 8)
    pdf.drawString(inner_x + 6, footer_y - 10, "Customer acknowledgement")
    pdf.drawRightString(inner_x + inner_w - 6, footer_y - 10, "Authorized reviewer")

    pdf.save()
    return buf.getvalue()
