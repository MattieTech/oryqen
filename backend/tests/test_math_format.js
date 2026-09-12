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

  // Try KaTeX if loaded
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
    const placeholder = `%%CODE_BLOCK_${codeBlocks.length}%%`;
    codeBlocks.push(`<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(code.trim())}</code></pre>`);
    return placeholder;
  });

  working = working.replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = `%%CODE_INLINE_${codeBlocks.length}%%`;
    codeBlocks.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // 2. Stash & Render Mathematical Formulas
  const mathBlocks = [];

  // Block Math: $$ ... $$ and \[ ... \]
  working = working.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    const placeholder = `%%MATH_BLOCK_${mathBlocks.length}%%`;
    mathBlocks.push(renderMathFormula(math, true));
    return placeholder;
  });
  working = working.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => {
    const placeholder = `%%MATH_BLOCK_${mathBlocks.length}%%`;
    mathBlocks.push(renderMathFormula(math, true));
    return placeholder;
  });

  // Inline Math: \( ... \) and $ ... $
  working = working.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => {
    const placeholder = `%%MATH_INLINE_${mathBlocks.length}%%`;
    mathBlocks.push(renderMathFormula(math, false));
    return placeholder;
  });
  working = working.replace(/(^|[^\\])\$([^\$\n\r]+?)\$/g, (match, prefix, math) => {
    // Avoid currency like "$5 and $10"
    if (/^\s*\d+([.,]\d+)?\s*$/.test(math)) {
      return match;
    }
    const placeholder = `%%MATH_INLINE_${mathBlocks.length}%%`;
    mathBlocks.push(renderMathFormula(math, false));
    return prefix + placeholder;
  });

  // 3. Process Markdown on standard text
  let html = escapeHtml(working);

  // Headers
  html = html.replace(/^### (.*)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.*)$/gm, '<h2>$1</h2>');

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Lists
  html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*?<\/li>\s*)+)/g, '<ul>$1</ul>');

  // Paragraphs & Linebreaks
  html = html.replace(/\n\n+/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // 4. Restore Code & Math with callback functions to avoid $ replacement bugs
  mathBlocks.forEach((renderedMath, i) => {
    html = html.replace(new RegExp(`%%MATH_BLOCK_${i}%%`, 'g'), () => renderedMath);
    html = html.replace(new RegExp(`%%MATH_INLINE_${i}%%`, 'g'), () => renderedMath);
  });

  codeBlocks.forEach((renderedCode, i) => {
    html = html.replace(new RegExp(`%%CODE_BLOCK_${i}%%`, 'g'), () => renderedCode);
    html = html.replace(new RegExp(`%%CODE_INLINE_${i}%%`, 'g'), () => renderedCode);
  });

  return `<div class="markdown-body"><p>${html}</p></div>`;
}

// Test Sample
const mathSample = `Here is the quadratic equation:
$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$
where $a \\neq 0$ and the discriminant is $\\Delta = b^2 - 4ac$.

Also, Einstein's mass-energy equivalence is $E = mc^2$.`;

console.log(formatMarkdown(mathSample));
