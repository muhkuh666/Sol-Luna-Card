if (!customElements.get('sol-luna-card')) customElements.define('sol-luna-card', SolLunaCard);
if (!customElements.get('sol-luna-card-editor')) customElements.define('sol-luna-card-editor', SolLunaCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'sol-luna-card')) {
  window.customCards.push({
    type: 'sol-luna-card',
    name: 'Sol & Luna Card',
    description: /^de/i.test(document.documentElement.lang || navigator.language || '')
      ? 'Sonne, Mond & Himmel: Bahnen, Mondphasen, Goldene/Blaue Stunde, Wolken, Planeten, Finsternisse, Polarlicht.'
      : 'Sun, moon & sky: paths, moon phases, golden/blue hour, clouds, planets, eclipses, aurora.',
    preview: true,
    documentationURL: 'https://github.com/muhkuh666/sol-luna-card',
  });
}
window.SolLunaAstro = Astro;
console.info(`%c SOL & LUNA CARD %c v${VERSION} `, 'background:#1f2c63;color:#FFC531;font-weight:700;border-radius:4px 0 0 4px;padding:2px 4px', 'background:#FFC531;color:#1f2c63;border-radius:0 4px 4px 0;padding:2px 4px');
})();

