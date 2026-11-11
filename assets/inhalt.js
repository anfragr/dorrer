/* Gasthof Dorrer · Inhalte aus data/inhalt.json einsetzen
   Die Daten werden im Admin-Bereich (/admin) gepflegt. Ohne JavaScript oder wenn
   die Datei nicht geladen werden kann, bleiben die Inhalte im HTML stehen. */
(function () {
  'use strict';

  var TAGE = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
  var NAME = { mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag', fr: 'Freitag', sa: 'Samstag', so: 'Sonntag' };
  var SCHEMA_TAG = { mo: 'Monday', di: 'Tuesday', mi: 'Wednesday', do: 'Thursday', fr: 'Friday', sa: 'Saturday', so: 'Sunday' };
  var ART = { tank: 'Vom Tank', fass: 'Vom Fass', flasche: 'Flasche', dose: 'Sammeldose' };
  var MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  function $(sel) { return document.querySelector('[data-inhalt="' + sel + '"]'); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll('[data-inhalt="' + sel + '"]')); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function datum(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    return parseInt(m[3], 10) + '. ' + MONATE[parseInt(m[2], 10) - 1] + ' ' + m[1];
  }
  function heute() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function aufzaehlen(namen) {
    if (namen.length === 1) return namen[0];
    if (namen.length === 2) return namen[0] + ' und ' + namen[1];
    return namen.slice(0, -1).join(', ') + ' und ' + namen[namen.length - 1];
  }

  /* ---------- Öffnungszeiten ---------- */
  function urlaubAktiv(u) {
    return u && u.aktiv && u.bis && heute() <= u.bis;
  }
  function urlaubSatz(u) {
    var von = datum(u.von), bis = datum(u.bis);
    return 'Betriebsurlaub ' + (von ? 'vom ' + von + ' bis ' : 'bis ') + bis + '.';
  }

  function zeitenTabelle(oz, urlaub) {
    var tb = $('zeiten');
    if (!tb) return;
    tb.innerHTML = TAGE.map(function (d) {
      var t = oz.tage[d] || {};
      if (!t.offen) return '<tr><th scope="row">' + NAME[d] + '</th><td class="ruhe" colspan="2">Ruhetag</td></tr>';
      var kueche = t.kv && t.kb ? esc(t.kv) + ' bis ' + esc(t.kb) : '';
      return '<tr><th scope="row">' + NAME[d] + '</th><td>' + esc(t.von) + ' bis ' + esc(t.bis) + '</td><td>' + kueche + '</td></tr>';
    }).join('');
    var z = $('zeiten-zusatz');
    if (z) {
      var teile = [];
      if (urlaubAktiv(urlaub)) teile.push('<strong class="urlaub-zeile">' + esc(urlaubSatz(urlaub)) + '</strong>');
      if (oz.zusatz) teile.push(esc(oz.zusatz));
      z.innerHTML = teile.join('<br>');
      z.hidden = !teile.length;
    }
  }

  /* Kurzfassung für den Fuß, z. B. "Freitag bis Dienstag 09:00 bis 22:00 Uhr / Sonntag bis 21:00 Uhr / Mittwoch und Donnerstag Ruhetag" */
  function zeitenKurz(oz) {
    var offen = TAGE.filter(function (d) { return oz.tage[d] && oz.tage[d].offen; });
    var zu = TAGE.filter(function (d) { return !(oz.tage[d] && oz.tage[d].offen); });
    if (!offen.length) return ['Derzeit geschlossen'];
    // Woche so drehen, dass sie nach einem Ruhetag beginnt
    var start = 0;
    if (zu.length) { var letzterZu = TAGE.indexOf(zu[zu.length - 1]); start = (letzterZu + 1) % 7; for (var i = 0; i < 7; i++) { var k = (letzterZu + 1 + i) % 7; if (oz.tage[TAGE[k]] && oz.tage[TAGE[k]].offen) { start = k; break; } } }
    var woche = []; for (var j = 0; j < 7; j++) woche.push(TAGE[(start + j) % 7]);
    var offenGedreht = woche.filter(function (d) { return oz.tage[d].offen; });
    // häufigste Zeit
    var zaehler = {}, haupt = null;
    offenGedreht.forEach(function (d) { var key = oz.tage[d].von + '|' + oz.tage[d].bis; zaehler[key] = (zaehler[key] || 0) + 1; if (!haupt || zaehler[key] > zaehler[haupt]) haupt = key; });
    var hv = haupt.split('|');
    // sind alle offenen Tage am Stück?
    var amStueck = woche.slice(0, offenGedreht.length).every(function (d) { return oz.tage[d].offen; });
    var zeilen = [];
    if (amStueck && offenGedreht.length >= 3) {
      zeilen.push(NAME[offenGedreht[0]] + ' bis ' + NAME[offenGedreht[offenGedreht.length - 1]] + ' ' + hv[0] + ' bis ' + hv[1] + ' Uhr');
    } else {
      var hauptTage = offenGedreht.filter(function (d) { return oz.tage[d].von + '|' + oz.tage[d].bis === haupt; });
      zeilen.push(aufzaehlen(hauptTage.map(function (d) { return NAME[d]; })) + ' ' + hv[0] + ' bis ' + hv[1] + ' Uhr');
    }
    offenGedreht.forEach(function (d) {
      var t = oz.tage[d];
      if (t.von + '|' + t.bis === haupt) return;
      zeilen.push(NAME[d] + ' ' + (t.von === hv[0] ? 'bis ' + t.bis : t.von + ' bis ' + t.bis) + ' Uhr');
    });
    if (zu.length) {
      var zuGedreht = woche.filter(function (d) { return !oz.tage[d].offen; });
      zeilen.push(aufzaehlen(zuGedreht.map(function (d) { return NAME[d]; })) + ' Ruhetag');
    }
    return zeilen;
  }

  function fussZeiten(oz, urlaub) {
    var zeilen = zeitenKurz(oz).map(esc);
    if (urlaubAktiv(urlaub)) zeilen.unshift('<strong>' + esc(urlaubSatz(urlaub)) + '</strong>');
    $all('fuss-zeiten').forEach(function (p) { p.innerHTML = zeilen.join('<br>'); });
  }

  function schemaZeiten(oz) {
    var el = document.querySelector('script[type="application/ld+json"]');
    if (!el) return;
    try {
      var j = JSON.parse(el.textContent);
      var gruppen = {};
      TAGE.forEach(function (d) {
        var t = oz.tage[d];
        if (!t || !t.offen) return;
        var key = t.von + '|' + t.bis;
        (gruppen[key] = gruppen[key] || []).push(SCHEMA_TAG[d]);
      });
      j.openingHoursSpecification = Object.keys(gruppen).map(function (k) {
        var p = k.split('|');
        return { '@type': 'OpeningHoursSpecification', dayOfWeek: gruppen[k], opens: p[0], closes: p[1] };
      });
      el.textContent = JSON.stringify(j);
    } catch (e) { /* nichts tun */ }
  }

  /* ---------- Speisekarte ---------- */
  function speisen(k) {
    var box = $('speisen');
    if (!box || !k || !k.gruppen) return;
    var html = k.gruppen.filter(function (g) { return g.titel || (g.gerichte && g.gerichte.length); }).map(function (g) {
      return '<div class="karte-gruppe"><h3>' + esc(g.titel) + '</h3><ul>' + (g.gerichte || []).map(function (x) {
        return '<li><span class="gericht">' + esc(x.name) + '</span>' + (x.preis ? ' <span class="preis">' + esc(x.preis) + '</span>' : '') +
          (x.text ? '<span class="beschreibung">' + esc(x.text) + '</span>' : '') + '</li>';
      }).join('') + '</ul></div>';
    });
    // auf zwei Spalten verteilen, Reihenfolge bleibt (links zuerst, dann rechts)
    var links = [], rechts = [], hoehe = [], gesamt = 0, bisher = 0;
    k.gruppen.forEach(function (g, i) {
      var h = html[i] ? 2 + (g.gerichte || []).reduce(function (s, x) { return s + (x.text ? 2 : 1); }, 0) : 0;
      hoehe.push(h); gesamt += h;
    });
    k.gruppen.forEach(function (g, i) {
      if (!html[i]) return;
      if (!links.length || bisher + hoehe[i] / 2 <= gesamt / 2) { links.push(html[i]); bisher += hoehe[i]; } else { rechts.push(html[i]); }
    });
    box.innerHTML = '<div>' + links.join('') + '</div><div>' + rechts.join('') + '</div>';
    var intro = $('speise-intro');
    if (intro && k.einleitung) intro.textContent = k.einleitung;
    var pdf = $('speise-pdf');
    if (pdf) pdf.hidden = !k.pdf;
  }

  /* ---------- Biersorten ---------- */
  function sorten(liste) {
    var ul = $('sorten');
    if (!ul || !liste || !liste.length) return;
    ul.innerHTML = liste.map(function (b) {
      var art = ART[b.art] ? b.art : 'fass';
      return '<li><em class="art art-' + art + '">' + ART[art] + '</em><strong>' + esc(b.name) + '</strong><span>' + esc(b.text) + '</span></li>';
    }).join('');
  }

  /* ---------- Facebook ---------- */
  function facebook(url) {
    var sek = document.getElementById('aktuelles');
    if (!sek) return;
    var ok = /^https:\/\/(www\.|m\.)?facebook\.com\/.+/i.test(url || '');
    sek.hidden = !ok;
    if (!ok) return;
    var box = document.getElementById('fbBox');
    if (box) box.setAttribute('data-seite', url);
    $all('fb-link').forEach(function (a) { a.href = url; });
  }

  /* ---------- Popup: Betriebsurlaub oder Hinweis ---------- */
  function popup(d) {
    var titel = '', text = '';
    if (urlaubAktiv(d.urlaub)) {
      titel = 'Betriebsurlaub';
      text = 'Wir haben ' + (d.urlaub.von ? 'vom ' + datum(d.urlaub.von) + ' bis ' : 'bis ') + datum(d.urlaub.bis) + ' geschlossen.' + (d.urlaub.text ? '\n' + d.urlaub.text : '');
    } else if (d.hinweis && d.hinweis.aktiv && (d.hinweis.titel || d.hinweis.text)) {
      titel = d.hinweis.titel; text = d.hinweis.text;
    }
    if (!titel && !text) return;
    var schluessel = 'dorrer-popup-' + (titel + text).length + '-' + (d.aktualisiert || '');
    try { if (sessionStorage.getItem(schluessel)) return; } catch (e) { /* ohne Speicher einfach anzeigen */ }

    var hg = document.createElement('div');
    hg.className = 'hinweis-popup';
    hg.setAttribute('role', 'dialog');
    hg.setAttribute('aria-modal', 'true');
    hg.setAttribute('aria-labelledby', 'hinweisTitel');
    hg.innerHTML = '<div class="hinweis-popup__karte">' +
      '<p class="hinweis-popup__marke">Gasthof Dorrer</p>' +
      (titel ? '<h2 class="hinweis-popup__titel" id="hinweisTitel">' + esc(titel) + '</h2>' : '') +
      '<div class="hinweis-popup__text">' + esc(text).split(/\n+/).map(function (p) { return '<p>' + p + '</p>'; }).join('') + '</div>' +
      '<button type="button" class="knopf knopf-voll hinweis-popup__zu">Verstanden</button></div>';
    function schliessen() {
      try { sessionStorage.setItem(schluessel, '1'); } catch (e) { /* egal */ }
      hg.remove(); document.removeEventListener('keydown', taste);
    }
    function taste(e) { if (e.key === 'Escape') schliessen(); }
    hg.addEventListener('click', function (e) { if (e.target === hg) schliessen(); });
    hg.querySelector('.hinweis-popup__zu').addEventListener('click', schliessen);
    document.addEventListener('keydown', taste);
    document.body.appendChild(hg);
    hg.querySelector('.hinweis-popup__zu').focus();
  }

  /* ---------- Tagesmenü ---------- */
  function tagesmenue(t) {
    if (!t) return;
    var an = t.aktiv && t.text;
    $all('tagesmenue-text').forEach(function (e) { if (t.text) e.textContent = t.text; });
    ['tagesmenue-band', 'tagesmenue-box'].forEach(function (k) { $all(k).forEach(function (e) { e.hidden = !an; }); });
  }

  function anwenden(d) {
    if (!d) return;
    tagesmenue(d.tagesmenue);
    if (d.oeffnungszeiten && d.oeffnungszeiten.tage) {
      zeitenTabelle(d.oeffnungszeiten, d.urlaub);
      fussZeiten(d.oeffnungszeiten, d.urlaub);
      schemaZeiten(d.oeffnungszeiten);
    }
    speisen(d.speisekarte);
    sorten(d.biersorten);
    facebook(d.facebook);
    popup(d);
  }

  fetch('data/inhalt.json?v=' + Date.now(), { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(anwenden)
    .catch(function () { /* Inhalte im HTML bleiben stehen */ });
})();
