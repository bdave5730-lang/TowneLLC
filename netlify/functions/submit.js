// Netlify Function — receives JSON, validates, forwards to Telegram Bot API
const TELEGRAM_API = 'https://api.telegram.org';

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed.' }) };
    }

    const BOT_TOKEN = process.env.TG_BOT_TOKEN; // set in Netlify UI, NOT in code
    const CHAT_ID   = process.env.TG_CHAT_ID;

    let p;
    try {
        p = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid request body.' }) };
    }

    const fail = (error, code = 400) =>
        ({ statusCode: code, body: JSON.stringify({ ok: false, error }) });

    // ---------- Validation (mirrors the client) ----------
    const v = k => typeof p[k] === 'string' ? p[k].trim() : '';

    const fullname = v('fullname'), age = v('age'), phone = v('phone').replace(/[\s\-()]/g, ''),
          email = v('email'), citystate = v('citystate'), role = v('role'),
          startDate = v('startDate'), travel = v('travel'),
          accom = v('accommodations') || 'No', accomDetail = v('accomDetail');

    if (!fullname || !age || !phone || !email || !citystate || !role || !startDate || !travel)
        return fail('Please fill in all required fields.');

    if (!/^[a-zA-Z]+(?:[ '\-][a-zA-Z]+)*$/.test(fullname))
        return fail('Name format wrong — can only contain alphabets.');

    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 18 || ageNum > 90)
        return fail('Please enter a valid age (18+).');

    if (!/^\+?[0-9]{7,15}$/.test(phone))
        return fail('Please enter a valid phone number.');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
        return fail('Please enter a valid email address.');

    if (citystate.length < 2) return fail('Please enter your city and state.');
    if (role.length < 2)      return fail('Please enter your desired role.');

    const startTs = Date.parse(startDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (isNaN(startTs) || startTs < today.getTime())
        return fail('Start date cannot be empty or in the past.');

    const allowedTravel = ['Yes, fully', 'Within my country only', 'No'];
    if (!allowedTravel.includes(travel)) return fail('Invalid travel option.');

    const allowedAccom = ['No', 'Yes (specified below)', 'Prefer not to say'];
    if (!allowedAccom.includes(accom)) return fail('Invalid accommodation option.');
    let detail = accomDetail;
    if (accom === 'Yes (specified below)' && detail.length < 3)
        return fail('Please describe the accommodation you need.');
    if (accom !== 'Yes (specified below)') detail = '';

    // ---------- File validation ----------
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                              .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const okExt = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
    const mimeMap = {
        pdf:  'application/pdf',
        doc:  'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        jpg:  'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    };
    const MAX = 5 * 1024 * 1024;

    const parseFile = (obj, label) => {
        if (!obj || typeof obj.name !== 'string' || typeof obj.data !== 'string')
            return { error: `Please upload your ${label}.` };
        const ext = obj.name.split('.').pop().toLowerCase();
        if (!okExt.includes(ext)) return { error: `Invalid ${label} format. Allowed: PDF, DOC, DOCX, JPG, PNG.` };
        const buf = Buffer.from(obj.data, 'base64');
        if (!buf.length || buf.length > MAX) return { error: `Your ${label} is empty or too large. Maximum 5MB.` };
        return { filename: obj.name.slice(0, 64), mime: mimeMap[ext], buf };
    };

    const resume = parseFile(p.resume, 'resume');
    if (resume.error) return fail(resume.error);
    const idCard = parseFile(p.id, 'ID card');
    if (idCard.error) return fail(idCard.error);

    // ---------- Telegram helpers ----------
    const tgPost = async (method, fields) => {
        const res = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/${method}`, {
            method: 'POST',
            body: JSON.stringify(fields),
            headers: fields.attachFile
                ? { 'Content-Type': `multipart/form-data; boundary=${fields.attachFile.boundary}` }
                : { 'Content-Type': 'application/json' },
        });
        return res.json();
    };

    // Node's fetch (undici) has no FormData multipart in older runtimes; use native FormData (Node 18+)
    const sendDocument = async (file, errMsg) => {
        const fd = new FormData();
        fd.append('chat_id', CHAT_ID);
        fd.append('document', new Blob([file.buf], { type: file.mime }), file.filename);
        const res = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendDocument`, { method: 'POST', body: fd });
        const json = await res.json().catch(() => null);
        if (!json || json.ok !== true) throw new Error(errMsg);
    };

    if (!BOT_TOKEN || !CHAT_ID)
        return fail('Server configuration error — bot credentials missing.', 500);

    // ---------- Build message ----------
    const message =
        `📋 <b>NEW REGISTRATION — Towne LLC</b>\n\n` +
        `👤 <b>Full Name:</b> ${esc(fullname)}\n` +
        `🎂 <b>Age:</b> ${ageNum}\n` +
        `📱 <b>Phone:</b> ${esc(phone)}\n` +
        `📧 <b>Email:</b> ${esc(email)}\n` +
        `🏠 <b>City/State:</b> ${esc(citystate)}\n\n` +
        `💼 <b>Desired Role:</b> ${esc(role)}\n` +
        `📅 <b>Available From:</b> ${new Date(startTs).toISOString().slice(0, 10)}\n` +
        `✈️ <b>Travel/Relocate:</b> ${esc(travel)}\n\n` +
        (accom === 'Prefer not to say'
            ? `♿ <b>Accommodations:</b> Prefer not to say\n`
            : accom === 'Yes (specified below)'
                ? `♿ <b>Accommodations:</b> Yes — ${esc(detail)}\n`
                : `♿ <b>Accommodations:</b> No\n`) +
        `\n📎 <b>Resume:</b> ${esc(resume.filename)}\n` +
        `🪪 <b>ID Card:</b> ${esc(idCard.filename)}\n` +
        `⏰ <b>Submitted:</b> ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC\n\n` +
        `<i>Contact the candidate directly to confirm and discuss openings.</i>`;

    // ---------- Send ----------
    try {
        const msgRes = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text: message, parse_mode: 'HTML' }),
        });
        const msgJson = await msgRes.json().catch(() => null);
        if (!msgJson || msgJson.ok !== true)
            return fail('Could not deliver registration details. Please try again shortly.', 502);

        await sendDocument(resume, 'Details were sent, but the resume could not be uploaded.');
        await sendDocument(idCard, 'Details and resume were sent, but the ID card could not be delivered.');

        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (e) {
        return fail(e.message || 'Delivery failed. Please try again.', 502);
    }
};
