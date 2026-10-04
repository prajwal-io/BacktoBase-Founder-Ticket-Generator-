from __future__ import annotations

import io
import os
import re
from pathlib import Path
from typing import Dict, Tuple

import streamlit as st
from PIL import Image, ImageDraw, ImageFont, ImageOps


# ============================================================
# APP / ASSET CONFIGURATION
# ============================================================
APP_DIR = Path(__file__).resolve().parent
ASSET_PATH = APP_DIR / "assets" / "ticket.png"

st.set_page_config(
    page_title="Founders Investors Connect — Ticket Generator",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# Coordinates are tuned for the supplied 1536 x 1024 ticket image.
# Keep all ticket-position settings centralized here.
TICKET_CONFIG: Dict[str, object] = {
    "name_box": (1074, 500, 1438, 560),
    "photo_center": (1258, 706),
    "photo_radius": 94,
    "colors": {
        "Navy": "#0B2C4C",
        "Gold": "#B8892B",
        "Deep Gold": "#8A6422",
    },
}


# ============================================================
# FONT CONFIGURATION
# ============================================================
FONT_CANDIDATES = {
    "Montserrat": [
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ],
    "Poppins": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ],
    "Playfair Display": [
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "C:/Windows/Fonts/georgia.ttf",
    ],
    "Cormorant Garamond": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
        "C:/Windows/Fonts/georgia.ttf",
    ],
    "Caveat": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Italic.ttf",
        "C:/Windows/Fonts/segoepr.ttf",
    ],
    "DejaVu Sans": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "C:/Windows/Fonts/arial.ttf",
    ],
}

BOLD_CANDIDATES = {
    "Montserrat": [
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ],
    "Poppins": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ],
    "Playfair Display": [
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "C:/Windows/Fonts/georgiab.ttf",
    ],
    "Cormorant Garamond": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf",
        "C:/Windows/Fonts/georgiab.ttf",
    ],
    "Caveat": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Italic.ttf",
        "C:/Windows/Fonts/segoepr.ttf",
    ],
    "DejaVu Sans": [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
    ],
}


def find_font_path(font_name: str, weight: str) -> str | None:
    candidates = (
        BOLD_CANDIDATES.get(font_name, [])
        if weight in {"Semi Bold", "Bold"}
        else FONT_CANDIDATES.get(font_name, [])
    )

    for path in candidates:
        if os.path.exists(path):
            return path

    fallback = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    return fallback if os.path.exists(fallback) else None


def get_font(
    font_name: str,
    size: int,
    weight: str = "Regular",
) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = find_font_path(font_name, weight)
    if path:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            pass
    return ImageFont.load_default()


# ============================================================
# TICKET / IMAGE HELPERS
# ============================================================
@st.cache_resource
def load_ticket() -> Image.Image:
    if not ASSET_PATH.exists():
        raise FileNotFoundError(
            "Ticket asset not found. Make sure assets/ticket.png exists."
        )
    return Image.open(ASSET_PATH).convert("RGBA")


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip())[:40]


def apply_case(text: str, mode: str) -> str:
    if mode == "UPPERCASE":
        return text.upper()
    if mode == "Capitalize":
        return " ".join(word[:1].upper() + word[1:] for word in text.split(" "))
    return text


def tracked_text_width(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.ImageFont,
    letter_spacing: int,
) -> float:
    if not text:
        return 0.0

    glyph_width = sum(draw.textlength(char, font=font) for char in text)
    tracking_width = max(0, len(text) - 1) * letter_spacing
    return glyph_width + tracking_width


def draw_tracked_text(
    draw: ImageDraw.ImageDraw,
    xy: Tuple[float, float],
    text: str,
    font: ImageFont.ImageFont,
    fill: str,
    letter_spacing: int,
) -> None:
    x, y = xy
    for char in text:
        draw.text((x, y), char, font=font, fill=fill)
        x += draw.textlength(char, font=font) + letter_spacing


def fit_name_font(
    draw: ImageDraw.ImageDraw,
    text: str,
    font_name: str,
    requested_size: int,
    weight: str,
    letter_spacing: int,
    max_width: int,
    auto_fit: bool,
) -> Tuple[ImageFont.ImageFont, int]:
    size = requested_size
    font = get_font(font_name, size, weight)

    if not auto_fit:
        return font, size

    while size > 16 and tracked_text_width(
        draw, text, font, letter_spacing
    ) > max_width:
        size -= 1
        font = get_font(font_name, size, weight)

    return font, size


