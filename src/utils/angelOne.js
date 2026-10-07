/**
 * Angel One SmartAPI — session, instrument lookup and quotes.
 *
 * Used for the listing price: on a listing day the share is in the exchange's special
 * pre-open session from 09:00, and the discovered price is visible well before the
 * first trade at 10:00. That window is the whole point — a listing price published at
 * 10:30 is history, and reading it from an aggregator means always trailing them.
 *
 * Credentials (Render environment, none of them optional):
 *   SMARTAPI_KEY           the API key from smartapi.angelone.in
 *   SMARTAPI_CLIENT_CODE   Angel One client code
 *   SMARTAPI_PIN           the login PIN
 *   SMARTAPI_TOTP_SECRET   the External TOTP secret (NOT a one-time code)
 *
 * The TOTP secret generates the 2FA code the way an authenticator app does, so the
 * session can be established without a person present.
 */
import crypto from 'crypto';

const BASE = 'https://apiconnect.angelone.in';
const SCRIP_MASTER = 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
const TIMEOUT_MS = 25000;

export const isConfigured = () =>
    Boolean(
        process.env.SMARTAPI_KEY &&
        process.env.SMARTAPI_CLIENT_CODE &&
        process.env.SMARTAPI_PIN &&
        process.env.SMARTAPI_TOTP_SECRET
    );

/* ------------------------------------------------------------------ TOTP */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 -> bytes, tolerating lowercase, spaces and padding. */
function base32Decode(secret) {
    const clean = String(secret).toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (const ch of clean) {
        const idx = B32.indexOf(ch);
        if (idx === -1) continue;
        bits += idx.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return Buffer.from(bytes);
}

/** RFC 6238, 30-second step, 6 digits — the same code an authenticator app shows. */
export function totp(secret, atMs = Date.now()) {
    const counter = Math.floor(atMs / 1000 / 30);
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
    buf.writeUInt32BE(counter >>> 0, 4);

    const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, '0');
}

/* --------------------------------------------------------------- session */

// SmartAPI tokens last for the trading day; re-logging in on every poll would burn the
// login rate limit during exactly the window this exists to serve.
const SESSION_TTL_MS = 60 * 60 * 1000;
let session = { jwt: '', at: 0 };

/** SmartAPI rejects requests without this full header set, local IP and MAC included. */
function headers(jwt) {
    return {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1',
        'X-ClientPublicIP': '127.0.0.1',
        'X-MACAddress': '00:00:00:00:00:00',
        'X-PrivateKey': process.env.SMARTAPI_KEY,
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    };
}

