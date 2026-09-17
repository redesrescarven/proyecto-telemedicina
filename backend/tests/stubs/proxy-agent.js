// backend/tests/stubs/proxy-agent.js
// Stub para 'proxy-agent': evita cargar su ESM real (dist/index.js) en Jest.
'use strict';

class ProxyAgent {
    constructor() {
        this.label = 'stub-proxy-agent';
    }
}

module.exports = { ProxyAgent };