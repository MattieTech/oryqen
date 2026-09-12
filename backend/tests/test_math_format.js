const fs = require('fs');

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fallbackFormatMath(formula, isBlock) {
  let f = escapeHtml(formula);

  // Greek letters
  const greek = {
    '\\\\alpha': 'α', '\\\\beta': 'β', '\\\\gamma': 'γ', '\\\\delta': 'δ', '\\\\epsilon': 'ε',
    '\\\\theta': 'θ', '\\\\lambda': 'λ', '\\\\mu': 'μ', '\\\\pi': 'π', '\\\\sigma': 'σ',
    '\\\\phi': 'φ', '\\\\omega': 'ω', '\\\\Delta': 'Δ', '\\\\Omega': 'Ω', '\\\\Sigma': 'Σ',
    '\\\\Gamma': 'Γ', '\\\\Theta': 'Θ', '\\\\rho': 'ρ', '\\\\tau': 'τ', '\\\\psi': 'ψ'
  };
  for (const [k, v] of Object.entries(greek)) {
    f = f.replace(new RegExp(k, 'g'), v);
  }

  // Operators & Symbols
  const symbols = {
    '\\\\times': ' × ', '\\\\cdot': ' · ', '\\\\div': ' ÷ ', '\\\\pm': ' ± ', '\\\\mp': ' ∓ ',
    '\\\\neq': ' ≠ ', '\\\\leq': ' ≤ ', '\\\\geq': ' ≥ ', '\\\\approx': ' ≈ ', '\\\\equiv': ' ≡ ',
    '\\\\infty': '∞', '\\\\int': '∫', '\\\\sum': '∑', '\\\\partial': '∂', '\\\\nabla': '∇',
    '\\\\in': ' ∈ ', '\\\\subset': ' ⊂ ', '\\\\forall': '∀', '\\\\exists': '∃',
    '\\\\to': ' → ', '\\\\rightarrow': ' → ', '\\\\leftarrow': ' ← ', '\\\\Rightarrow': ' ⇒ ',
    '\\\\quad': '   ', '\\\\qquad': '     ', '\\\\,': ' '
  };
  for (const [k, v] of Object.entries(symbols)) {
    f = f.replace(new RegExp(k, 'g'), v);
  }

  // Square roots: \sqrt{rad}
  f = f.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, '<sup>$1</sup>√<span class="math-sqrt-rad">$2</span>');
  f = f.replace(/\\sqrt\{([^{}]+)\}/g, '√<span class="math-sqrt-rad">$1</span>');

  // Fractions: \frac{num}{den} with balanced brace support
  let fracIdx = f.indexOf('\\frac{');
  let fracSafety = 0;
  while (fracIdx !== -1 && fracSafety++ < 30) {
    let i = fracIdx + 6;
    let depth = 1;
    let numStart = i;
    while (i < f.length && depth > 0) {
      if (f[i] === '{') depth++;
      else if (f[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) break;
    let num = f.substring(numStart, i - 1);
    while (i < f.length && /\s/.test(f[i])) i++;
    if (f[i] !== '{') break;
    i++;
    depth = 1;
    let denStart = i;
    while (i < f.length && depth > 0) {
      if (f[i] === '{') depth++;
      else if (f[i] === '}') depth--;
      i++;
    }
    if (depth !== 0) break;
    let den = f.substring(denStart, i - 1);
    let before = f.substring(0, fracIdx);
    let after = f.substring(i);
    f = before + '<span class="math-frac"><span class="math-num">' + num + '</span><span class="math-den">' + den + '</span></span>' + after;
    fracIdx = f.indexOf('\\frac{');
  }

  // Superscripts & Subscripts: x^{2} and x_{i}
  f = f.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>');
  f = f.replace(/\_\{([^{}]+)\}/g, '<sub>$1</sub>');
  f = f.replace(/\^([a-zA-Z0-9+\-=])/g, '<sup>$1</sup>');
  f = f.replace(/\_([a-zA-Z0-9+\-=])/g, '<sub>$1</sub>');

  // Clean \left, \right, \text, \mathrm
  f = f.replace(/\\text\{([^{}]+)\}/g, '$1');
  f = f.replace(/\\mathrm\{([^{}]+)\}/g, '$1');
  f = f.replace(/\\left/g, '');
  f = f.replace(/\\right/g, '');
  f = f.replace(/\\\{/g, '{');
  f = f.replace(/\\\}/g, '}');

  return isBlock
    ? `<div class="math-fallback-block"><span class="math-fallback-formula">${f}</span></div>`
    : `<span class="math-fallback-formula">${f}</span>`;
}

function renderMathFormula(formula, isBlock) {
  if (!formula) return '';
  const cleanFormula = formula.trim();

  // KaTeX if available in browser
  if (typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
    try {
      const rendered = window.katex.renderToString(cleanFormula, {
        displayMode: isBlock,
        throwOnError: false,
        output: 'htmlAndMathml',
      });
      return isBlock 
        ? `<div class="oryqen-math-block">${rendered}</div>` 
        : `<span class="oryqen-math-inline">${rendered}</span>`;
    } catch (e) {}
  }

  return fallbackFormatMath(cleanFormula, isBlock);
}

function formatMarkdown(text) {
  if (!text) return '';

  // 1. Stash Code Blocks
  const codeBlocks = [];
  let working = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `@@CODEBLOCK${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code.trim())}</code></pre>`);
    return placeholder;
  });

  working = working.replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = `@@CODEINLINE${codeBlocks.length}@@`;
    codeBlocks.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // 2. Stash & Render Mathematical Formulas
  const mathBlocks = [];

  // Block Math: $$ ... $$ and \[ ... \]
  working = working.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    const placeholder = `@@MATHBLOCK${mathBlocks.length}@@`;
    mathBlocks.push(renderMathFormula(math, true));
    return placeholder;
  });
  working = working.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => {
    const placeholder = `@@MATHBLOCK${mathBlocks.length}@@`;
    mathBlocks.push(renderMathFormula(math, true));
    return placeholder;
  });

  // Inline Math: \( ... \) and $ ... $
  working = working.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => {
    const placeholder = `@@MATHINLINE${mathBlocks.length}@@`;
    mathBlocks.push(renderMathFormula(math, false));
    return placeholder;
  });
  working = working.replace(/(^|[^\\])\$([^\$\n\r]+?)\$/g, (match, prefix, math) => {
    if (/^\s*\d+([.,]\d+)?\s*$/.test(math)) {
      return match;
    }
    const placeholder = `@@MATHINLINE${mathBlocks.length}@@`;
    mathBlocks.push(renderMathFormula(math, false));
    return prefix + placeholder;
  });

  // 3. Process Markdown on standard text
  let html = escapeHtml(working);

  // Tables: lines with |
  html = html.replace(/((?:^|\n)\|[^\n]+\|\n\|[\s\-:|]+\|\n(?:\|[^\n]+\|\n?)+)/g, (tableBlock) => {
    const rows = tableBlock.trim().split('\n');
    if (rows.length < 2) return tableBlock;
    const headerCols = rows[0].split('|').slice(1, -1).map(c => `<th>${c.trim()}</th>`).join('');
    const bodyRows = rows.slice(2).map(r => {
      const cols = r.split('|').slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cols}</tr>`;
    }).join('');
    return `<div class="table-container"><table class="markdown-table"><thead><tr>${headerCols}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  });

  // Blockquotes: lines starting with > or &gt;
  html = html.replace(/(?:^|\n)(?:&gt;|>)\s*([^\n]+)/g, '<blockquote>$1</blockquote>');

  // Horizontal rules: --- or *** or ___
  html = html.replace(/^(?:[\t ]*[-*_]){3,}[\t ]*$/gm, '<hr class="markdown-hr">');

  // Headers (Level 6 down to 1)
  html = html.replace(/^(?:&lt;br&gt;|\n)*######[\t ]+([^\n]+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^(?:&lt;br&gt;|\n)*#####[\t ]+([^\n]+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^(?:&lt;br&gt;|\n)*####[\t ]+([^\n]+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^(?:&lt;br&gt;|\n)*###[\t ]+([^\n]+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^(?:&lt;br&gt;|\n)*##[\t ]+([^\n]+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^(?:&lt;br&gt;|\n)*#[\t ]+([^\n]+)$/gm, '<h1>$1</h1>');

  // Numbered lists: 1. item
  html = html.replace(/((?:(?:^|\n)\s*\d+\.\s+[^\n]+)+)/g, (match) => {
    const items = match.trim().split('\n').map(line => {
      return line.replace(/^\s*\d+\.\s+(.*)$/, '<li>$1</li>');
    }).join('');
    return `<ol class="markdown-ol">${items}</ol>`;
  });

  // Bulleted lists: - item or * item
  html = html.replace(/((?:(?:^|\n)\s*[-*+]\s+[^\n]+)+)/g, (match) => {
    const items = match.trim().split('\n').map(line => {
      return line.replace(/^\s*[-*+]\s+(.*)$/, '<li>$1</li>');
    }).join('');
    return `<ul class="markdown-ul">${items}</ul>`;
  });

  // Bold & Italic (both * and _)
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Paragraphs & Linebreaks
  html = html.replace(/\n\n+/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Clean up any empty paragraph tags wrapping block elements
  html = html.replace(/<p>\s*(<(?:h[1-6]|div|table|ul|ol|blockquote|hr)[^>]*>)/gi, '$1');
  html = html.replace(/(<\/(?:h[1-6]|div|table|ul|ol|blockquote|hr)>)\s*<\/p>/gi, '$1');

  // 4. Restore Code & Math using split().join() with underscore-free placeholders
  mathBlocks.forEach((renderedMath, i) => {
    html = html.split(`@@MATHBLOCK${i}@@`).join(renderedMath);
    html = html.split(`@@MATHINLINE${i}@@`).join(renderedMath);
  });

  codeBlocks.forEach((renderedCode, i) => {
    html = html.split(`@@CODEBLOCK${i}@@`).join(renderedCode);
    html = html.split(`@@CODEINLINE${i}@@`).join(renderedCode);
  });

  return `<div class="markdown-body"><p>${html}</p></div>`;
}

// Test Comprehensive Markdown Sample
const sample = `### Understanding Quantum Mechanics
#### 1. Core Principles
- **Wave-Particle Duality**: Matter exhibits both wave-like and particle-like properties.
- **Superposition**: States can exist simultaneously until measured.

1. First observation
2. Second observation

> "Anyone who is not shocked by quantum theory has not understood it." — Niels Bohr

---

| Concept | Classical | Quantum |
| :--- | :--- | :--- |
| State | Deterministic | Probabilistic |

Here is the quadratic equation:
$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$
where $a \\neq 0$ and $E = mc^2$.`;

const result = formatMarkdown(sample);
console.log(result);

// Assertions to verify no raw markdown symbols leaked
const hasRawHashes = /#{1,6}\s/.test(result);
const hasRawDashHr = /(?:^|\n)---/.test(result);
const hasRawGt = /(?:^|\n)&gt;\s/.test(result);
const hasRawPipe = /\|/.test(result);

console.log("\n--- Verification Assertions ---");
console.log("No raw hashes (###):", !hasRawHashes);
console.log("No raw horizontal rules (---):", !hasRawDashHr);
console.log("No raw blockquotes (>):", !hasRawGt);
console.log("No raw table pipes (|):", !hasRawPipe);

if (!hasRawHashes && !hasRawDashHr && !hasRawGt && !hasRawPipe) {
  console.log("ALL MARKDOWN TYPOGRAPHY ASSERTIONS PASSED!");
} else {
  process.exit(1);
}
