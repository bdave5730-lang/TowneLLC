// ================= THEME =================
const toggle = document.getElementById('themeToggle');
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    if (toggle) toggle.textContent = t === 'dark' ? '☀️' : '🌙';
}
applyTheme(localStorage.getItem('theme') || 'light');
if (toggle) toggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
});

// ================= VALIDATION (apply.html) =================
const form = document.getElementById('regForm');
if (form) {
    const rules = {
        fullname: v => /^[a-zA-Z]+(?:[ '\-][a-zA-Z]+)*$/.test(v.trim())
            || "Name format wrong — can only contain alphabets (spaces, hyphens, apostrophes allowed).",
        age: v => {
            const n = parseInt(v, 10);
            if (!v) return "Age is required.";
            if (isNaN(n) || n < 18) return "You must be at least 18 years old.";
            if (n > 90) return "Please enter a valid age.";
            return true;
        },
        phone: v => /^\+?[0-9]{7,15}$/.test(v.replace(/[\s\-()]/g, ''))
            || "Enter a valid phone number (7–15 digits, optional +).",
        email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
            || "Enter a valid email address.",
        citystate: v => v.trim().length >= 2 || "Please enter your city and state.",
        role: v => v.trim().length >= 2 || "Please enter your desired role.",
        startDate: v => {
            if (!v) return "Please select your earliest available start date.";
            const d = new Date(v), today = new Date();
            today.setHours(0, 0, 0, 0);
            if (d < today) return "Start date cannot be in the past.";
            return true;
        },
        travel: v => v !== '' || "Please select an option.",
        accommodations: () => true,
        consent: (v, el) => el.checked || "You must confirm before submitting."
    };

    function setFieldState(name, ok, msg) {
        const input = form.querySelector(`[name="${name}"]`);
        const errEl = form.querySelector(`[data-error-for="${name}"]`);
        const field = input.closest('.field');
        field.classList.toggle('invalid', !ok);
        field.classList.toggle('valid', ok && input.type !== 'checkbox');
        if (errEl) {
            errEl.textContent = ok ? '' : msg;
            errEl.classList.toggle('show', !ok);
        }
    }

    function validateField(name) {
        const input = form.querySelector(`[name="${name}"]`);
        const result = rules[name](input.value, input);
        const ok = result === true;
        setFieldState(name, ok, ok ? '' : result);
        return ok;
    }

    Object.keys(rules).forEach(name => {
        const input = form.querySelector(`[name="${name}"]`);
        if (!input) return;
        input.addEventListener('blur', () => validateField(name));
        input.addEventListener('input', () => {
            if (input.closest('.field').classList.contains('invalid')) validateField(name);
        });
        input.addEventListener('change', () => {
            if (input.tagName === 'SELECT') validateField(name);
        });
    });

    // Accommodation detail toggle
    const accommodations = document.getElementById('accommodations');
    const accomDetailField = document.getElementById('accomDetailField');
    accommodations.addEventListener('change', () => {
        accomDetailField.hidden = accommodations.value !== 'Yes (specified below)';
        if (accomDetailField.hidden) {
            document.getElementById('accomDetail').value = '';
            setFieldState('accomDetail', true, '');
        }
    });
    rules.accomDetail = v => {
        if (accomDetailField.hidden) return true;
        return v.trim().length >= 3 || "Please briefly describe the accommodation you need.";
    };
    document.getElementById('accomDetail').addEventListener('blur', () => validateField('accomDetail'));

    // ===== File validation (resume + ID) =====
    const FILE_RULES = [
        { name: 'resume', label: 'resume',  exts: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'] },
        { name: 'id',     label: 'ID card', exts: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'] }
    ];
    const MAX_FILE_SIZE = 5 * 1024 * 1024;

    function validateFile(rule) {
        const input = form.querySelector(`[name="${rule.name}"]`);
        const errEl = form.querySelector(`[data-error-for="${rule.name}"]`);
        let ok = true, msg = '';

        if (!input.files.length) {
            ok = false; msg = `Please upload your ${rule.label}.`;
        } else {
            const f = input.files[0];
            const ext = f.name.split('.').pop().toLowerCase();
            if (!rule.exts.includes(ext)) {
                ok = false; msg = `Invalid file format. Allowed: ${rule.exts.join(', ').toUpperCase()}.`;
            } else if (f.size > MAX_FILE_SIZE) {
                ok = false; msg = `${rule.label.charAt(0).toUpperCase() + rule.label.slice(1)} is too large. Maximum 5 MB.`;
            }
        }

        input.closest('.field').classList.toggle('invalid', !ok);
        errEl.textContent = ok ? '' : msg;
        errEl.classList.toggle('show', !ok);
        return ok;
    }

    FILE_RULES.forEach(rule => {
        const input = form.querySelector(`[name="${rule.name}"]`);
        if (input) input.addEventListener('change', () => validateFile(rule));
    });

    // ===== Helpers for async submit =====
    const readAsBase64 = file => new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result.split(',')[1]); // strip data: prefix
        r.onerror = reject;
        r.readAsDataURL(file);
    });

    const showError = msg => {
        const banner = document.getElementById('errorBanner');
        document.getElementById('errorMsg').textContent = msg;
        banner.hidden = false;
        banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // ===== Submit =====
    form.addEventListener('submit', async e => {
        e.preventDefault(); // always — we submit via fetch

        let allOk = true, firstBad = null;

        Object.keys(rules).forEach(name => {
            if (!validateField(name)) {
                allOk = false;
                firstBad ??= form.querySelector(`[name="${name}"]`);
            }
        });

        FILE_RULES.forEach(rule => {
            if (!validateFile(rule)) {
                allOk = false;
                firstBad ??= form.querySelector(`[name="${rule.name}"]`);
            }
        });

        if (!allOk) {
            firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstBad.focus({ preventScroll: true });
            return;
        }

        const btn = document.getElementById('submitBtn');
        btn.disabled = true;
        btn.textContent = 'Submitting…';
        document.getElementById('errorBanner').hidden = true;

        try {
            const [resumeInput, idInput] = ['resume', 'id'].map(n => form.querySelector(`[name="${n}"]`));
            const payload = {
                fullname:    form.fullname.value,
                age:         form.age.value,
                phone:       form.phone.value,
                email:       form.email.value,
                citystate:   form.citystate.value,
                role:        form.role.value,
                startDate:   form.startDate.value,
                travel:      form.travel.value,
                accommodations: form.accommodations.value,
                accomDetail: form.accomDetail.value,
                resume: {
                    name: resumeInput.files[0].name,
                    type: resumeInput.files[0].type || 'application/octet-stream',
                    data: await readAsBase64(resumeInput.files[0]),
                },
                id: {
                    name: idInput.files[0].name,
                    type: idInput.files[0].type || 'application/octet-stream',
                    data: await readAsBase64(idInput.files[0]),
                },
            };

            const res = await fetch('/.netlify/functions/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const json = await res.json().catch(() => ({}));

            if (res.ok && json.ok) {
                form.reset();
                document.querySelectorAll('.field.valid, .field.invalid')
                    .forEach(f => f.classList.remove('valid', 'invalid'));
                accomDetailField.hidden = true;
                const banner = document.getElementById('successBanner');
                banner.hidden = false;
                banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                showError(json.error || 'Something went wrong. Please try again.');
            }
        } catch {
            showError('Network error — please check your connection and try again.');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Submit Application';
        }
    });
}
