/* Console look is the default. ?station=0 or localStorage chengStation=0 restores the previous colours. */
(function () {
  try {
    var q = location.search || '';
    if (/[?&]station=0\b/.test(q)) localStorage.setItem('chengStation', '0');
    else if (/[?&]station=1\b/.test(q)) localStorage.setItem('chengStation', '1');
    if (localStorage.getItem('chengStation') === '0') {
      document.documentElement.classList.remove('station');
    } else {
      document.documentElement.classList.add('station');
    }
  } catch (e) { /* storage blocked: the HTML class stays on */ }
})();
