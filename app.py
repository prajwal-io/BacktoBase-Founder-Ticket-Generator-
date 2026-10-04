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
}.items():
    ensure(k, v)

st.markdown(
    """
<div class="brand-wrap">
  <div class="eyebrow">NAME OF THE COMMUNITY</div>
  <div class="brand"><span>Backto</span>Base</div>
  <div class="event-title">Founders Investors Connect</div>
  <div class="tagline">Meet · Network · Build the Future</div>
  <div class="step-line"><b>01</b> Enter your name &nbsp;&nbsp; <b>02</b> Attach your photo &nbsp;&nbsp; <b>03</b> Adjust your ticket &nbsp;&nbsp; <b>04</b> Download</div>
</div>
""",
    unsafe_allow_html=True,
)

left, right = st.columns([0.36, 0.64], gap="large")

with left:
    with st.container(border=True):
        st.markdown('<div class="section-kicker">PARTICIPANT</div>', unsafe_allow_html=True)
        typed_name = st.text_input("Enter your name", value=st.session_state.name, max_chars=40, placeholder=None)
        st.session_state.name = normalize_name(typed_name)

        st.markdown("<hr>", unsafe_allow_html=True)
        st.markdown('<div class="section-kicker">PHOTO</div>', unsafe_allow_html=True)
        uploaded = st.file_uploader(
            "Attach your photo",
            type=["jpg", "jpeg", "png", "webp"],
            key=f"photo_upload_{st.session_state.uploader_key}",
        )
        if uploaded is not None:
            try:
                raw = uploaded.getvalue()
                Image.open(io.BytesIO(raw)).verify()
                st.session_state.photo_bytes = raw
            except Exception:
                st.error("That image could not be processed. Please try another JPG, PNG or WEBP file.")

        if st.session_state.photo_bytes:
            st.session_state.zoom = st.slider("Zoom", 1.0, 3.0, float(st.session_state.zoom), 0.05)
            c1, c2 = st.columns(2)
            with c1:
                st.session_state.photo_x = st.slider("Horizontal", -100, 100, int(st.session_state.photo_x), 1)
            with c2:
                st.session_state.photo_y = st.slider("Vertical", -100, 100, int(st.session_state.photo_y), 1)
            if st.button("Remove photo", use_container_width=True):
                st.session_state.photo_bytes = None
                st.session_state.zoom = 1.0
                st.session_state.photo_x = 0
                st.session_state.photo_y = 0
                st.session_state.uploader_key += 1
                st.rerun()
        else:
            st.markdown('<div class="small-note">Photo is optional. The original avatar remains visible until you upload one.</div>', unsafe_allow_html=True)

        st.markdown("<hr>", unsafe_allow_html=True)
        st.markdown('<div class="section-kicker">NAME STYLE</div>', unsafe_allow_html=True)
        st.session_state.auto_fit = st.toggle("Auto fit long names", value=bool(st.session_state.auto_fit))
        st.session_state.font_name = st.selectbox(
            "Font",
            list(FONT_CANDIDATES.keys()),
            index=list(FONT_CANDIDATES.keys()).index(st.session_state.font_name),
        )
        c1, c2 = st.columns(2)
        with c1:
            st.session_state.font_size = st.slider("Font size", 18, 60, int(st.session_state.font_size))
        with c2:
            weights = ["Regular", "Medium", "Semi Bold", "Bold"]
            st.session_state.font_weight = st.selectbox("Weight", weights, index=weights.index(st.session_state.font_weight))

        c1, c2 = st.columns(2)
        with c1:
            cases = ["As Typed", "UPPERCASE", "Capitalize"]
            st.session_state.text_case = st.selectbox("Text case", cases, index=cases.index(st.session_state.text_case))
        with c2:
            aligns = ["Left", "Center"]
            st.session_state.alignment = st.selectbox("Alignment", aligns, index=aligns.index(st.session_state.alignment))

        st.session_state.letter_spacing = st.slider("Letter spacing", -1, 6, int(st.session_state.letter_spacing), 1)
        color_names = list(TICKET_CONFIG["colors"].keys())
        st.session_state.font_color_name = st.selectbox(
            "Color",
            color_names,
            index=color_names.index(st.session_state.font_color_name),
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

with right:
    with st.container(border=True):
        st.markdown('<div class="preview-label">LIVE PREVIEW</div>', unsafe_allow_html=True)
        params = st.query_params
        calibrate = str(params.get("calibrate", "0")) == "1"
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
            "font_color": TICKET_CONFIG["colors"][st.session_state.font_color_name],
            "auto_fit": st.session_state.auto_fit,
        }
        final_ticket = render_ticket(render_state, calibrate=calibrate)
        st.image(final_ticket, use_container_width=True)
        st.markdown('<div class="small-note">The preview and downloaded file use the same renderer, so the output matches what you see here.</div>', unsafe_allow_html=True)

        st.markdown("<hr>", unsafe_allow_html=True)
        st.markdown('<div class="section-kicker">DOWNLOAD YOUR TICKET</div>', unsafe_allow_html=True)
        st.session_state.export_format = st.radio(
            "Format",
            ["PNG", "JPG", "PDF"],
            horizontal=True,
            index=["PNG", "JPG", "PDF"].index(st.session_state.export_format),
            label_visibility="collapsed",
        )
        fmt = st.session_state.export_format
        ext = {"PNG": "png", "JPG": "jpg", "PDF": "pdf"}[fmt]
        mime = {"PNG": "image/png", "JPG": "image/jpeg", "PDF": "application/pdf"}[fmt]
        payload = image_bytes(final_ticket, fmt)
        filename = safe_filename(st.session_state.name, ext)
        st.download_button(
            "DOWNLOAD TICKET",
            data=payload,
            file_name=filename,
            mime=mime,
            disabled=not bool(normalize_name(st.session_state.name)),
            use_container_width=True,
        )
        if not normalize_name(st.session_state.name):
            st.caption("Enter your name to enable the download.")