export async function login() {
    if (session.jwt && Date.now() - session.at < SESSION_TTL_MS) return session.jwt;
    if (!isConfigured()) throw new Error('SmartAPI credentials are not configured');

    const res = await fetch(`${BASE}/rest/auth/angelbroking/user/v1/loginByPassword`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
            clientcode: process.env.SMARTAPI_CLIENT_CODE,
            password: process.env.SMARTAPI_PIN,
            totp: totp(process.env.SMARTAPI_TOTP_SECRET),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const json = await res.json().catch(() => ({}));
    const jwt = json?.data?.jwtToken;
    if (!jwt) {
        throw new Error(`login failed: ${json?.message || res.status} ${json?.errorcode || ''}`.trim());
    }
    session = { jwt: jwt.replace(/^Bearer\s+/i, ''), at: Date.now() };
    return session.jwt;
}

/* ------------------------------------------------------------ instruments */

// The scrip master is ~15 MB and changes once a day, so it is fetched at most daily and
// reduced to the few symbols asked for rather than held in memory whole.
const MASTER_TTL_MS = 12 * 60 * 60 * 1000;
let master = { at: 0, bySymbol: new Map() };

/**
 * Look up instruments by symbol across BOTH exchanges.
 *
 * Restricting this to NSE silently excluded every BSE-only SME issue — a third of the
 * IPOs here — even though the master carries 12,962 BSE instruments and the quote API
 * accepts them. Black Opal and Vans are both in there, under their bare BSE symbols.
 */
export async function instrumentTokens(symbols) {
    const wanted = new Set(symbols.map((s) => String(s).toUpperCase()).filter(Boolean));
    if (!wanted.size) return new Map();

    if (Date.now() - master.at < MASTER_TTL_MS && [...wanted].every((s) => master.bySymbol.has(s))) {
        return master.bySymbol;
    }

    const res = await fetch(SCRIP_MASTER, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`scrip master: ${res.status} ${res.statusText}`);
    const rows = await res.json();

    const bySymbol = new Map();
    for (const r of rows) {
        const exchange = String(r.exch_seg || '').toUpperCase();
        if (exchange !== 'NSE' && exchange !== 'BSE') continue;

        // NSE appends the series ("-EQ", "-ST"); BSE symbols are already bare.
        const base = String(r.symbol || '').replace(/-(EQ|BE|SM|ST|SME)$/i, '').toUpperCase();
        if (!wanted.has(base)) continue;

        // NSE wins a tie: it quotes in finer increments and is the primary listing for
        // anything dual-listed. A BSE-only issue simply never has an NSE row.
        const existing = bySymbol.get(base);
        if (!existing || (existing.exchange === 'BSE' && exchange === 'NSE')) {
            bySymbol.set(base, { token: String(r.token), tradingsymbol: r.symbol, exchange });
        }
    }
    master = { at: Date.now(), bySymbol };
    return bySymbol;
}

/**
 * Candidate instruments for a company that has no stored symbol.
 *
 * BSE-only SME issues arrive with no symbol at all, so there is nothing to look up.
 * The master's symbols are compressed company names — "Black Opal Consultants" is
 * BLACKOPAL, "Vans Electroengineerings" is VANS — which a prefix match finds.
 *
 * A prefix match alone is not safe: EVANS sits beside VANS in the same file. So this
 * only proposes candidates; the caller confirms each by checking the quote's previous
 * close against the issue price, which on listing day is the same number. A wrong
 * instrument will not match that and is discarded.
 */
export async function candidatesByName(companyName) {
    const key = String(companyName || '')
        .toUpperCase()
        .replace(/&/g, 'AND')
        .replace(/(LIMITED|LTD|PRIVATE|PVT|INDIA|THE)/g, '')
        .replace(/[^A-Z0-9]/g, '');
    if (key.length < 4) return [];

    const res = await fetch(SCRIP_MASTER, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`scrip master: ${res.status} ${res.statusText}`);
    const rows = await res.json();

    const out = [];
    for (const r of rows) {
        const exchange = String(r.exch_seg || '').toUpperCase();
        if (exchange !== 'NSE' && exchange !== 'BSE') continue;
        const sym = String(r.symbol || '').replace(/-(EQ|BE|SM|ST|SME)$/i, '').toUpperCase();
        if (sym.length < 4) continue;
        if (!key.startsWith(sym) && !sym.startsWith(key)) continue;
        out.push({ token: String(r.token), tradingsymbol: r.symbol, exchange, symbol: sym });
    }
    // Longest symbol first: the most specific match is the likeliest.
    return out.sort((a, b) => b.symbol.length - a.symbol.length).slice(0, 6);
}

/* ---------------------------------------------------------------- quotes */

/**
 * FULL-mode quotes for NSE tokens.
 *
 * During the pre-open session the traded fields are still empty, so the price is taken
 * from whichever of ltp / open / close carries a figure — the caller decides whether
 * that is good enough to publish.
 */
export async function quotes(instruments) {
    // Accepts either a plain list of NSE tokens or {token, exchange} pairs, so a BSE-only
    // SME issue is quoted on the exchange it actually trades on rather than being looked
    // up on the NSE and silently missed.
    const list = instruments.map((i) => (typeof i === 'object' ? i : { token: String(i), exchange: 'NSE' }));
    if (!list.length) return { quotes: new Map(), unfetched: [] };

    const exchangeTokens = {};
    for (const { token, exchange } of list) {
        const key = exchange === 'BSE' ? 'BSE' : 'NSE';
        (exchangeTokens[key] = exchangeTokens[key] || []).push(String(token));
    }

    const jwt = await login();
    const res = await fetch(`${BASE}/rest/secure/angelbroking/market/v1/quote/`, {
        method: 'POST',
        headers: headers(jwt),
        body: JSON.stringify({ mode: 'FULL', exchangeTokens }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const json = await res.json().catch(() => ({}));
    if (!json?.data) throw new Error(`quote failed: ${json?.message || res.status}`);

    const out = new Map();
    for (const row of json.data.fetched || []) {
        out.set(String(row.symbolToken), {
            tradingSymbol: row.tradingSymbol,
            ltp: Number(row.ltp) || 0,
            open: Number(row.open) || 0,
            close: Number(row.close) || 0,
            high: Number(row.high) || 0,
            low: Number(row.low) || 0,
        });
    }
    return { quotes: out, unfetched: json.data.unfetched || [] };
}
