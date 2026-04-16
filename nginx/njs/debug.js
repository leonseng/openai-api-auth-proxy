// NGINX formats log lines into a buffer of NGX_MAX_ERROR_STR = 2048 bytes. That budget
// covers the entire line, including the prefix NGINX prepends before our message:
//   2026/04/13 04:55:11 [warn] 42#42: *25 js: <message>
// Timestamp (20 bytes) + "[warn] PID#PID: *CONNID js: " (up to ~44 bytes) ≈ 64 chars worst case.
// logFull splits long messages into chunks so each fits within this budget.
const MAX_LOG_CHARS = 2048 - 64;

// Split msg into MAX_LOG_CHARS-sized chunks and log each one separately.
// Character counting is a safe approximation for ASCII-dominant log content.
function logFull(r, msg) {
    for (let i = 0; i < msg.length; i += MAX_LOG_CHARS) {
        r.warn(msg.slice(i, i + MAX_LOG_CHARS));
    }
}

function logRequestResponse(r) {
    if (r.variables.debug !== 'true') return;

    logFull(r, `[DEBUG] >>> ${r.method} ${r.uri} HTTP/${r.httpVersion}`);
    for (let h in r.headersIn) {
        logFull(r, `[DEBUG] > ${h}: ${r.headersIn[h]}`);
    }
    if (r.requestText) {
        try {
            const req = JSON.parse(r.requestText);
            r.variables.is_streaming = req.stream === true ? '1' : '0';
            for (let key in req) {
                if (key === 'messages') continue;
                logFull(r, `[DEBUG] > ${key}: ${JSON.stringify(req[key])}`);
            }
            if (req.messages) {
                for (let i = 0; i < req.messages.length; i++) {
                    const msg = req.messages[i];
                    logFull(r, `[DEBUG] > messages[${i}] (${msg.role}):\n${msg.content}`);
                }
            }
        } catch (e) {
            r.variables.is_streaming = '0';
            logFull(r, `[DEBUG] > body: ${r.requestText}`);
        }
    }

    logFull(r, `[DEBUG] <<< ${r.variables.status}`);
    for (let h in r.headersOut) {
        logFull(r, `[DEBUG] < ${h}: ${r.headersOut[h]}`);
    }
}

function readStreamingBody(r, data) {
    const lines = data.split('\n');
    let done = false;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === '[DONE]') { done = true; continue; }
        try {
            const chunk = JSON.parse(jsonStr);
            const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
            if (delta && delta.reasoning) {
                r.variables.response_reasoning_buf = (r.variables.response_reasoning_buf || '') + delta.reasoning;
            }
            if (delta && delta.content) {
                r.variables.response_content_buf = (r.variables.response_content_buf || '') + delta.content;
            }
        } catch (e) { /* skip incomplete chunks */ }
    }

    return done;
}

function logResponseBody(r, data, flags) {
    if (r.variables.debug === 'true') {
        if (r.variables.is_streaming === '1') {
            if (readStreamingBody(r, data)) {
                if (r.variables.response_reasoning_buf) logFull(r, `[DEBUG] < reasoning:\n${r.variables.response_reasoning_buf}`);
                if (r.variables.response_content_buf) logFull(r, `[DEBUG] < content:\n${r.variables.response_content_buf}`);
                r.variables.response_reasoning_buf = '';
                r.variables.response_content_buf = '';
            }
        } else {
            r.variables.response_body_buf = (r.variables.response_body_buf || '') + data;
            if (flags.last && r.variables.response_body_buf) {
                try {
                    const resp = JSON.parse(r.variables.response_body_buf);
                    const msg = resp.choices && resp.choices[0] && resp.choices[0].message;
                    if (msg && msg.reasoning) logFull(r, `[DEBUG] < reasoning:\n${msg.reasoning}`);
                    if (msg && msg.content) logFull(r, `[DEBUG] < content:\n${msg.content}`);
                } catch (e) {
                    logFull(r, `[DEBUG] < body: ${r.variables.response_body_buf}`);
                }
                r.variables.response_body_buf = '';
            }
        }
    }
    r.sendBuffer(data, flags);
}

export default { logRequestResponse, logResponseBody };
