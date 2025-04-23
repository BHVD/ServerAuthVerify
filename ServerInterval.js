export function GetServerEpochTime() {
    return Date.now();
}

export async function signWithHMAC(message, secret) {
    const encoder = new TextEncoder();

    // Encode secret thành key
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: { name: "SHA-256" } },
        false,
        ["sign"]
    );

    // Encode message và tạo signature
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(message)
    );

    // Convert signature sang hex (hoặc base64 tùy ý)
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export async function verifyHMAC(message, signature, secret) {
    const encoder = new TextEncoder();

    // Encode secret thành key
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: { name: "SHA-256" } },
        false,
        ["verify"]
    );

    // Convert signature từ hex (hoặc base64 tùy ý) về Uint8Array
    const signatureBuffer = new Uint8Array(signature.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16)));

    // Verify signature
    const isValid = await crypto.subtle.verify(
        "HMAC",
        key,
        signatureBuffer,
        encoder.encode(message)
    );

    return isValid;
}