def prepare_photo(
    photo: Image.Image,
    diameter: int,
    zoom: float,
    x_offset: int,
    y_offset: int,
) -> Image.Image:
    """Cover-fill a circular photo region without stretching the image."""
    photo = ImageOps.exif_transpose(photo).convert("RGB")

    max_side = max(photo.size)
    if max_side > 2048:
        ratio = 2048 / max_side
        photo = photo.resize(
            (int(photo.width * ratio), int(photo.height * ratio)),
            Image.Resampling.LANCZOS,
        )

    base_scale = max(diameter / photo.width, diameter / photo.height)
    scale = base_scale * zoom

    resized_width = max(diameter, int(photo.width * scale))
    resized_height = max(diameter, int(photo.height * scale))
    resized = photo.resize(
        (resized_width, resized_height),
        Image.Resampling.LANCZOS,
    )

    max_dx = max(0, resized.width - diameter)
    max_dy = max(0, resized.height - diameter)

    left = int(max_dx / 2 + (x_offset / 100) * (max_dx / 2))
    top = int(max_dy / 2 + (y_offset / 100) * (max_dy / 2))

    left = max(0, min(left, max_dx))
    top = max(0, min(top, max_dy))

    cropped = resized.crop(
        (left, top, left + diameter, top + diameter)
    ).convert("RGBA")

    mask = Image.new("L", (diameter, diameter), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((0, 0, diameter - 1, diameter - 1), fill=255)
    cropped.putalpha(mask)

    return cropped


def render_ticket(state: dict, calibrate: bool = False) -> Image.Image:
    """Single source of truth for preview and every exported format."""
    base = load_ticket().copy()

    # --------------------------------------------------------
    # 1. Participant photo
    # --------------------------------------------------------
    photo_bytes = state.get("photo_bytes")

    if photo_bytes:
        try:
            photo = Image.open(io.BytesIO(photo_bytes))
            radius = int(TICKET_CONFIG["photo_radius"])
            circle = prepare_photo(
                photo=photo,
                diameter=radius * 2,
                zoom=float(state.get("zoom", 1.0)),
                x_offset=int(state.get("photo_x", 0)),
                y_offset=int(state.get("photo_y", 0)),
            )

            center_x, center_y = TICKET_CONFIG["photo_center"]
            base.alpha_composite(
                circle,
                (int(center_x - radius), int(center_y - radius)),
            )
        except Exception:
            # If a malformed image somehow reaches the renderer,
            # leave the original ticket avatar untouched.
            pass

    # --------------------------------------------------------
    # 2. Participant name
    # --------------------------------------------------------
    draw = ImageDraw.Draw(base)
    name = apply_case(
        normalize_name(state.get("name", "")),
        state.get("text_case", "As Typed"),
    )

    if name:
        x1, y1, x2, y2 = TICKET_CONFIG["name_box"]
        letter_spacing = int(state.get("letter_spacing", 0))

        font, _actual_size = fit_name_font(
            draw=draw,
            text=name,
            font_name=state.get("font_name", "Montserrat"),
            requested_size=int(state.get("font_size", 36)),
            weight=state.get("font_weight", "Semi Bold"),
            letter_spacing=letter_spacing,
            max_width=(x2 - x1) - 12,
            auto_fit=bool(state.get("auto_fit", True)),
        )

        bbox = draw.textbbox((0, 0), name, font=font)
        text_height = bbox[3] - bbox[1]
        text_width = tracked_text_width(draw, name, font, letter_spacing)

        if state.get("alignment", "Left") == "Center":
            text_x = x1 + ((x2 - x1) - text_width) / 2
        else:
            text_x = x1 + 4

        text_y = y1 + ((y2 - y1) - text_height) / 2 - bbox[1]

        draw_tracked_text(
            draw=draw,
            xy=(text_x, text_y),
            text=name,
            font=font,
            fill=state.get("font_color", "#0B2C4C"),
            letter_spacing=letter_spacing,
        )

    # --------------------------------------------------------
    # Optional developer calibration guides
    # --------------------------------------------------------
    if calibrate:
        x1, y1, x2, y2 = TICKET_CONFIG["name_box"]
        draw.rectangle((x1, y1, x2, y2), outline="#FF2D55", width=3)

        center_x, center_y = TICKET_CONFIG["photo_center"]
        radius = int(TICKET_CONFIG["photo_radius"])
        draw.ellipse(
            (
                center_x - radius,
                center_y - radius,
                center_x + radius,
                center_y + radius,
            ),
            outline="#FF2D55",
            width=3,
        )

    return base


def export_bytes(image: Image.Image, export_format: str) -> bytes:
    buffer = io.BytesIO()

    if export_format == "PNG":
        image.save(buffer, "PNG", optimize=True)

    elif export_format == "JPG":
        image.convert("RGB").save(
            buffer,
            "JPEG",
            quality=95,
            optimize=True,
            subsampling=0,
        )

    elif export_format == "PDF":
        image.convert("RGB").save(
            buffer,
            "PDF",
            resolution=300.0,
        )

    else:
        raise ValueError(f"Unsupported export format: {export_format}")

    return buffer.getvalue()


def safe_filename(name: str, extension: str) -> str:
    safe_name = re.sub(
        r"[^A-Za-z0-9._-]+",
        "-",
        normalize_name(name),
    ).strip("-._")

    if not safe_name:
        safe_name = "Participant"

    return f"{safe_name}-Founders-Investors-Connect-Ticket.{extension}"


# ============================================================
# SESSION STATE
# ============================================================
def ensure_session_value(key: str, default_value) -> None:
    if key not in st.session_state:
        st.session_state[key] = default_value


SESSION_DEFAULTS = {
    "name": "",
    "photo_bytes": None,
    "zoom": 1.0,
    "photo_x": 0,
    "photo_y": 0,
    "font_name": "Montserrat",
    "font_size": 36,
    "font_weight": "Semi Bold",
    "text_case": "As Typed",
    "letter_spacing": 0,
    "alignment": "Left",
    "font_color_name": "Navy",
    "auto_fit": True,
    "export_format": "PNG",
    "uploader_key": 0,
}

for session_key, session_default in SESSION_DEFAULTS.items():
    ensure_session_value(session_key, session_default)


# ============================================================
# UI STYLES
# ============================================================
st.markdown(
    """
<style>
:root {
    --cream: #F4EDD8;
    --soft-cream: #FBF7EC;
    --navy: #0B2447;
    --gold: #B8892B;
    --deep-gold: #8A6422;
    --ink: #15283D;
}

html, body, [class*="css"] {
    font-family: Arial, Helvetica, sans-serif;
}

.stApp {
    background:
        radial-gradient(circle at 16% 8%, rgba(217,177,90,.10), transparent 28%),
        radial-gradient(circle at 86% 88%, rgba(11,36,71,.04), transparent 26%),
        var(--cream);
    color: var(--ink);
}

header[data-testid="stHeader"] {
    background: transparent;
}

#MainMenu,
footer {
    visibility: hidden;
}

.block-container {
    max-width: 1420px;
    padding-top: 2rem;
    padding-bottom: 3.2rem;
}

.brand-wrap {
    text-align: center;
    margin-bottom: 1.6rem;
}

.eyebrow {
    font-size: .72rem;
    letter-spacing: .22em;
    font-weight: 800;
    color: var(--deep-gold);
    margin-bottom: .35rem;
}

.brand {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 2.65rem;
    line-height: 1;
    font-weight: 700;
    color: var(--navy);
}

.brand span {
    color: var(--gold);
}

.event-title {
    margin-top: .44rem;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 1.43rem;
    font-weight: 700;
    color: var(--ink);
}

.tagline {
    margin-top: .28rem;
    font-size: .8rem;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: #625D53;
}

.step-line {
    margin-top: .82rem;
    font-size: .77rem;
    color: #6A6252;
}

.step-line b {
    color: var(--navy);
}

[data-testid="stVerticalBlockBorderWrapper"] {
    background: rgba(251,247,236,.84);
    border: 1px solid rgba(184,137,43,.38) !important;
    border-radius: 18px !important;
    box-shadow: 0 10px 30px rgba(33,44,53,.08);
}

.section-kicker,
.preview-label {
    font-size: .72rem;
    letter-spacing: .16em;
    color: var(--deep-gold);
    font-weight: 800;
    margin-bottom: .2rem;
}

.stTextInput input {
    background: #FFF9ED;
    border: 1px solid rgba(184,137,43,.42);
    color: var(--navy);
    border-radius: 10px;
}

.stTextInput input:focus {
    border-color: var(--gold);
    box-shadow: 0 0 0 1px var(--gold);
}

[data-testid="stFileUploader"] section {
    background: #FFF9ED;
    border: 1px dashed rgba(184,137,43,.65);
    border-radius: 12px;
}

.stButton > button,
.stDownloadButton > button {
    min-height: 2.7rem;
    border-radius: 10px;
    font-weight: 700;
}

.stButton > button {
    border: 1px solid var(--gold);
    color: var(--navy);
    background: #FFF9ED;
}

.stDownloadButton > button {
    background: var(--navy) !important;
    color: var(--soft-cream) !important;
    border: 1px solid var(--navy) !important;
}

div[data-testid="stImage"] img {
    border-radius: 12px;
    box-shadow: 0 18px 38px rgba(28,33,38,.18);
}

hr {
    border: none;
    border-top: 1px solid rgba(184,137,43,.24);
    margin: .8rem 0 1rem;
}

.small-note {
    font-size: .76rem;
    color: #756F64;
}

@media (max-width: 760px) {
    .block-container {
        padding: 1rem .8rem 2rem;
    }

    .brand {
        font-size: 2.05rem;
    }

    .event-title {
        font-size: 1.18rem;
    }

    .tagline {
        font-size: .7rem;
    }

    .step-line {
        line-height: 1.8;
    }
}
</style>
""",
    unsafe_allow_html=True,
)


# ============================================================
# HEADER
# ============================================================
st.markdown(
    """
<div class="brand-wrap">
    <div class="eyebrow">NAME OF THE COMMUNITY</div>
    <div class="brand"><span>Backto</span>Base</div>
    <div class="event-title">Founders Investors Connect</div>
    <div class="tagline">Meet · Network · Build the Future</div>
    <div class="step-line">
        <b>01</b> Enter your name &nbsp;&nbsp;
        <b>02</b> Attach your photo &nbsp;&nbsp;
        <b>03</b> Adjust your ticket &nbsp;&nbsp;
        <b>04</b> Download
    </div>
</div>
""",
    unsafe_allow_html=True,
)


# ============================================================
# MAIN LAYOUT
# ============================================================
left_column, right_column = st.columns([0.36, 0.64], gap="large")


# ============================================================
# LEFT — CONTROLS
# ============================================================
with left_column:
    with st.container(border=True):
        st.markdown(
            '<div class="section-kicker">PARTICIPANT</div>',
            unsafe_allow_html=True,
        )

        typed_name = st.text_input(
            "Enter your name",
            value=st.session_state.name,
            max_chars=40,
        )
        st.session_state.name = normalize_name(typed_name)

        st.markdown("<hr>", unsafe_allow_html=True)
        st.markdown(
            '<div class="section-kicker">PHOTO</div>',
            unsafe_allow_html=True,
        )

        uploaded_file = st.file_uploader(
            "Attach your photo",
            type=["jpg", "jpeg", "png", "webp"],
            key=f"photo_upload_{st.session_state.uploader_key}",
        )

        if uploaded_file is not None:
            try:
                raw_photo = uploaded_file.getvalue()
                test_image = Image.open(io.BytesIO(raw_photo))
                test_image.verify()
                st.session_state.photo_bytes = raw_photo
            except Exception:
                st.error(
                    "That image could not be processed. Please try another JPG, PNG or WEBP file."
                )

        if st.session_state.photo_bytes:
            st.session_state.zoom = st.slider(
                "Zoom",
                min_value=1.0,
                max_value=3.0,
                value=float(st.session_state.zoom),
                step=0.05,
            )

            photo_col_1, photo_col_2 = st.columns(2)

            with photo_col_1:
                st.session_state.photo_x = st.slider(
                    "Horizontal",
                    min_value=-100,
                    max_value=100,
                    value=int(st.session_state.photo_x),
                    step=1,
                )

            with photo_col_2:
                st.session_state.photo_y = st.slider(
                    "Vertical",
                    min_value=-100,
                    max_value=100,
                    value=int(st.session_state.photo_y),
                    step=1,
                )

            if st.button("Remove photo", use_container_width=True):
                st.session_state.photo_bytes = None
                st.session_state.zoom = 1.0
                st.session_state.photo_x = 0
                st.session_state.photo_y = 0
                st.session_state.uploader_key += 1
                st.rerun()

        else:
            st.markdown(
                '<div class="small-note">Photo is optional. The original avatar remains visible until you upload one.</div>',
                unsafe_allow_html=True,
            )

        st.markdown("<hr>", unsafe_allow_html=True)
        st.markdown(
            '<div class="section-kicker">NAME STYLE</div>',
            unsafe_allow_html=True,
        )

        st.session_state.auto_fit = st.toggle(
            "Auto fit long names",
            value=bool(st.session_state.auto_fit),
        )

        font_names = list(FONT_CANDIDATES.keys())
        current_font_index = (
            font_names.index(st.session_state.font_name)
            if st.session_state.font_name in font_names
            else 0
        )

        st.session_state.font_name = st.selectbox(
            "Font",
            font_names,
            index=current_font_index,
        )

        style_col_1, style_col_2 = st.columns(2)

        with style_col_1:
            st.session_state.font_size = st.slider(
                "Font size",
                min_value=18,
                max_value=60,
                value=int(st.session_state.font_size),
                step=1,
            )

        with style_col_2:
            weight_options = ["Regular", "Medium", "Semi Bold", "Bold"]
            weight_index = (
                weight_options.index(st.session_state.font_weight)
                if st.session_state.font_weight in weight_options
                else 2
            )
            st.session_state.font_weight = st.selectbox(
                "Weight",
                weight_options,
                index=weight_index,
            )

        style_col_3, style_col_4 = st.columns(2)

        with style_col_3:
            case_options = ["As Typed", "UPPERCASE", "Capitalize"]
            case_index = (
                case_options.index(st.session_state.text_case)
                if st.session_state.text_case in case_options
                else 0
            )
            st.session_state.text_case = st.selectbox(
                "Text case",
                case_options,
                index=case_index,
            )

        with style_col_4:
            alignment_options = ["Left", "Center"]
            alignment_index = (
                alignment_options.index(st.session_state.alignment)
                if st.session_state.alignment in alignment_options
                else 0
            )
            st.session_state.alignment = st.selectbox(
                "Alignment",
                alignment_options,
                index=alignment_index,
            )

        st.session_state.letter_spacing = st.slider(
            "Letter spacing",
            min_value=-1,
            max_value=6,
            value=int(st.session_state.letter_spacing),
            step=1,
        )

        color_names = list(TICKET_CONFIG["colors"].keys())
        color_index = (
            color_names.index(st.session_state.font_color_name)
            if st.session_state.font_color_name in color_names
            else 0
        )

        st.session_state.font_color_name = st.selectbox(
            "Color",
            color_names,
            index=color_index,
        )

        if st.button("Reset name style", use_container_width=True):
            st.session_state.font_name = "Montserrat"
            st.session_state.font_size = 36
            st.session_state.font_weight = "Semi Bold"
            st.session_state.text_case = "As Typed"
            st.session_state.letter_spacing = 0
            st.session_state.alignment = "Left"
            st.session_state.font_color_name = "Navy"
            st.session_state.auto_fit = True
            st.rerun()


# ============================================================
# RIGHT — LIVE PREVIEW + DOWNLOAD
# ============================================================
with right_column:
    with st.container(border=True):
        st.markdown(
            '<div class="preview-label">LIVE PREVIEW</div>',
            unsafe_allow_html=True,
        )

        query_params = st.query_params
        calibrate = str(query_params.get("calibrate", "0")) == "1"

        render_state = {
            "name": st.session_state.name,
            "photo_bytes": st.session_state.photo_bytes,
            "zoom": st.session_state.zoom,
            "photo_x": st.session_state.photo_x,
            "photo_y": st.session_state.photo_y,
            "font_name": st.session_state.font_name,
            "font_size": st.session_state.font_size,
            "font_weight": st.session_state.font_weight,
            "text_case": st.session_state.text_case,
            "letter_spacing": st.session_state.letter_spacing,
            "alignment": st.session_state.alignment,
            "font_color": TICKET_CONFIG["colors"][
                st.session_state.font_color_name
            ],
            "auto_fit": st.session_state.auto_fit,
        }

        try:
            final_ticket = render_ticket(
                render_state,
                calibrate=calibrate,
            )
        except FileNotFoundError as exc:
            st.error(str(exc))
            st.stop()

        st.image(final_ticket, use_container_width=True)

        st.markdown(
            '<div class="small-note">The live preview and downloaded ticket use the same renderer.</div>',
            unsafe_allow_html=True,
        )

        st.markdown("<hr>", unsafe_allow_html=True)
        st.markdown(
            '<div class="section-kicker">DOWNLOAD YOUR TICKET</div>',
            unsafe_allow_html=True,
        )

        export_options = ["PNG", "JPG", "PDF"]
        export_index = (
            export_options.index(st.session_state.export_format)
            if st.session_state.export_format in export_options
            else 0
        )

        st.session_state.export_format = st.radio(
            "Format",
            export_options,
            index=export_index,
            horizontal=True,
            label_visibility="collapsed",
        )

        selected_format = st.session_state.export_format
        extension = {
            "PNG": "png",
            "JPG": "jpg",
            "PDF": "pdf",
        }[selected_format]

        mime_type = {
            "PNG": "image/png",
            "JPG": "image/jpeg",
            "PDF": "application/pdf",
        }[selected_format]

        payload = export_bytes(final_ticket, selected_format)
        filename = safe_filename(st.session_state.name, extension)

        st.download_button(
            "DOWNLOAD TICKET",
            data=payload,
            file_name=filename,
            mime=mime_type,
            disabled=not bool(normalize_name(st.session_state.name)),
            use_container_width=True,
        )

        if not normalize_name(st.session_state.name):
            st.caption("Enter your name to enable the download.")
