// Remembers the language picked in the switcher, so the root page sends the visitor back to it.
(function () {
  'use strict';

  document.querySelectorAll('[data-lang]').forEach(function (link) {
    link.addEventListener('click', function () {
      try { localStorage.setItem('lang', link.getAttribute('data-lang')); } catch (e) {}
    });
  });
})();
