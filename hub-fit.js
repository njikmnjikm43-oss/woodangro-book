/* SVG 글자를 상자에 꽉 차게 늘리기 */
(() => {
  function fit() {
    document.querySelectorAll('svg.fit text').forEach(t => {
      if (!t.hasAttribute('data-len')) {
        t.setAttribute('data-len', t.getAttribute('textLength') || 100);
        t.removeAttribute('textLength'); t.removeAttribute('lengthAdjust');
      }
      const want = +t.getAttribute('data-len'), x = +t.getAttribute('x') || 0;
      const w = t.getComputedTextLength();
      if (w > 0) t.setAttribute('transform', `translate(${x} 0) scale(${want / w} 1) translate(${-x} 0)`);
    });
  }
  fit();
  if (document.fonts) { document.fonts.ready.then(fit); document.fonts.addEventListener('loadingdone', fit); }
  addEventListener('load', fit);
  window.fitText = fit;
})();
