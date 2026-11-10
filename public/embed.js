(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var app = document.getElementById('app');
  var color = params.get('color');
  if (color && /^#[0-9a-f]{3,8}$/i.test(color)) document.documentElement.style.setProperty('--accent', color);

  var state = { restaurant: null, partySize: 2, date: null, time: null };

  // --- Hilfsfunktionen --------------------------------------------------------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.json().then(function (data) {
        if (!res.ok) { var e = new Error(data.error || 'Fehler'); e.status = res.status; throw e; }
        return data;
      });
    });
  }

  function formatDate(iso) {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('de-DE', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  }

  function addDays(iso, n) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function render() {
    var nodes = Array.prototype.filter.call(arguments, function (n) { return n != null; });
    app.replaceChildren.apply(app, nodes);
    reportHeight();
  }

  function reportHeight() {
    if (window.parent === window) return;
    requestAnimationFrame(function () {
      window.parent.postMessage({ type: 'tischbuchung:resize', height: document.documentElement.scrollHeight + 2 }, '*');
    });
  }
  window.addEventListener('resize', reportHeight);

  function errorBox(msg) { return h('p', { class: 'err', role: 'alert', text: msg }); }

  // --- Schritt 1: Personen, Datum, Uhrzeit -------------------------------------
  function showSearch(error) {
    var r = state.restaurant;
    var sizeSelect = h('select', { name: 'partySize', onchange: function () { state.partySize = +this.value; loadSlots(); } });
    for (var i = 1; i <= r.maxPartySize; i++) {
      sizeSelect.appendChild(h('option', { value: i, selected: i === state.partySize }, i + (i === 1 ? ' Person' : ' Personen')));
    }
    var dateInput = h('input', {
      type: 'date', name: 'date', value: state.date, min: r.today, max: addDays(r.today, r.bookingHorizonDays),
      onchange: function () { if (this.value) { state.date = this.value; loadSlots(); } },
    });
    var slotBox = h('div', { 'aria-live': 'polite' });

    function loadSlots() {
      slotBox.replaceChildren(h('p', { class: 'msg', text: 'Verfügbarkeit wird geprüft …' }));
      reportHeight();
      var query = '?date=' + state.date + '&partySize=' + state.partySize;
      api('GET', '/api/restaurants/' + encodeURIComponent(r.slug) + '/availability' + query).then(function (data) {
        if (data.date !== state.date || data.partySize !== state.partySize) return; // veraltete Antwort
        if (!data.slots.length) {
          slotBox.replaceChildren(h('p', { class: 'msg', text: 'An diesem Tag sind keine Online-Reservierungen möglich. Bitte wählen Sie ein anderes Datum.' }));
        } else if (!data.slots.some(function (s) { return s.available; })) {
          slotBox.replaceChildren(h('p', { class: 'msg', text: 'An diesem Tag ist leider alles ausgebucht. Bitte wählen Sie ein anderes Datum.' }));
        } else {
          var grid = h('div', { class: 'slots', role: 'list' });
          data.slots.forEach(function (s) {
            grid.appendChild(h('button', {
              type: 'button', class: 'slot', disabled: !s.available, role: 'listitem',
              'aria-label': s.time + ' Uhr' + (s.available ? '' : ' – ausgebucht'),
              onclick: function () { state.time = s.time; showDetails(); },
            }, s.time));
          });
          slotBox.replaceChildren(h('p', { class: 'msg', text: 'Uhrzeit wählen:' }), grid);
        }
        reportHeight();
      }).catch(function (e) { slotBox.replaceChildren(errorBox(e.message)); reportHeight(); });
    }

    render(
      h('h1', { text: 'Tisch reservieren' }),
      h('p', { class: 'sub', text: r.name }),
      error ? errorBox(error) : null,
      h('div', { class: 'row' },
        h('label', null, 'Personen', sizeSelect),
        h('label', null, 'Datum', dateInput)),
      slotBox,
      h('p', { class: 'foot', text: 'Größere Gruppen (über ' + r.maxPartySize + ' Personen) bitte telefonisch anfragen.' }),
    );
    loadSlots();
  }

  // --- Schritt 2: Kontaktdaten --------------------------------------------------
  function showDetails(error, values) {
    values = values || {};
    var field = function (label, attrs) {
      attrs.value = values[attrs.name] || '';
      return h('label', null, label, h('input', attrs));
    };
    var notes = h('textarea', { name: 'notes', maxlength: 500, placeholder: 'z. B. Allergien, Kinderstuhl, Anlass' });
    notes.value = values.notes || '';
    var submit = h('button', { type: 'submit', class: 'primary' }, 'Verbindlich reservieren');

    var form = h('form', { novalidate: false, onsubmit: function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var data = { date: state.date, time: state.time, partySize: state.partySize };
      fd.forEach(function (v, k) { data[k] = v; });
      submit.disabled = true;
      submit.textContent = 'Wird gesendet …';
      api('POST', '/api/restaurants/' + encodeURIComponent(state.restaurant.slug) + '/reservations', data)
        .then(showConfirmation)
        .catch(function (err) {
          if (err.status === 409 || (err.status === 400 && /Buchung|Zeit|Datum/.test(err.message))) showSearch(err.message);
          else showDetails(err.message, data);
        });
    } },
      field('Name *', { name: 'name', required: true, minlength: 2, maxlength: 100, autocomplete: 'name' }),
      field('E-Mail *', { name: 'email', type: 'email', required: true, maxlength: 200, autocomplete: 'email' }),
      field('Telefon', { name: 'phone', type: 'tel', maxlength: 40, autocomplete: 'tel' }),
      h('label', null, 'Anmerkungen', notes),
      h('label', { class: 'hp', 'aria-hidden': 'true' }, 'Website', h('input', { name: 'website', tabindex: -1, autocomplete: 'off' })),
      submit);

    render(
      h('h1', { text: 'Ihre Angaben' }),
      h('div', { class: 'summary' },
        h('span', null, formatDate(state.date) + ', ' + state.time + ' Uhr · ' + state.partySize + ' Pers.'),
        h('button', { type: 'button', class: 'link', onclick: function () { showSearch(); } }, 'Ändern')),
      error ? errorBox(error) : null,
      form,
    );
  }

  // --- Schritt 3: Bestätigung -------------------------------------------------
  function manageUrl(token) {
    var u = new URL('embed.html', location.href);
    u.search = '';
    u.searchParams.set('token', token);
    if (color) u.searchParams.set('color', color);
    return u.toString();
  }

  function details(res) {
    return h('dl', null,
      h('dt', { text: 'Restaurant' }), h('dd', { text: res.restaurant.name }),
      h('dt', { text: 'Datum' }), h('dd', { text: formatDate(res.date) }),
      h('dt', { text: 'Uhrzeit' }), h('dd', { text: res.time + ' Uhr' }),
      h('dt', { text: 'Personen' }), h('dd', { text: String(res.partySize) }),
      h('dt', { text: 'Name' }), h('dd', { text: res.name }));
  }

  function showConfirmation(res) {
    render(
      h('div', { class: 'ok', 'aria-hidden': 'true', text: '✓' }),
      h('h1', { text: 'Reservierung bestätigt' }),
      h('p', { class: 'sub', text: 'Wir freuen uns auf Ihren Besuch!' }),
      details(res),
      h('p', { class: 'msg' }, 'Über diesen Link können Sie Ihre Reservierung jederzeit einsehen oder stornieren: ',
        h('a', { href: manageUrl(res.token), target: '_blank', rel: 'noopener', text: 'Reservierung verwalten' })),
    );
  }

  // --- Verwalten / Stornieren -----------------------------------------------------
  function showManage(token, error) {
    api('GET', '/api/reservations/' + encodeURIComponent(token)).then(function (res) {
      var active = res.status === 'confirmed';
      var btn = active ? h('button', { type: 'button', class: 'primary', onclick: function () {
        if (!confirm('Reservierung wirklich stornieren?')) return;
        btn.disabled = true;
        api('DELETE', '/api/reservations/' + encodeURIComponent(token))
          .then(function () { showManage(token); })
          .catch(function (e) { showManage(token, e.message); });
      } }, 'Reservierung stornieren') : null;
      var labels = { cancelled: 'storniert', seated: 'Gast ist da', completed: 'abgeschlossen', no_show: 'nicht erschienen' };
      render(
        h('h1', { text: active ? 'Ihre Reservierung' : 'Reservierung ' + (labels[res.status] || res.status) }),
        h('p', { class: 'sub', text: res.restaurant.name }),
        error ? errorBox(error) : null,
        details(res),
        btn,
      );
    }).catch(function (e) { render(errorBox(e.message)); });
  }

  // --- Start ------------------------------------------------------------------
  var token = params.get('token');
  var slug = params.get('restaurant');
  if (token) showManage(token);
  else if (slug) {
    api('GET', '/api/restaurants/' + encodeURIComponent(slug)).then(function (r) {
      state.restaurant = r;
      state.date = r.today;
      showSearch();
    }).catch(function (e) { render(errorBox(e.message)); });
  } else render(errorBox('Kein Restaurant angegeben.'));
})();
