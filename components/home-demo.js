/* Home page: hero flashcard demo (4 cards, ring rests full + "Nice work!"). Plain script. */
(function () {
  'use strict';
  function init() {
    var cards = [['aloha', 'hello, love'], ['mahalo', 'thank you'], ['ʻohana', 'family'], ['ʻāina', 'land']];
    var known = [false, false, false, false], idx = 0;
    var fc = document.getElementById('fc'), fw = document.getElementById('fw'), fe = document.getElementById('fe');
    var rv = document.getElementById('ringv'), rt = document.getElementById('ringt'), ring = document.getElementById('ring');
    var live = document.getElementById('live'), answers = document.getElementById('answers'), done = document.getElementById('done');
    if (!fc) return;
    var rm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function count() { return known.filter(Boolean).length; }
    function paint() {
      var n = count();
      rv.style.strokeDashoffset = 138.2 * (1 - n / cards.length);
      rt.textContent = n + '/' + cards.length;
      ring.setAttribute('aria-label', 'Progress: ' + n + ' of ' + cards.length + ' cards known');
    }
    function show() { fw.textContent = cards[idx][0]; fe.textContent = cards[idx][1]; }

    fc.addEventListener('click', function () {
      var on = fc.getAttribute('aria-pressed') === 'true';
      fc.setAttribute('aria-pressed', on ? 'false' : 'true');
      live.textContent = on ? 'Showing Hawaiian: ' + cards[idx][0] : 'English: ' + cards[idx][1];
    });
    function next(ok) {
      if (ok) known[idx] = true;
      paint();
      if (count() === cards.length) {
        fc.hidden = true; answers.hidden = true; done.hidden = false;
        live.textContent = 'Nice work! You know all ' + cards.length + ' words.';
        document.getElementById('restart').focus();
        return;
      }
      fc.setAttribute('aria-pressed', 'false');
      var step = 1;
      while (known[(idx + step) % cards.length]) step++;
      idx = (idx + step) % cards.length;
      setTimeout(show, rm ? 0 : 220);
      live.textContent = (ok ? 'Marked known. ' : 'Will review again. ') + 'Next card.';
    }
    document.getElementById('yes').addEventListener('click', function () { next(true); });
    document.getElementById('no').addEventListener('click', function () { next(false); });
    document.getElementById('restart').addEventListener('click', function () {
      known = [false, false, false, false]; idx = 0; show(); paint();
      fc.setAttribute('aria-pressed', 'false');
      done.hidden = true; fc.hidden = false; answers.hidden = false;
      live.textContent = 'Starting over. Card 1 of ' + cards.length + '.';
      fc.focus();
    });
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
