function logRequestResponse(r) {
    if (r.variables.debug !== 'true') return;

    r.warn(`[DEBUG] >>> ${r.method} ${r.uri} HTTP/${r.httpVersion}`);
    for (let h in r.headersIn) {
        r.warn(`[DEBUG] > ${h}: ${r.headersIn[h]}`);
    }
    if (r.requestText) {
        r.warn(`[DEBUG] > body: ${r.requestText}`);
        try {
            const req = JSON.parse(r.requestText);
            r.variables.is_streaming = req.stream === true ? '1' : '0';
        } catch (e) {
            r.variables.is_streaming = '0';
        }
    }

    r.warn(`[DEBUG] <<< ${r.variables.status}`);
    for (let h in r.headersOut) {
        r.warn(`[DEBUG] < ${h}: ${r.headersOut[h]}`);
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
                if (r.variables.response_reasoning_buf) r.warn(`[DEBUG] < reasoning:\n${r.variables.response_reasoning_buf}`);
                if (r.variables.response_content_buf) r.warn(`[DEBUG] < content:\n${r.variables.response_content_buf}`);
                r.variables.response_reasoning_buf = '';
                r.variables.response_content_buf = '';
            }
        } else {
            r.variables.response_body_buf = (r.variables.response_body_buf || '') + data;
            if (flags.last && r.variables.response_body_buf) {
                try {
                    const resp = JSON.parse(r.variables.response_body_buf);
                    const msg = resp.choices && resp.choices[0] && resp.choices[0].message;
                    if (msg && msg.reasoning) r.warn(`[DEBUG] < reasoning:\n${msg.reasoning}`);
                    if (msg && msg.content) r.warn(`[DEBUG] < content:\n${msg.content}`);
                } catch (e) {
                    r.warn(`[DEBUG] < body: ${r.variables.response_body_buf}`);
                }
                r.variables.response_body_buf = '';
            }
        }
    }
    r.sendBuffer(data, flags);
}

export default { logRequestResponse, logResponseBody };
