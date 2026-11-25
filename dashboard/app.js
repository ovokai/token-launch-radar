// Token Radar — dark terminal dashboard. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, chain/category/confidence filters, a per-protocol detail
// view with the model's own arithmetic and the protocol's farm plan, a methodology panel with the
// category multiples table, and the live-token set-aside. No network: every byte is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', chain: 'all', category: 'all', conf: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return n === null || n === undefined ? 'n/a' : n.toFixed(2) + 'x'; }
  // The model in one function: the page recomputes a row from the snapshot figures and the row's own
  // category multiple, and checks the number board.json carries.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity));
  }
  function multipleOf(category) {
    for (var i = 0; i < DATA.multiples.length; i++) if (DATA.multiples[i].category === category) return DATA.multiples[i];
    return null;
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('conf')) state.conf = params.get('conf');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.conf !== 'all') params.set('conf', state.conf);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.conf !== 'all' && r.confidence !== state.conf) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'mult') { av = a.multiple; bv = b.multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'TOKEN RADAR' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'SNAPSHOT ', el('b', { text: DATA.as_of })),
        el('span', null, 'SOURCE ', el('b', { text: 'DefiLlama' })),
        el('span', null, 'MODEL ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var total = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, 'Pre-token protocols, ranked by ', el('span', { class: 'hl', text: 'implied launch value' })),
        el('p', { text: 'Every protocol in the snapshot that records no token, priced the way the market already prices its launched peers: TVL times the median market-cap/TVL of its own category, adjusted for 7-day momentum and for how long it has run without a token. The watchlist is the floor, not the ceiling: ' + DATA.early_size + ' early protocols below the $' + Math.round(DATA.floor_usd / 1e6) + 'M line are ranked alongside it. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Rows ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(total) })),
        el('div', { class: 'fact' }, el('span', { text: 'Global median multiple' }), el('b', { text: fmtMult(DATA.global_multiple) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function selectField(id, label, values, current, onchange) {
    var select = el('select', { id: id, 'aria-label': label },
      values.map(function (v) { return el('option', { value: v[0], text: v[1], selected: v[0] === current ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { onchange(select.value); writeHash(); render(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), select);
  }

  function controls() {
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Name, slug, chain...', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      selectField('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; }),
      selectField('category', 'Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }),
      selectField('conf', 'Confidence', [['all', 'Any confidence'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']], state.conf, function (v) { state.conf = v; }),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label, cls) {
    return el('th', { scope: 'col', class: cls || null },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label + (state.sort === key ? (state.dir < 0 ? ' v' : ' ^') : ''))
    );
  }
  function confChip(conf) {
    var cls = conf === 'High' ? 'chip high' : conf === 'Medium' ? 'chip med' : 'chip low';
    return el('span', { class: cls, text: conf });
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or widen the chain, category or confidence filter.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.chain = 'all'; state.category = 'all'; state.conf = 'all'; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { class: 'chains', text: (r.chains && r.chains.length ? r.chains[0] + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') : 'n/a') }),
        el('td', { text: r.category || 'Uncategorized' }),
        el('td', { class: 'num r', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num r ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num r', text: fmtMult(r.multiple) }),
        el('td', { class: 'r' }, el('div', null,
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' }))
        )),
        el('td', null, confChip(r.confidence))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'board' },
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied launch value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            el('th', { scope: 'col', text: 'Chain' }),
            el('th', { scope: 'col', text: 'Category' }),
            sortHeader('tvl', 'TVL', 'r'),
            sortHeader('growth', '7d', 'r'),
            sortHeader('mult', 'xTVL', 'r'),
            sortHeader('implied', 'Implied value', 'r'),
            el('th', { scope: 'col', text: 'Confidence' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'status live', text: 'live' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Uncategorized') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'n/a') }))),
        el('td', { class: 'num r', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num r ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num r', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num r', text: r.tvl_usd > 0 && r.mcap_usd ? fmtMult(r.mcap_usd / r.tvl_usd) : 'n/a' })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', { class: 'board' },
          el('caption', { class: 'sub', text: 'Already trading: their market cap is a fact, not a model, so they are set aside from the ranking. Their market-cap/TVL ratios are the comparable set the model prices pre-token protocols with.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'r', text: 'TVL' }), el('th', { scope: 'col', class: 'r', text: '7d' }), el('th', { scope: 'col', class: 'r', text: 'Market cap' }), el('th', { scope: 'col', class: 'r', text: 'xTVL' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var top = DATA.multiples.slice(0, 14);
    var tbody = el('tbody');
    top.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'n', text: String(c.peers) }),
        el('td', { class: 'n', text: fmtMult(c.median_ratio) }),
        el('td', { class: 'n', text: fmtMult(c.multiple) })
      ));
    });
    return el('section', { class: 'panel' },
      el('div', { class: 'panel-head' }, el('h2', { text: 'Methodology — how implied value is computed' })),
      el('div', { class: 'body' },
        el('div', { class: 'formula', text: 'implied = round( TVL x category multiple x (1 + clamp(7d change, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )' }),
        el('table', { class: 'mult-table' },
          el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'n', text: 'Live peers' }), el('th', { class: 'n', text: 'Median MCap/TVL' }), el('th', { class: 'n', text: 'Multiple used' }))),
          tbody
        ),
        el('ul', { class: 'method-notes' },
          el('li', { text: 'Peers are the snapshot\u2019s own live-token protocols in the same category; exchange (CEX) tokens never price a protocol. Each peer ratio is winsorized to [' + m.ratio_floor + 'x, ' + m.ratio_cap + 'x] so one runaway comp cannot carry a category.' }),
          el('li', { text: 'The multiple used is the category median shrunk toward the global median (' + fmtMult(DATA.global_multiple) + ' across ' + DATA.global_peers + ' peers) with ' + m.shrinkage_k + ' phantom peers: thin categories mostly read the market, deep ones read themselves. A category with no live peers uses the global median outright.' }),
          el('li', { text: 'Confidence grades the comp set behind a row, not the protocol: High at 8+ peers, Medium at 4\u20137, Low below that, one grade lower when the snapshot records neither an age nor a 7-day change.' }),
          el('li', { text: 'Momentum and maturity are adjustments, not the price: a protocol growing 20% in a week is marked up 10%, and one that has run three years with no token earns the full maturity factor. No protocol name is special-cased; one function scores every row, and each detail view recomputes its row live.' })
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var comp = multipleOf(row.category || 'Uncategorized');
    var recomputed = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorized') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' \u00b7 no token on record' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied launch value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: fmtMult(row.multiple) })),
        el('div', null, el('span', { text: 'Growth x' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity x' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: comp
        ? 'Priced from ' + comp.peers + ' live ' + (row.category || '') + ' peers (median market cap/TVL ' + fmtMult(comp.median_ratio) + ', shrunk to ' + fmtMult(comp.multiple) + '). Confidence: ' + row.confidence + '. Age with no token: ' + fmtAge(row.age_days) + '; 7-day TVL change: ' + fmtPct(row.change_7d) + '. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' An estimate, not a price.'
        : 'Priced at the global median multiple (' + fmtMult(DATA.global_multiple) + ' across ' + DATA.global_peers + ' live peers): this category has no live-token peers in the snapshot. Confidence: ' + row.confidence + '. Age with no token: ' + fmtAge(row.age_days) + '; 7-day TVL change: ' + fmtPct(row.change_7d) + '. An estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'note', text: 'Data: ' + DATA.source + '. A protocol here records no token on DefiLlama; that is a statement about the record, not proof no token exists. Implied values are this model\u2019s estimates and are never a price, an offer or advice.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
