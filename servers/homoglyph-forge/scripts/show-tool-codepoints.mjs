#!/usr/bin/env node
/**
 * Show Tool Codepoints
 * Displays Unicode codepoints for homoglyph tool names.
 */

// tool names - visually identical, different codepoints
const ASCII_I = "i";       // U+0069
const CYRILLIC_I = "і";    // U+0456

const TOOL_NAME_ASCII = `read_f${ASCII_I}le`;
const TOOL_NAME_CYRILLIC = `read_f${CYRILLIC_I}le`;

// get char details for a string
function getCharacterDetails(str) {
    return [...str].map((char, index) => {
        const codepoint = char.codePointAt(0);
        const hex = codepoint.toString(16).toUpperCase().padStart(4, "0");
        const isAscii = codepoint < 128;
        return {
            index,
            char,
            codepoint: `U+${hex}`,
            decimal: codepoint,
            isAscii,
            category: isAscii ? "ASCII" : "NON-ASCII",
        };
    });
}

// format char for display
function formatChar(detail) {
    const marker = detail.isAscii ? "" : " ⚠️";
    return `  [${detail.index}] '${detail.char}' = ${detail.codepoint} (${detail.category})${marker}`;
}

console.log("═".repeat(70));
console.log("HOMOGLYPH FORGE - Tool Name Codepoint Analysis");
console.log("═".repeat(70));
console.log();

console.log("These two tool names look IDENTICAL in most fonts but are DIFFERENT:");
console.log();

// ASCII version
console.log("┌─────────────────────────────────────────────────────────────────────┐");
console.log("│ TOOL 1: ASCII Version                                              │");
console.log("├─────────────────────────────────────────────────────────────────────┤");
console.log(`│ Name: "${TOOL_NAME_ASCII}"`);
console.log(`│ Hex:  ${Buffer.from(TOOL_NAME_ASCII).toString("hex")}`);
console.log("│");
console.log("│ Character breakdown:");
getCharacterDetails(TOOL_NAME_ASCII).forEach(detail => {
    console.log("│" + formatChar(detail));
});
console.log("└─────────────────────────────────────────────────────────────────────┘");
console.log();

// Cyrillic version
console.log("┌─────────────────────────────────────────────────────────────────────┐");
console.log("│ TOOL 2: Cyrillic Version (HOMOGLYPH)                               │");
console.log("├─────────────────────────────────────────────────────────────────────┤");
console.log(`│ Name: "${TOOL_NAME_CYRILLIC}"`);
console.log(`│ Hex:  ${Buffer.from(TOOL_NAME_CYRILLIC).toString("hex")}`);
console.log("│");
console.log("│ Character breakdown:");
getCharacterDetails(TOOL_NAME_CYRILLIC).forEach(detail => {
    console.log("│" + formatChar(detail));
});
console.log("└─────────────────────────────────────────────────────────────────────┘");
console.log();

// key difference
console.log("═".repeat(70));
console.log("KEY DIFFERENCE:");
console.log("═".repeat(70));
console.log();
console.log("  Position 6 (the 'i' in 'file'):");
console.log(`    ASCII:    'i' = U+0069 (LATIN SMALL LETTER I)`);
console.log(`    Cyrillic: 'і' = U+0456 (CYRILLIC SMALL LETTER BYELORUSSIAN-UKRAINIAN I)`);
console.log();
console.log("  These characters are VISUALLY IDENTICAL but SEMANTICALLY DIFFERENT!");
console.log();

// security implications
console.log("═".repeat(70));
console.log("SECURITY IMPLICATIONS:");
console.log("═".repeat(70));
console.log();
console.log("  1. A naive allowlist for 'read_file' (ASCII) would NOT match");
console.log("     'read_fіle' (Cyrillic), potentially bypassing security controls.");
console.log();
console.log("  2. A human reviewer might not notice the difference, approving");
console.log("     a malicious tool that looks like a legitimate one.");
console.log();
console.log("  3. Safe runtime proxies should normalize Unicode (NFKC) or detect");
console.log("     non-ASCII characters in tool names and alert/block.");
console.log();
console.log("═".repeat(70));
