/*
 * Einbettungs-Skript für Restaurant-Websites:
 *
 *   <div id="tischbuchung"></div>
 *   <script src="https://IHR-SERVER/widget.js" data-restaurant="trattoria-demo"
 *           data-target="#tischbuchung" data-color="#b4441e" async></script>
 *
 * Das Widget läuft in einem iframe, damit sich die Styles der Website und des
 * Widgets nicht gegenseitig beeinflussen. Die Höhe passt sich automatisch an.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var base = new URL(script.src).origin;
  var slug = script.getAttribute('data-restaurant');
  if (!slug) { console.error('[tischbuchung] data-restaurant fehlt'); return; }

  var params = new URLSearchParams({ restaurant: slug });
  var color = script.getAttribute('data-color');
  if (color) params.set('color', color);

  var iframe = document.createElement('iframe');
  iframe.src = base + '/embed.html?' + params.toString();
  iframe.title = 'Tischreservierung';
  iframe.loading = 'lazy';
  iframe.style.cssText = 'width:100%;max-width:520px;border:0;height:480px;display:block;color-scheme:normal';

  var targetSel = script.getAttribute('data-target');
  var target = targetSel && document.querySelector(targetSel);
  if (target) target.appendChild(iframe);
  else script.parentNode.insertBefore(iframe, script.nextSibling);

  window.addEventListener('message', function (e) {
    if (e.origin !== base || e.source !== iframe.contentWindow) return;
    if (e.data && e.data.type === 'tischbuchung:resize') iframe.style.height = e.data.height + 'px';
  });
})();
