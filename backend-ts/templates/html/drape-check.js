/**
 * Drape dead-element scanner for vanilla HTML/JS projects.
 * Runs after DOMContentLoaded, scans for buttons/links without handlers.
 * Only active in dev mode (localhost).
 */
(function() {
  if (!location.hostname.includes('localhost') && !location.hostname.includes('drape.info')) return;

  document.addEventListener('DOMContentLoaded', function() {
    // Check buttons without onclick
    document.querySelectorAll('button').forEach(function(btn) {
      if (!btn.onclick && !btn.getAttribute('onclick') && btn.type !== 'submit' && !btn.disabled) {
        var label = btn.textContent.trim().substring(0, 30) || 'unknown';
        console.error('[Drape] Dead button: "' + label + '" has no click handler.');
      }
    });

    // Check links with empty/hash href
    document.querySelectorAll('a').forEach(function(a) {
      var href = a.getAttribute('href');
      if (!href || href === '#' || href === '') {
        var label = a.textContent.trim().substring(0, 30) || 'unknown';
        console.error('[Drape] Dead link: "' + label + '" has href="' + (href || '') + '".');
      }
    });
  });
})();
