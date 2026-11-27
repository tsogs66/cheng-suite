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
  function wrapOne(table) {
    if (!table || table.tagName !== 'TABLE' || !table.parentNode) return;
    if (table.closest('.table-scroll, .scroll-x, svg')) return;
    if (table.closest('.nav, .bottom-nav, .bn-more-sheet')) return;
    var wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  }
  function wrapTables(root) {
    var scope = root || document;
    if (!scope.querySelectorAll) return;
    if (scope.tagName === 'TABLE') wrapOne(scope);
    scope.querySelectorAll('table').forEach(wrapOne);
  }
  function labelPhoneCells(root) {
    var narrow = window.innerWidth <= 599 || (window.innerHeight > 0 && window.innerHeight < 500 && window.innerWidth > window.innerHeight);
    if (!narrow) return;
    var scope = root && root.querySelectorAll ? root : document;
    var tables = [];
    if (scope.tagName === 'TABLE') tables.push(scope);
    scope.querySelectorAll('table.fr-sheet, table.fr-table').forEach(function (t) { tables.push(t); });
    tables.forEach(function (table) {
      var heads = [];
      table.querySelectorAll('thead th').forEach(function (th, i) {
        heads[i] = (th.textContent || '').replace(/\s+/g, ' ').trim();
      });
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        var i = 0;
        Array.prototype.forEach.call(tr.children, function (cell) {
          if (cell.tagName === 'TD' && !cell.getAttribute('data-label') && heads[i]) {
            cell.setAttribute('data-label', heads[i]);
          }
          i += 1;
        });
      });
    });
  }
  function bootTables() {
    wrapTables(document);
    labelPhoneCells(document);
    if (!window.__chengTableObs && document.body) {
      var queue = [];
      var pending = false;
      var obs = new MutationObserver(function (recs) {
        for (var i = 0; i < recs.length; i++) {
          var nodes = recs[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) if (nodes[j].nodeType === 1) queue.push(nodes[j]);
        }
        if (pending || !queue.length) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          var batch = queue;
          queue = [];
          obs.disconnect();
          for (var k = 0; k < batch.length; k++) {
            var n = batch[k];
            if (!n.isConnected) continue;
            wrapTables(n);
            labelPhoneCells(n);
          }
          obs.observe(document.body, { childList: true, subtree: true });
        });
      });
      window.__chengTableObs = obs;
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTables);
  else bootTables();
})();
