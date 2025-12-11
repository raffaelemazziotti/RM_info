/* ===== script.js ===== */

/* TODO last update time is not available online */
// TODO the affiliations in the tagline are binded into the file. I need to create a json to make them dynamic
// TODO add to the pdf file the stats (simplified), web resources, databases and other
// TODO versione italiano e inglese o solo inglese?


document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initPDFDownloadTab();
    initDOCXDownloadTab();
    

    await loadHome();
    await displayLastUpdated();
    await loadAbout();
    await loadEducation();
    await loadExperience();
    await loadPublications();
    await loadStats();
    await loadTheses();
    await loadSymposia();
    await loadPosters();
    await loadPatents();
    await loadResources();
    await loadDatabases();
    await loadSkills();
    await loadTeaching();
    await loadAwards();
    await loadGrants();
    await loadLinks();
});

/* --- tab navigation --- */
function initTabs() {
    const tabButtons = Array.from(
        document.querySelectorAll('.tab-link[data-tab]')
    ).filter(btn => document.getElementById(btn.dataset.tab));

    // Switch helper
    function switchTo(tabName, push = true) {
        // deactivate all
        tabButtons.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));

        // activate this one
        const btn = tabButtons.find(b => b.dataset.tab === tabName);
        const sec = document.getElementById(tabName);
        if (!btn || !sec) return;
        btn.classList.add('active');
        sec.classList.add('active');

        if (tabName === 'stats') {
          const container = document.getElementById('network-graph');
          if (container && container.offsetParent !== null) {
            setTimeout(() => {
              echarts.getInstanceByDom(container)?.resize();
            }, 100);
          }
        }

        if (push) {
            history.pushState({ tab: tabName }, '', `#${tabName}`);
        }
    }

    // Wire clicks
    tabButtons.forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            switchTo(btn.dataset.tab, true);
        });
    });

    // On load: pick up hash or default to first tab
    const defaultTab = tabButtons[0].dataset.tab;
    const initialHash = location.hash.slice(1);
    const initialTab = tabButtons.some(b => b.dataset.tab === initialHash)
        ? initialHash
        : defaultTab;

    // Activate without pushing a new entry, then **replaceState** so Home has a state
    switchTo(initialTab, false);
    history.replaceState({ tab: initialTab }, '', `#${initialTab}`);

    // On back/forward
    window.addEventListener('popstate', e => {
        // figure out which tab to show
        let tabName = null;
        if (e.state && e.state.tab) {
            tabName = e.state.tab;
        } else {
            // no state object: fall back to the URL hash
            const h = location.hash.slice(1);
            if (tabButtons.some(b => b.dataset.tab === h)) {
                tabName = h;
            }
        }
        if (tabName) {
            switchTo(tabName, false);
        }
        // else no in-page state left → browser will navigate away
    });
}

/* --- about section --- */
/*async function loadAbout() {
    const txt = await fetch('sections/about.html').then(r => r.text());
    document.getElementById('about-content').innerHTML = txt;
}*/
async function loadAbout() {
    const data = await fetch('sections/about.json').then(r => r.json());
    document.getElementById('about-content').innerHTML = data.about.content_html;
}

/* ---------- PUBLICATIONS ---------- */
async function loadPublications() {
    const SQL = await window.initSqlJs({
        locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${f}`
    });
    const buf = await fetch('data/scopus.db').then(r => r.arrayBuffer());
    const db  = new SQL.Database(new Uint8Array(buf));
    const roles = await fetch('sections/author_roles.json').then(r => r.ok ? r.json() : ({}));

    const authors = Object.fromEntries(
        db.exec('SELECT id,auth FROM authors')[0].values
    );

    /* -------- fetch & discard corrigendum / erratum ---------- */
    const unwanted = /(corrigendum|erratum)/i;
    const rows = db.exec(`
    SELECT a.title, a.authors, j.title AS journal,
           a.year, a.citations, a.doi
    FROM   articles a
    LEFT JOIN journals j ON a.journal_id=j.id;
  `)[0].values.filter(r => !unwanted.test(r[0]));   // r[0] is title

    const surname = document.querySelector('.last-name')
        .textContent.trim().toLowerCase();

    window.allPubs = rows.map(([title, ids, journal, yearRaw, citesRaw, doi]) => {
        /* --- underline your surname (unchanged) --- */
        const names = ids.split('|').filter(Boolean).map(id => {
            const n = authors[id] || '';
            return n.toLowerCase().startsWith(surname) ? `<u>${n}</u>` : n;
        }).join(', ');
        const year  = parseInt(String(yearRaw).slice(0, 4), 10) || 0;   // 2025
        const cites = (() => {
            const cleaned = String(citesRaw || '')          // null → ''
                .replace(/[^\d]/g, '');        // "1,234 " → "1234"
            return cleaned ? parseInt(cleaned, 10) : 0;     // always a real number
        })();
        const rolesArr = roles[doi] || [];
        return { title, names, journal, year, cites, doi, roles: rolesArr };
    });

    attachPubControls();
    renderPubList();
    attachPubExportButtons();
}

/* ---------- helpers ---------- */
function attachPubControls() {
    document.getElementById('pub-search')
        .addEventListener('input', renderPubList);
    document.getElementById('pub-sort')
        .addEventListener('change', renderPubList);
}

function renderPubList() {
    const q    = document.getElementById('pub-search').value.trim();
    const sort = document.getElementById('pub-sort').value;
    let list   = window.allPubs.slice();

    /* ---------- filter ---------- */
    if (q){
        const test = q.toLowerCase();
        list = list.filter(p =>
            p.title.toLowerCase().includes(test)     ||
            p.names.toLowerCase().includes(test)     ||
            p.journal.toLowerCase().includes(test)   ||
            (p.doi || '').toLowerCase().includes(test));
    }

    /* ---------- sort ---------- */
    list.sort((a, b) => {
        if (sort === 'year') return b.year  - a.year;   // newest → oldest (keeps working)
        if (sort === 'cit')  return b.cites - a.cites;  // ← reverse order you see now
        return 0;
    });

    /* ---------- highlight helper ---------- */
    const hl = (str)=>{
        if(!q) return str;                                   // nothing to highlight
        const safe = q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); // escape regex chars
        return str.replace(new RegExp(safe,'gi'),
            m=>`<span class="hl">${m}</span>`);
    };
    

    /* ---------- render ---------- */
    const wrap = document.getElementById('pub-list');
    wrap.innerHTML = '';

    list.forEach(p=>{
        const div = document.createElement('div');
        div.className = 'pub-item';
        div.innerHTML = `
      <span class="pub-year-label">${p.year}</span><br>
      <span class="pub-title">${hl(p.title)}</span><br>
      <span class="pub-authors">${hl(p.names)}</span><br>
      <span class="pub-journal">${hl(p.journal)}</span>
      ${p.cites ? `<span class="pub-cites"> · ${p.cites} citations</span>` : ''}
      ${p.doi   ? ` <a href="https://doi.org/${p.doi}" class="doi-btn" target="_blank">${hl('doi')}</a>` : ''}
      ${p.roles?.length ? `<span class="pub-role">${p.roles.join(', ')} author</span>` : ''}
    `;
        wrap.appendChild(div);
    });
}

function stripTags(str) {
    return str.replace(/<[^>]*>/g, '');
}

function attachPubExportButtons() {
    const pubSection = document.getElementById('publications');
    const exportDiv = document.createElement('div');
    exportDiv.style.marginTop = '1rem';
    exportDiv.innerHTML = `
        <button id="export-pubs-csv" class="doi-btn" style="margin-right:0.5rem;">
          Download as CSV
        </button>
        <button id="export-pubs-txt" class="doi-btn">
          Download as TXT
        </button>
  `;
    pubSection.appendChild(exportDiv);

    document
        .getElementById('export-pubs-csv')
        .addEventListener('click', exportPubsCSV);
    document
        .getElementById('export-pubs-txt')
        .addEventListener('click', exportPubsTXT);
}

function exportPubsCSV() {
    if (!window.allPubs) return;
    const header = ['Title','Authors','Journal','Year','Citations','DOI'];
    const escape = s =>
        `"${String(s).replace(/"/g,'""')}"`;

    const rows = window.allPubs.map(p => {
        // strip any HTML (e.g. <u>)
        const title   = stripTags(p.title);
        const authors = stripTags(p.names);
        const journal = stripTags(p.journal);
        const year    = p.year;
        const cites   = p.cites;
        const doi     = p.doi || '';
        return [title, authors, journal, year, cites, doi]
            .map(escape)
            .join(',');
    });

    const csv = [header.map(escape).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'publications.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportPubsTXT() {
    if (!window.allPubs) return;
    const lines = window.allPubs.map(p => {
        const year    = p.year;
        const title   = stripTags(p.title);
        const authors = stripTags(p.names);
        const journal = stripTags(p.journal);
        let txt = `${year} — ${title}\n`;
        txt += `Authors: ${authors}\n`;
        txt += `Journal: ${journal}\n`;
        if (p.cites) txt += `Citations: ${p.cites}\n`;
        if (p.doi)   txt += `DOI: https://doi.org/${p.doi}\n`;
        return txt;
    });

    const content = lines.join('\n');
    const blob    = new Blob([content], { type:'text/plain;charset=utf-8;' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = 'publications.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* --- education section --- */
async function loadEducation() {
    const data = await fetch('sections/education.json').then(r => r.json());
    const wrap = document.getElementById('education-list');
    wrap.innerHTML = '';

    /* simple keyword → icon map */
    const iconOf = txt => {
        if (/phd/i.test(txt))        return '🎓';   // doctoral cap
        if (/master/i.test(txt))     return '🎓';
        if (/bachelor/i.test(txt))   return '📜';
        if (/diploma/i.test(txt))    return '🏫';
        return '🎓';
    };

    data.forEach(item => {
        const div  = document.createElement('div');
        div.className = 'edu-item';
        div.innerHTML = `
      <span class="edu-icon">${iconOf(item.description)}</span>
      <span class="edu-date">${item.date}</span>
      <span class="edu-desc">${item.description}</span>`;
        wrap.appendChild(div);
    });
}

async function loadExperience() {
    const data = await fetch('sections/experience.json').then(r => r.json());
    const wrap = document.getElementById('experience-list');
    wrap.innerHTML = '';

    /* keyword → Font Awesome icon */
    const iconOf = txt => {
        if (/professor/i.test(txt)) return 'fa-user-tie';
        if (/assistant/i.test(txt)) return 'fa-chalkboard-user';
        if (/postdoc/i.test(txt))   return 'fa-flask';
        if (/research/i.test(txt))  return 'fa-microscope';
        return 'fa-briefcase';
    };

    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'exp-item';

        div.innerHTML = `
      <span class="exp-period-label">${item.period}</span>
      <span class="exp-position">${item.position}</span>
      <i class="exp-icon fa-solid ${iconOf(item.position)}"></i><br>

      <span class="exp-line"><strong>Institution:</strong> ${item.institution}</span><br>
      ${item.duration   ? `<span class="exp-line"><strong>Duration:</strong> ${item.duration}</span><br>` : ''}
      ${item.supervisor ? `<span class="exp-line"><strong>Supervisor:</strong> ${item.supervisor}</span><br>` : ''}
      ${item.project    ? `<span class="exp-line"><strong>Project:</strong> ${item.project}</span><br>` : ''}
      <span class="exp-line">${item.description}</span>
    `;
        wrap.appendChild(div);
    });
}

/* --- Stats ---*/
// TODO remove this function
export function renderCoauthorNetwork(data) {
  const chartDom = document.getElementById('network-graph');
  const myChart = echarts.init(chartDom);

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: function (params) {
        return params.data.tooltip?.formatter || params.data.name;
      }
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      label: {
        show: true,
        position: 'right'
      },
      force: {
        repulsion: 100,
        edgeLength: 60
      },
      data: data.nodes,
      links: data.links,
      emphasis: {
        focus: 'adjacency',
        lineStyle: { width: 2 }
      },
      lineStyle: {
        color: 'source',
        curveness: 0.1
      }
    }]
  };

  myChart.setOption(option);
}

async function loadStats() {
  /* 1. Load you (Scopus) and Scholar info */
  const scopus = await fetch('data/scopus_author_info.json').then(r => r.json());
  const meId = scopus.id;
  const scholarCSV = await fetch('data/scholar_author_info.csv').then(r => r.text());
  const [h, row] = scholarCSV.trim().split('\n').map(l => l.split(','));
  const scholar = Object.fromEntries(h.map((k, i) => [k.trim().toLowerCase(), row[i].trim()]));

  /* 2. Load citations-per-year */
  const [cpyHead, cpyRow] = (await fetch('data/citations_per_year.csv').then(r => r.text()))
    .trim()
    .split('\n')
    .map(l => l.split(','));
  const citYears = cpyHead.slice();
  const citCounts = cpyRow.map(v => +v);

  /* 3. Open scopus.db */
  const SQL = await window.initSqlJs({
    locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${f}`
  });
  const buf = await fetch('data/scopus.db').then(r => r.arrayBuffer());
  const db = new SQL.Database(new Uint8Array(buf));

  /* 4. Compute articles/year */
  const artRows = db.exec(
    "SELECT substr(year,1,4) y, COUNT(*) c FROM articles GROUP BY y"
  )[0]?.values || [];
  const artMap = Object.fromEntries(artRows);
  const years = [...new Set([...citYears, ...Object.keys(artMap)])].sort();
  const artCounts = years.map(y => artMap[y] || 0);
  const citAligned = years.map(y => {
    const idx = citYears.indexOf(y);
    return idx >= 0 ? citCounts[idx] : 0;
  });

  /* 5. Tiles */
  const tiles = [
    { label: 'Articles<br>Scopus', value: scopus.document_count || '-' },
    { label: 'Citations<br>Scholar', value: scholar['citations'] || '-' },
    { label: 'h-index<br>Scholar', value: scholar['hindex'] || '-' },
    { label: 'Citations<br>Scopus', value: scopus.citation_count },
    { label: 'h-index<br>Scopus', value: scopus.h_index }
  ];
  const summary = document.getElementById('stats-summary');
  summary.innerHTML = '';
  tiles.forEach(t => {
    const d = document.createElement('div');
    d.className = 'stats-tile';
    d.innerHTML = `<h3>${t.value}</h3><span>${t.label}</span>`;
    summary.appendChild(d);
  });

  /* 6. Build and show local Chart.js chart (on-page view) */
  if (window.statsChartInstance) window.statsChartInstance.destroy();
  const ctx = document.getElementById('stats-citations-chart').getContext('2d');
  window.statsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        {
          type: 'bar',
          label: 'Articles',
          data: artCounts,
          yAxisID: 'y1',
          backgroundColor: 'rgba(129,162,190,.35)',
          borderColor: 'rgba(129,162,190,1)'
        },
        {
          type: 'line',
          label: 'Citations',
          data: citAligned,
          yAxisID: 'y',
          borderColor: '#ffffff',
          backgroundColor: 'rgba(255,255,255,.15)',
          fill: true,
          tension: 0.25
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: {
          title: { display: true, text: 'Citations' },
          beginAtZero: true
        },
        y1: {
          title: { display: true, text: 'Articles' },
          beginAtZero: true,
          position: 'right',
          grid: { drawOnChartArea: false }
        }
      }
    }
  });

  /* 7. Fetch remote static image for PDF */
  //window.statsChartImg = await fetchChartImageFromQuickChart(years, artCounts, citAligned);
  //console.log('Chart image captured via QuickChart');

  /* 8. Top 10 Collaborators */
  const coCounts = {};
  db.exec('SELECT authors FROM articles')[0].values.forEach(([as]) => {
    const ids = as.split('|').filter(Boolean);
    if (!ids.includes(meId)) return;
    ids.filter(id => id !== meId).forEach(co => {
      coCounts[co] = (coCounts[co] || 0) + 1;
    });
  });
  const top10 = Object.entries(coCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, cnt]) => ({ id, cnt }));

  const collabContainer = document.getElementById('collaborators-table-container');
  collabContainer.innerHTML = '';
  const tbl = document.createElement('table');
  tbl.style.width = '100%';
  tbl.style.borderCollapse = 'collapse';
  tbl.innerHTML = `
    <thead>
      <tr>
        <th style="text-align:left;padding:6px;color:#fff">Collaborator</th>
        <th style="text-align:center;padding:6px;color:#fff"># Pubs</th>
      </tr>
    </thead>`;
  const body = document.createElement('tbody');
  top10.forEach(({ id, cnt }, i) => {
    const [[name, surname]] = db.exec(
      `SELECT name,surname FROM authors WHERE id='${id}'`
    )[0].values;
    const tr = document.createElement('tr');
    tr.style.background = i % 2 ? 'var(--bg-light)' : 'transparent';

    const td1 = document.createElement('td');
    td1.style.padding = '6px';
    const a = document.createElement('a');
    a.href = `https://www.scopus.com/authid/detail.uri?authorId=${id}`;
    a.target = '_blank';
    a.textContent = `${surname} ${name}`;
    a.style.color = 'var(--accent)';
    a.style.textDecoration = 'underline';
    td1.appendChild(a);

    const td2 = document.createElement('td');
    td2.style.padding = '6px';
    td2.style.textAlign = 'center';
    td2.style.color = 'var(--text)';
    td2.textContent = cnt;

    tr.append(td1, td2);
    body.appendChild(tr);
  });
  tbl.appendChild(body);
  collabContainer.appendChild(tbl);

  /* 9. Build network (unchanged) */
  const affRes = db.exec('SELECT id,name FROM affiliations')[0].values;
  const affMap = Object.fromEntries(affRes);
  const authRes = db.exec(`
    SELECT id,auth,name,surname,affid,
           citation_count,h_index,area,
           publication_start_year,publication_end_year
    FROM authors
  `)[0].values;
  const authors = authRes.map(
    ([id, auth, name, surname, affid, cites, hIndex, area, startY, endY]) => ({
      id,
      auth,
      name,
      surname,
      affiliation: affMap[affid] || 'Unknown Affiliation',
      citations: +cites || 0,
      hIndex: +hIndex || 0,
      area: area || '',
      publicationRange: startY && endY ? `${startY} – ${endY}` : ''
    })
  );

  const weight = {}, links = [], coSet = {};
  db.exec('SELECT authors FROM articles')[0].values.forEach(([as]) => {
    const ids = as.split('|').filter(Boolean);
    ids.forEach(id => (coSet[id] = coSet[id] || new Set()));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort();
        const key = `${a}-${b}`;
        weight[key] = (weight[key] || 0) + 1;
        coSet[a].add(b);
        coSet[b].add(a);
      }
    }
  });

  const maxH = Math.max(...authors.map(a => a.hIndex), 1);
  const meLower = document.querySelector('.last-name').textContent.trim().toLowerCase();
  const nodes = authors.map(a => {
    const mine = a.surname.toLowerCase() === meLower;
    return {
      id: a.id,
      name: a.auth,
      tooltip: {
        formatter:
          `<b>${a.name} ${a.surname}</b><br>` +
          `<i>${a.affiliation}</i><br>` +
          `Citations: ${a.citations}<br>` +
          `h-index: ${a.hIndex}<br>` +
          `Years active: ${a.publicationRange}`
      },
      label: { show: mine, position: 'right' },
      emphasis: {
        label: { show: true },
        itemStyle: { color: '#3a7fb6', borderColor: '#ffffff', borderWidth: 2 }
      },
      symbolSize: 10 + (a.hIndex / maxH) * 30,
      itemStyle: {
        color: mine ? '#81a2be' : '#fff',
        borderColor: '#81a2be',
        borderWidth: 1
      }
    };
  });
  Object.entries(weight).forEach(([k, v]) => {
    const [from, to] = k.split('-');
    links.push({ source: from, target: to, value: v });
  });
  const chartDom = document.getElementById('network-graph');
  const myChart = echarts.init(chartDom);
  myChart.setOption({
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: p => p.data.tooltip?.formatter || p.data.name
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      focusNodeAdjacency: true,
      label: { position: 'right' },
      force: { repulsion: 100, edgeLength: 60 },
      data: nodes,
      links,
      lineStyle: { color: '#999', width: 1, opacity: 0.5 },
      emphasis: { focus: 'adjacency', lineStyle: { color: '#3a7fb6', width: 2 } }
    }]
  });
}

async function loadTheses() {
    const raw = await fetch('sections/theses.json').then(r => r.json());
    const container = document.getElementById('thesis-list');
    container.innerHTML = '';

    // for each degreeType group in JSON
    Object.entries(raw).forEach(([degreeType, list]) => {
        // group wrapper
        const grp = document.createElement('div');
        grp.className = 'thesis-group';

        // header: e.g. "Bachelor"
        const h3 = document.createElement('h3');
        h3.textContent = degreeType.charAt(0).toUpperCase() + degreeType.slice(1);
        grp.appendChild(h3);

        // cards container
        const cards = document.createElement('div');
        cards.className = 'thesis-cards';

        list.forEach(t => {
            const div = document.createElement('div');
            div.className = 'thesis-card';
            div.innerHTML = `
        <p class="thesis-year">${t.academicYear}</p>
        <h4 class="thesis-student">${t.student}</h4>
        <p class="thesis-type">${t.thesisType}</p>
        <p class="thesis-title">“${t.thesisTitle}”</p>
        <p class="thesis-course">${t.course}
          <span class="thesis-class">(${t.class})</span>
        </p>
      `;
            cards.appendChild(div);
        });

        grp.appendChild(cards);
        container.appendChild(grp);
    });
}

async function loadSymposia() {
    const raw = await fetch('sections/symposia.json').then(r=>r.json());
    const container = document.getElementById('symposia-list');
    container.innerHTML = '';

    Object.entries(raw).forEach(([category, list]) => {
        const grp = document.createElement('div');
        grp.className = 'symposia-group';

        const h3 = document.createElement('h3');
        h3.textContent = category === 'organized'
            ? 'Organized'
            : 'Invited Presentations';
        grp.appendChild(h3);

        const cards = document.createElement('div');
        cards.className = 'symposia-cards';

        list.forEach(item => {
            const div = document.createElement('div');
            div.className = 'symposia-card';

            let inner = `
        <p class="sym-date">${item.date}</p>
        <h4 class="sym-event">${item.event}</h4>
      `;
            if (category === 'organized') {
                inner += `
          <p class="sym-title">“${item.title}”</p>
          <p class="sym-role">${item.role}</p>
          <p class="sym-link"><a href="${item.website}" target="_blank">Website</a></p>
        `;
            } else {
                inner += `<p class="sym-title">“${item.title}”</p>`;
            }
            div.innerHTML = inner;
            cards.appendChild(div);
        });

        grp.appendChild(cards);
        container.appendChild(grp);
    });
}

async function loadPosters() {
    const raw = await fetch('sections/posters.json').then(r=>r.json());
    const list = document.getElementById('poster-list');
    list.innerHTML = '';

    const cards = document.createElement('div');
    cards.className = 'poster-cards';

    raw.posters.forEach(p => {
        const div = document.createElement('div');
        div.className = 'poster-card';
        div.innerHTML = `
      <p class="poster-date">${p.date}</p>
      <h4 class="poster-event">${p.event}</h4>
      <p class="poster-title">“${p.title}”</p>
      <p class="poster-authors">${p.authors.join(', ')}</p>
    `;
        cards.appendChild(div);
    });

    list.appendChild(cards);
}

async function loadPatents() {
    const raw = await fetch('sections/patents.json').then(r => r.json());
    const list = document.getElementById('patent-list');
    list.innerHTML = '';
    const cards = document.createElement('div');
    cards.className = 'patent-cards';

    raw.patents.forEach(p => {
        const div = document.createElement('div');
        div.className = 'patent-card';
        div.innerHTML = `
      <p class="patent-year">Year: ${p.year}</p>
      <h4 class="patent-title">${p.title}</h4>
      <p class="patent-ref"><strong>Ref:</strong> ${p.refNumber}</p>
      <p class="patent-holder"><strong>Holder:</strong> ${p.holder}</p>
      <p class="patent-inventors"><strong>Inventors:</strong> ${p.inventors.join(', ')}</p>
      <p class="patent-class"><strong>Classification:</strong> ${p.classification}</p>
      <p class="patent-issuer"><strong>Issued by:</strong> ${p.issuedBy}</p>
      <p class="patent-filing"><strong>Filing Date:</strong> ${p.filingDate}</p>
      <p class="patent-desc">${p.description}</p>
    `;
        cards.appendChild(div);
    });

    list.appendChild(cards);
}

async function loadResources() {
    const raw = await fetch('sections/web_resources.json').then(r => r.json());
    const container = document.getElementById('resources-list');
    container.innerHTML = '';

    Object.entries(raw).forEach(([type, list]) => {
        const h3 = document.createElement('h3');
        h3.textContent = type;
        container.appendChild(h3);

        list.forEach(item => {
            const iconUrl = item.src_img || '';
            const iconElem = iconUrl
                ? `<img src="${iconUrl}" class="resource-icon" alt="">`
                : '';

            let linksHtml = '';
            if (item.website) {
                linksHtml += `<a href="${item.website}" target="_blank">Website</a>`;
            }
            if (item.sourceCode) {
                if (linksHtml) linksHtml += ' · ';
                linksHtml += `<a href="${item.sourceCode}" target="_blank">Source Code</a>`;
            }

            const div = document.createElement('div');
            div.className = 'resource-item';
            div.innerHTML = `
                ${iconElem}
                <div class="resource-details">
                    <p class="res-title">${item.title}</p>
                    ${linksHtml ? `<div class="res-links">${linksHtml}</div>` : ''}
                    <p class="res-desc">${item.description}</p>
                </div>
            `;
            container.appendChild(div);
            container.appendChild(document.createElement('hr'));
        });
    });
}

async function loadDatabases() {
    const response = await fetch('sections/databases.json');
    if (!response.ok) {
        console.error('Failed to fetch databases.json:', response.status);
        return;
    }
    const data = await response.json();
    const entries = Array.isArray(data.databases) ? data.databases : [];
    const container = document.getElementById('database-list');
    if (!container) {
        console.error('#database-list not found');
        return;
    }
    container.innerHTML = '';

    // Icons8 database icon, 48×48 PNG
    const dbIcon = 'https://images.icon-icons.com/153/PNG/256/database_add_insert_21836.png';

    entries.forEach(item => {
        const { date, title, type, website, doi, description } = item;

        // build links HTML
        const links = [];
        if (website) links.push(`<a href="${website}" target="_blank">Website</a>`);
        if (doi)      links.push(`<a href="https://doi.org/${doi}" target="_blank">DOI</a>`);
        const linksHtml = links.length
            ? `<div class="res-links">${links.join(' · ')}</div>`
            : '';

        // create item
        const div = document.createElement('div');
        div.className = 'resource-item';
        div.innerHTML = `
      <img src="${dbIcon}" class="resource-icon" alt="Database icon">
      <div class="resource-details">
        <p class="res-title">${title}</p>
        <p class="res-sub">${type} | ${date}</p>
        ${linksHtml}
        <p class="res-desc">${description}</p>
      </div>
    `;
        container.appendChild(div);
        container.appendChild(document.createElement('hr'));
    });
}

async function loadLinks() {
    // Fetch the links JSON
    const response = await fetch('sections/links.json');
    if (!response.ok) {
        console.error('Failed to load links.json:', response.statusText);
        return;
    }
    const data = await response.json();

    // Find the container where links will be injected
    const grid = document.querySelector('#links .links-grid');
    grid.innerHTML = '';

    // Build categories and items
    data.links.forEach(category => {
        const catDiv = document.createElement('div');
        catDiv.classList.add('links-category');

        const heading = document.createElement('h3');
        heading.textContent = category.category;
        catDiv.appendChild(heading);

        category.items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('link-item');

            const anchor = document.createElement('a');
            anchor.href = item.url;
            anchor.target = '_blank';

            const icon = document.createElement('img');
            icon.classList.add('link-icon');
            icon.src = item.icon;
            icon.alt = item.name;
            anchor.appendChild(icon);

            anchor.appendChild(document.createTextNode(item.name));
            itemDiv.appendChild(anchor);

            catDiv.appendChild(itemDiv);
        });

        grid.appendChild(catDiv);
    });
}

async function loadSkills() {
    const res = await fetch('sections/tech_skills.json');
    if (!res.ok) return;
    const data = await res.json();
    const container = document.getElementById('skills-list');
    container.innerHTML = '';

    Object.entries(data).forEach(([category, items]) => {
        const grp = document.createElement('div');
        grp.className = 'skills-group';

        const h3 = document.createElement('h3');
        h3.textContent = category;
        grp.appendChild(h3);

        const ul = document.createElement('ul');
        items.forEach(skill => {
            const li = document.createElement('li');
            li.textContent = skill;
            ul.appendChild(li);
        });
        grp.appendChild(ul);
        container.appendChild(grp);
    });
}

async function loadTeaching() {
    const data = await fetch('sections/teaching.json').then(r => r.json());
    const wrap = document.getElementById('teaching-list');
    wrap.innerHTML = '';

    data.teaching.forEach(item => {
        // choose period: either item.period (multi-year) or item.date (single date) or academicYear
        const period = item.period || item.date || item.academicYear || '';
        const div = document.createElement('div');
        div.className = 'exp-item';
        div.innerHTML = `
      <span class="exp-period-label">${period}</span>
      <span class="exp-position">${item.type}</span>
      <i class="exp-icon fa-solid fa-chalkboard-user"></i><br>

      ${item.school   ? `<span class="exp-line"><strong>School:</strong> ${item.school}</span><br>` : ''}
      ${item.duration ? `<span class="exp-line"><strong>Duration:</strong> ${item.duration}</span><br>` : ''}
      ${item.course   ? `<span class="exp-line"><strong>Course:</strong> ${item.course}</span><br>` : ''}
      ${item.teaching ? `<span class="exp-line"><strong>Teaching:</strong> ${item.teaching}</span><br>` : ''}
      <span class="exp-line"><strong>Hours:</strong> ${item.hours}</span>
    `;
        wrap.appendChild(div);
    });
}

async function loadAwards() {
    const data = await fetch('sections/awards.json').then(r => r.json());
    const wrap = document.getElementById('awards-list');
    wrap.innerHTML = '';

    data.awards.forEach(item => {
        const period = item.date
            || item.year
            || item.academicYear
            || '';
        const lines = [
            `<strong>${item.title}</strong>`,
            item.institution ? `Institution: ${item.institution}` : null,
            item.issuer      ? `Issuer: ${item.issuer}`           : null,
            item.event       ? `Event: ${item.event}`             : null,
            item.organizer   ? `Organizer: ${item.organizer}`     : null,
            item.course      ? `Course: ${item.course}`           : null,
            item.program     ? `Program: ${item.program}`         : null,
            item.holder      ? `Holder: ${item.holder}`           : null,
            item.award       ? `Award: ${item.award}`             : null
        ].filter(Boolean);

        const div = document.createElement('div');
        div.className = 'exp-item';
        div.innerHTML = `
      <span class="exp-period-label">${period}</span>
      <i class="exp-icon fa-solid fa-award"></i>
      <span class="exp-position">${item.title}</span><br>
      ${lines.slice(1).map(l=>`<span class="exp-line">${l}</span><br>`).join('')}
    `;
        wrap.appendChild(div);
    });
}

async function loadGrants() {
    const data = await fetch('sections/grants.json').then(r => r.json());
    const wrap = document.getElementById('grants-list');
    wrap.innerHTML = '';

    data.grants.forEach(item => {
        // pick a period label: date plus optional duration
        let period = item.date || '';
        if (item.durationMonths) {
            period += ` (${item.durationMonths} mo)`;
        }

        // build details lines
        const lines = [
            `Role: ${item.role}`,
            item.issuer    ? `Issuer: ${item.issuer}`       : null,
            item.subtitle  ? item.subtitle                  : null,
            `Funding: ${item.funding}`
        ].filter(Boolean);

        const div = document.createElement('div');
        div.className = 'exp-item';
        div.innerHTML = `
      <span class="exp-period-label">${period}</span>
      <span class="exp-position">${item.title}</span>
      <i class="exp-icon fa-solid fa-sack-dollar"></i><br>

      ${lines.map(l => `<span class="exp-line">${l}</span><br>`).join('')}
    `;
        wrap.appendChild(div);
    });
}

// Home
async function loadLastFromJSON(path, dateField) {
    const data = await fetch(path).then(r => r.json());
    // Flatten either root-array or nested arrays under object keys:
    let list = Array.isArray(data) ? data.slice() : [];
    Object.values(data).forEach(v => {
        if (Array.isArray(v)) list = list.concat(v);
    });
    if (!list.length) return null;

    list.forEach(e => {
        // 1) Grab the raw date field as a string
        let raw = e[dateField];
        raw = raw == null ? '' : String(raw);

        // 2) If it’s a range like “2022-09-22/24”, only keep the first part
        if (raw.includes('/')) {
            raw = raw.split('/')[0];
        }

        // 3) Store both the raw string and the parsed Date
        e._rawDate = raw;
        e._sortDate = new Date(raw);
    });

    // 4) Sort descending by the parsed date
    list.sort((a, b) => b._sortDate - a._sortDate);

    // 5) Return the newest entry
    return list[0];
}

async function loadHome() {
    // 1) About excerpt into #home-about
    const aboutRaw = await fetch('sections/about.json').then(r => r.json());
    const fullText = aboutRaw.about.content_html
        .replace(/<a\s+href="[^"]+"[^>]*>([^<]+)<\/a>/g,'$1')
        .replace(/<[^>]+>/g,'').trim();

    // take first 3 sentences
    const excerpt = fullText.split('. ').slice(0,3).join('. ') + '.';

    const aboutEl = document.getElementById('home-about');
    aboutEl.innerHTML = `
    <div class="about-grid" style="grid-template-columns:1fr 200px; gap:1.5rem;">
      <div>
        <p class="justified" style="margin-bottom:0">
          ${excerpt}
          <a href="#" id="home-read-more"
             style="color:var(--accent); text-decoration:underline">
            Read more…
          </a>
        </p>
      </div>
      <a href="images/profile.jpg" target="_blank">
        <img src="images/profile.jpg" alt="Profile" class="home-about-img"/>
      </a>
    </div>
  `;
    document.getElementById('home-read-more')
        .addEventListener('click', e => {
            e.preventDefault();
            document.querySelector('[data-tab="about"]').click();
        });

    // 2) News into #home-news
    const newsRaw = await fetch('sections/news.json').then(r => r.json());
    const newsC   = document.getElementById('home-news');
    newsC.innerHTML = '';
    newsRaw.news
        .sort((a,b) => new Date(b.date) - new Date(a.date))
        .forEach(item => {
            const div = document.createElement('div');
            div.className = 'news-item';

            if (item.image) {
                const imgLink = document.createElement('a');
                imgLink.href   = item.link || item.image;
                imgLink.target = '_blank';
                const thumb = document.createElement('img');
                thumb.src       = item.image;
                thumb.className = 'news-item-img';
                imgLink.appendChild(thumb);
                div.appendChild(imgLink);
            }

            const c = document.createElement('div');
            c.className = 'news-item-content';
            c.innerHTML = `
        <p style="font-size:0.9rem;color:var(--accent)">
          <strong>${item.date}</strong>
        </p>
        <h3 style="margin:0.2rem 0">${item.title}</h3>
        <p style="margin:0.3rem 0">
          ${item.content}
          ${item.link
                ? ` <a href="${item.link}" target="_blank"
                 style="color:var(--accent);text-decoration:underline">
                   Read more
               </a>`
                : ''}
        </p>
      `;
            div.appendChild(c);
            newsC.appendChild(div);
        });

    // 3) Recent publications from home-pubs.json
    const pubsData = await fetch('sections/home_pubs.json').then(r => r.json());
    const pubs = pubsData.homePubs || [];
    const pubsC = document.getElementById('home-pubs');
    pubsC.innerHTML = '';

    pubs.forEach(p => {
        // underline your surname
        const names = p.authors.split(', ').map(n =>
            n.toLowerCase().startsWith('mazziotti')
                ? `<u>${n}</u>`
                : n
        ).join(', ');

        

        const div = document.createElement('div');
        div.className = 'news-item';
        div.innerHTML = `
      <div class="news-item-content">
        <p style="font-size:0.9rem;color:var(--accent)">
          <strong>${p.year}</strong>
        </p>
        <h3 style="margin:0.2rem 0">${p.title}</h3>
        <p style="margin:0.3rem 0">
          ${names}<br>
          <em>${p.journal}</em>
          ${p.doi
            ? ` · <a href="https://doi.org/${p.doi}" class="doi-btn" target="_blank">DOI</a>`
            : ''}
        </p>
      </div>
    `;
        pubsC.appendChild(div);
    });
}

// Save to PDF
function initPDFDownloadTab() {
    const btn = document.querySelector('[data-tab="pdf"]');
    if (!btn) return;
    btn.addEventListener('click', async (e) => {
        e.preventDefault();      // don’t switch tabs or navigate
        await generatePDF();     // only now run your CV‐building function
    });
}

async function toDataURL(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

// Helper to create pill‐shaped section headers
function createSectionHeader(text, accent) {
    return {
        table: { widths: ['*'], body: [[{
                text: text.toUpperCase(),
                bold: true,
                color: '#fff',
                margin: [8, 4, 8, 4],
                fillColor: accent,
                border: [false, false, false, false]
            }]]},
        layout: { hLineWidth: ()=>0, vLineWidth: ()=>0 },
        margin: [0, 12, 0, 6]
    };
}

// Helper to underline "Mazziotti" in author lists
function underlineMe(authorsStr) {
    const surname = 'Mazziotti';
    const clean = authorsStr.replace(/<[^>]+>/g, '');
    return clean.split(', ').flatMap((p, i) => [
        ...(i ? [{ text: ', ' }] : []),
        p.startsWith(surname)
            ? { text: p, decoration: 'underline' }
            : { text: p }
    ]);
}

async function generatePDF() {
  const accent = '#6e6e6e';
  const siteURL = 'https://raffaelemazziotti.github.io/RM_info/';

  // --- ensure publications in memory ---
  await loadPublications();

  // --- recompute stats locally for the inline chart ---
  const [cpyHead, cpyRow] = (await fetch('data/citations_per_year.csv').then(r => r.text()))
    .trim().split('\n').map(l => l.split(','));
  const citYears   = cpyHead.slice();
  const citCounts  = cpyRow.map(v => +v);

  const SQL = await window.initSqlJs({ locateFile:f=>`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${f}` });
  const buf = await fetch('data/scopus.db').then(r => r.arrayBuffer());
  const db  = new SQL.Database(new Uint8Array(buf));
  const artRows = db.exec("SELECT substr(year,1,4) y, COUNT(*) c FROM articles GROUP BY y")[0]?.values || [];
  const artMap  = Object.fromEntries(artRows);

  const years = [...new Set([...citYears, ...Object.keys(artMap)])].sort();
  const artCounts = years.map(y => +artMap[y] || 0);
  const citAligned = years.map(y => {
    const i = citYears.indexOf(y);
    return i >= 0 ? +citCounts[i] : 0;
  });

  // --- inline dual-axis chart (centered, compact, with axis labels and points) ---
  function createInlineChart(years, bars, line, accent) {
    if (!years.length) return { text: 'No data available', margin: [0, 10, 0, 20], color: '#999' };

    const w = 450;                  // total width
    const h = 160;                  // compact total height
    const margin = { top: 10, right: 45, bottom: 30, left: 45 };

    const plotW = w - margin.left - margin.right;
    const plotH = h - margin.top - margin.bottom;

    const maxCit = Math.max(...line, 1);
    const maxArt = Math.max(...bars, 1);
    const xStep = plotW / years.length;
    const yCitScale = plotH / maxCit;
    const yArtScale = plotH / maxArt;

    // bars (articles)
    const barWidth = xStep * 0.5;
    const barsSvg = bars.map((v, i) => {
      const x = margin.left + i * xStep + (xStep - barWidth) / 2;
      const y = margin.top + (plotH - v * yArtScale);
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${v * yArtScale}" fill="rgba(129,162,190,0.6)"/>`;
    }).join('');

    // line (citations)
    const linePath = line.map((v, i) => {
      const x = margin.left + i * xStep + xStep / 2;
      const y = margin.top + (plotH - v * yCitScale);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    }).join(' ');
    const pointCircles = line.map((v, i) => {
      const x = margin.left + i * xStep + xStep / 2;
      const y = margin.top + (plotH - v * yCitScale);
      return `<circle cx="${x}" cy="${y}" r="3" fill="${accent}" stroke="white" stroke-width="1"/>`;
    }).join('');

    // axes
    const ticksL = 5, ticksR = 5;
    const tickValsL = Array.from({ length: ticksL + 1 }, (_, i) => Math.round((i / ticksL) * maxCit));
    const tickValsR = Array.from({ length: ticksR + 1 }, (_, i) => Math.round((i / ticksR) * maxArt));

    const yTicksLeft = tickValsL.map(v => {
      const y = margin.top + (plotH - v * yCitScale);
      return `
        <line x1="${margin.left - 5}" y1="${y}" x2="${margin.left}" y2="${y}" stroke="black" stroke-width="1"/>
        <text x="${margin.left - 8}" y="${y + 3}" font-size="8" text-anchor="end">${v}</text>
        <line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#ccc" stroke-width="0.3"/>
      `;
    }).join('');

    const yTicksRight = tickValsR.map(v => {
      const y = margin.top + (plotH - v * yArtScale);
      return `
        <line x1="${margin.left + plotW}" y1="${y}" x2="${margin.left + plotW + 5}" y2="${y}" stroke="black" stroke-width="1"/>
        <text x="${margin.left + plotW + 8}" y="${y + 3}" font-size="8" text-anchor="start">${v}</text>
      `;
    }).join('');

    const xTicks = years.map((yr, i) => {
      const x = margin.left + i * xStep + xStep / 2;
      const y = margin.top + plotH;
      return `
        <line x1="${x}" y1="${y}" x2="${x}" y2="${y + 3}" stroke="black" stroke-width="1"/>
        <text x="${x}" y="${y + 14}" font-size="8" text-anchor="middle">${yr}</text>
      `;
    }).join('');

    const axesLines = `
      <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="black" stroke-width="1"/>
      <line x1="${margin.left + plotW}" y1="${margin.top}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="black" stroke-width="1"/>
      <line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="black" stroke-width="1"/>
    `;

    const labels = `
      <text x="${margin.left - 30}" y="${margin.top + plotH / 2}" font-size="9" text-anchor="middle"
            transform="rotate(-90 ${margin.left - 30},${margin.top + plotH / 2})">Citations</text>
      <text x="${margin.left + plotW + 30}" y="${margin.top + plotH / 2}" font-size="9" text-anchor="middle"
            transform="rotate(90 ${margin.left + plotW + 30},${margin.top + plotH / 2})">Articles</text>
    `;

    const svg = `
      <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <rect x="0" y="0" width="${w}" height="${h}" fill="transparent"/>
        ${barsSvg}
        <path d="${linePath}" stroke="${accent}" stroke-width="2" fill="none"/>
        ${pointCircles}
        ${axesLines}
        ${yTicksLeft}
        ${yTicksRight}
        ${xTicks}
        ${labels}
      </svg>
    `;

    return { svg, alignment: 'center', margin: [0, 10, 0, 20] };
  }

  // --- load all JSON sections (as before) ---
  const aboutRaw     = await fetch('sections/about.json').then(r => r.json());
  const eduData      = await fetch('sections/education.json').then(r => r.json());
  const expData      = await fetch('sections/experience.json').then(r => r.json());
  const thesesData   = await fetch('sections/theses.json').then(r => r.json());
  const sympData     = await fetch('sections/symposia.json').then(r => r.json());
  const postersData  = await fetch('sections/posters.json').then(r => r.json());
  const patentsData  = await fetch('sections/patents.json').then(r => r.json());
  const skillsData   = await fetch('sections/tech_skills.json').then(r => r.json());
  const teachingData = await fetch('sections/teaching.json').then(r => r.json());
  const awardsData   = await fetch('sections/awards.json').then(r => r.json());
  const grantsData   = await fetch('sections/grants.json').then(r => r.json());
  const linksJson    = await fetch('sections/links.json').then(r => r.json());

  // stats tiles source
  const scopus       = await fetch('data/scopus_author_info.json').then(r => r.json());
  const scholarCSV   = await fetch('data/scholar_author_info.csv').then(r => r.text());
  const [h, row]     = scholarCSV.trim().split('\n').map(l => l.split(','));
  const scholar      = Object.fromEntries(h.map((k,i) => [k.trim().toLowerCase(), row[i].trim()]));

  // --- parse About into inline text/link objects ---
  const aboutHtml = aboutRaw.about.content_html;
  const aboutInline = [];
  let lastIndex = 0; let match;
  const linkRe = /<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  while ((match = linkRe.exec(aboutHtml)) !== null) {
    const [full, href, linkText] = match;
    if (match.index > lastIndex) {
      const txt = aboutHtml.slice(lastIndex, match.index).replace(/<[^>]+>/g, '');
      aboutInline.push({ text: txt });
    }
    aboutInline.push({ text: linkText, link: href, color: accent, decoration: 'underline' });
    lastIndex = match.index + full.length;
  }
  if (lastIndex < aboutHtml.length) {
    const txt = aboutHtml.slice(lastIndex).replace(/<[^>]+>/g, '');
    aboutInline.push({ text: txt });
  }

  // --- profile image and contacts table ---
  const profileImg = await toDataURL('images/profile.jpg');
  const contactRows = linksJson.links
    .flatMap(category => category.items)
    .map(item => [
      { text: item.name + ':', bold: true },
      { text: item.url, link: item.url, color: accent, decoration: 'underline' }
    ]);

  // --- publication cards (unchanged layout, includes roles) ---
  const pubCards = window.allPubs
    .sort((a, b) => b.year - a.year)
    .flatMap(pub => [{
      table: {
        widths: [40, '*'],
        body: [[
          {
            text: String(pub.year),
            bold: true,
            color: '#fff',
            fillColor: accent,
            alignment: 'center',
            margin: [0, 6, 0, 6]
          },
          {
            stack: [
              { text: pub.title, bold: true, margin: [0, 0, 0, 4] },
              { text: underlineMe(pub.names), margin: [0, 0, 0, 4] },
              { text: pub.journal, italics: true, margin: [0, 0, 0, 4] },
              ...(pub.roles && pub.roles.length
                ? [{ text: `Role: ${pub.roles.join(', ')} author`, margin: [0, 0, 0, 4], color: accent }]
                : []),
              { text: `Citations: ${pub.cites ?? '–'}`, margin: [0, 0, 0, 4], color: '#999' },
              ...(pub.doi ? [{
                text: `DOI: ${pub.doi}`,
                link: `https://doi.org/${pub.doi}`,
                color: accent,
                decoration: 'underline',
                margin: [0, 4, 0, 4]
              }] : [])
            ]
          }
        ]]
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => accent,
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 6,
        paddingBottom: () => 6
      },
      margin: [0, 8, 0, 8]
    }]);

  // --- experience rows ---
  const expRows = expData.map(e => [
    { text: e.period, bold: true, margin: [0, 2, 0, 2] },
    { text: `${e.position}, ${e.institution}` + (e.duration ? ` (${e.duration})` : ''), italics: true }
  ]);

  // --- teaching rows ---
  const teachRows = teachingData.teaching.map(item => {
    const period = item.period || item.date || item.academicYear || '';
    const detailStack = [
      { text: item.type, bold: true },
      item.course   ? { text: 'Course: ' + item.course } : null,
      item.teaching ? { text: 'Teaching: ' + item.teaching } : null,
      item.hours    ? { text: 'Hours: ' + item.hours } : null
    ].filter(Boolean);
    return [
      { text: period, bold: true, margin: [0, 2, 0, 2] },
      { stack: detailStack, margin: [0, 2, 0, 2] }
    ];
  });

  // --- awards rows ---
  const awardRows = awardsData.awards.map(item => {
    const period = item.date || item.year || item.academicYear || '';
    const details = [
      item.institution ? `Institution: ${item.institution}` : null,
      item.issuer      ? `Issuer: ${item.issuer}`           : null,
      item.event       ? `Event: ${item.event}`             : null,
      item.organizer   ? `Organizer: ${item.organizer}`     : null,
      item.program     ? `Program: ${item.program}`         : null,
      item.award       ? `Award: ${item.award}`             : null
    ].filter(Boolean);
    return [
      { text: period, bold: true, margin: [0, 2, 0, 2] },
      { stack: [{ text: item.title, bold: true }, ...details.map(l => ({ text: l }))], margin: [0, 2, 0, 2] }
    ];
  });

  // --- grants rows ---
  const grantRows = grantsData.grants.map(item => {
    let period = item.date || '';
    if (item.durationMonths) period += ` (${item.durationMonths} mo)`;
    const details = [
      `Role: ${item.role}`,
      item.issuer   ? `Issuer: ${item.issuer}` : null,
      item.subtitle ? item.subtitle            : null,
      `Funding: ${item.funding}`
    ].filter(Boolean);
    return [
      { text: period, bold: true, margin: [0, 2, 0, 2] },
      { stack: [{ text: item.title, bold: true }, ...details.map(l => ({ text: l }))], margin: [0, 2, 0, 2] }
    ];
  });

  // --- assemble PDF document ---
  const dd = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 60],
    content: [
      { text: [{ text: 'Online Version', link: siteURL, color: accent, decoration: 'underline' }], margin: [0, 0, 0, 12] },
      {
        table: {
          widths: [80, '*'],
          body: [
            [
              { image: profileImg, width: 80, rowSpan: 2 },
              { text: 'Mazziotti Raffaele M.', bold: true, color: '#fff', fillColor: accent, margin: [6, 6], fontSize: 18 }
            ],
            [
              {},
              { table: { widths: ['auto', '*'], body: contactRows }, layout: 'noBorders' }
            ]
          ]
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 12]
      },

      createSectionHeader('About', accent),
      { text: aboutInline, margin: [0, 0, 0, 12] },

      createSectionHeader('Citations and Articles per Year', accent),
      createInlineChart(years, artCounts, citAligned, accent),

      createSectionHeader('Author Metrics', accent),
      {
        table: {
          widths: ['*', '*', '*', '*'],
          body: [
            [
              { text: 'Metric', bold: true, fillColor: '#eeeeee' },
              { text: 'Google Scholar', bold: true, fillColor: '#eeeeee' },
              { text: 'Scopus', bold: true, fillColor: '#eeeeee' }
            ],
            ['# Articles', '–', scopus.document_count?.toString() || '–'],
            ['Citations', scholar['citations'] || '–', scopus.citation_count?.toString() || '–'],
            ['h-index', scholar['hindex'] || '–', scopus.h_index?.toString() || '–']
          ]
        },
        layout: {
          fillColor: (i) => i === 0 ? '#eeeeee' : null,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => accent,
          vLineColor: () => accent
        },
        margin: [0, 0, 0, 12]
      },

      createSectionHeader('Education', accent),
      {
        table: { widths: [100, '*'], body: eduData.map(e => [{ text: e.date, bold: true }, e.description]) },
        layout: { fillColor: (i) => i % 2 ? null : '#f7f7f7', hLineWidth: () => 0, vLineWidth: () => 0 },
        margin: [0, 0, 0, 12]
      },

      createSectionHeader('Appointments & Experience', accent),
      {
        table: { widths: [120, '*'], body: expRows },
        layout: { fillColor: (i) => i % 2 ? null : '#f7f7f7', hLineWidth: () => 0, vLineWidth: () => 0 },
        margin: [0, 0, 0, 12]
      },

      createSectionHeader('Thesis Supervision', accent),
      ...Object.entries(thesesData).flatMap(([deg, list]) => {
        const header = [{ text: deg.charAt(0).toUpperCase() + deg.slice(1), colSpan: 2, bold: true, fillColor: '#f7f7f7', margin: [0, 6, 0, 4] }, {}];
        const rows = list.map(t => ([{ text: t.academicYear, bold: true }, { text: `${t.student} — ${t.thesisTitle}`, italics: true }]));
        return [{
          table: { widths: [100, '*'], body: [header, ...rows] },
          layout: { fillColor: (r) => r > 0 && r % 2 === 0 ? '#f7f7f7' : null, hLineWidth: () => 0, vLineWidth: () => 0 },
          margin: [0, 0, 0, 12]
        }];
      }),

      createSectionHeader('Symposia & Invited Talks', accent),
      {
        table: {
          widths: [100, '*'],
          body: [
            [{ text: 'Organized', colSpan: 2, bold: true, fillColor: '#f7f7f7' }, {}],
            ...sympData.organized.map(o => [{ text: o.date, bold: true }, { text: `${o.title} (${o.event})` }]),
            [{ text: 'Invited', colSpan: 2, bold: true, fillColor: '#f7f7f7' }, {}],
            ...sympData.invited.map(i => [{ text: i.date, bold: true }, { text: `${i.title} (${i.event})` }])
          ]
        },
        layout: { fillColor: (i) => i % 2 ? null : '#f7f7f7', hLineWidth: () => 0, vLineWidth: () => 0 },
        margin: [0, 0, 0, 12]
      },

      createSectionHeader('Teaching & Seminars', accent),
      {
        table: { widths: [120, '*'], body: teachRows },
        layout: { fillColor: (i) => i % 2 ? null : '#f7f7f7', hLineWidth: () => 0, vLineWidth: () => 0 },
        margin: [0, 0, 0, 12]
      },

      createSectionHeader('Posters', accent),
      {
        table: {
          widths: [100, '*'],
          body: postersData.posters.map(p => [
            { text: p.date, bold: true },
            { text: `${p.title} — ${p.authors.join(', ')} (${p.event})` }
          ])
        },
        layout: { fillColor: (i) => i % 2 ? '#f7f7f7' : null, hLineWidth: () => 0, vLineWidth: () => 0 },
        margin: [0, 0, 0, 12]
      },

      createSectionHeader('Patents', accent),
      {
        table: {
          widths: [100, '*'],
          body: patentsData.patents.map(p => [
            { text: String(p.year), bold: true },
            { text: `${p.title} [Ref: ${p.refNumber}; Holder: ${p.holder}]` }
          ])
        },
        layout: { fillColor: (i) => i % 2 ? '#f7f7f7' : null, hLineWidth: () => 0, vLineWidth: () => 0 },
        margin: [0, 0, 0, 12]
      },

      createSectionHeader('Awards & Honors', accent),
      {
        table: { widths: [120, '*'], body: awardRows },
        layout: { fillColor: (i) => i % 2 ? null : '#f7f7f7', hLineWidth: () => 0, vLineWidth: () => 0 },
        margin: [0, 0, 0, 12]
      },

      createSectionHeader('Grants', accent),
      {
        table: { widths: [120, '*'], body: grantRows },
        layout: { fillColor: (i) => i % 2 ? null : '#f7f7f7', hLineWidth: () => 0, vLineWidth: () => 0 },
        margin: [0, 0, 0, 12]
      },

      createSectionHeader('Technical Skills', accent),
      ...Object.entries(skillsData).flatMap(([cat, items]) => [
        { text: cat, bold: true, margin: [0, 6, 0, 4] },
        ...items.map(i => ({ text: `• ${i}`, margin: [10, 0, 0, 4] }))
      ]),

      createSectionHeader('Publications', accent),
      ...pubCards,

      {
        text:
          'Dichiaro, ai sensi degli articoli 46 e 47 del D.P.R. 28 dicembre 2000, n. 445, che quanto riportato nel presente curriculum vitae corrisponde a verità.\n' +
          'Autorizzo il trattamento dei miei dati personali ai sensi del Regolamento UE 2016/679 (GDPR) e del D.lgs. 196/2003 e successive modifiche.',
        italics: true,
        fontSize: 9,
        margin: [0, 30, 0, 4],
        alignment: 'left',
        color: '#999'
      }
    ],
    defaultStyle: { fontSize: 11 }
  };

  pdfMake.createPdf(dd).download('CV_Mazziotti.pdf');
}

function initDOCXDownloadTab() {
    const btn = document.querySelector('[data-tab="docx"]');
    if (!btn) return;
    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        await generateDOCX();
    });
}

async function generateDOCX() {
    const {
        Document, Packer,
        Paragraph, TextRun,
        HeadingLevel, ImageRun
    } = window.docx;

    // Use the correct online CV URL
    const siteURL = 'https://raffaelemazziotti.github.io/RM_info/';

    // 1) Optionally load publications
    if (typeof loadPublications === 'function') {
        await loadPublications();
    }

    // 2) JSON fetch helper
    const fetchJSON = async path => {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`Failed to load ${path}`);
        return res.json();
    };

    // 3) Load all data
    const [
        aboutRaw,
        eduData, expData, thesesData,
        sympData, postersData, patentsData,
        skillsData, teachingData, awardsData,
        grantsData, linksJson
    ] = await Promise.all([
        fetchJSON('sections/about.json'),
        fetchJSON('sections/education.json'),
        fetchJSON('sections/experience.json'),
        fetchJSON('sections/theses.json'),
        fetchJSON('sections/symposia.json'),
        fetchJSON('sections/posters.json'),
        fetchJSON('sections/patents.json'),
        fetchJSON('sections/tech_skills.json'),
        fetchJSON('sections/teaching.json'),
        fetchJSON('sections/awards.json'),
        fetchJSON('sections/grants.json'),
        fetchJSON('sections/links.json')
    ]);

    // 4) Load profile image
    const imgBuffer = await fetch('images/profile.jpg').then(r => {
        if (!r.ok) throw new Error('Failed to load profile image');
        return r.arrayBuffer();
    });

    // 5) Styled-paragraph helpers
    const h1 = text => new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [ new TextRun({ text, bold: true, size: 32 }) ],
        spacing: { before: 300, after: 200 }
    });
    const h2 = text => new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [ new TextRun({ text, bold: true, italics: true, size: 28 }) ],
        spacing: { before: 200, after: 150 }
    });
    const normal = text => new Paragraph({
        children: [ new TextRun({ text }) ],
        spacing: { after: 100 }
    });
    const bullet = text => new Paragraph({
        text,
        bullet: { level: 0 },
        spacing: { after: 80 }
    });
    const contactParagraph = (label, value, link) => new Paragraph({
        children: [
            new TextRun({ text: label + ': ', bold: true }),
            new TextRun({ text: value, link, style: 'Hyperlink' })
        ],
        spacing: { after: 100 }
    });

    // 6) Build document content
    const content = [];

    // Header: image + name
    content.push(new Paragraph({
        children: [
            new ImageRun({ data: imgBuffer, transformation: { width: 80, height: 80 } }),
            new TextRun({ text: '  Mazziotti Raffaele M.', bold: true, size: 40 })
        ],
        spacing: { after: 200 }
    }));

    // Affiliations
    content.push(new Paragraph({
        children: [
            new TextRun({
                text: 'Researcher, University of Florence; Institute of Neuroscience CNR – Pisa',
                italics: true
            })
        ],
        spacing: { after: 300 }
    }));

    // Contacts (including Website at top)
    content.push(h1('Contacts'));
    content.push(contactParagraph('Website', siteURL, siteURL));
    linksJson.links
        .flatMap(cat => cat.items)
        .forEach(item => {
            content.push(contactParagraph(item.name, item.url, item.url));
        });

    // About
    content.push(h1('About'));
    {
        const tmp = document.createElement('div');
        tmp.innerHTML = aboutRaw.about.content_html;
        tmp.innerText.trim().split(/\n+/).forEach(line => {
            content.push(normal(line.trim()));
        });
    }

    // Education
    content.push(h1('Education'));
    eduData.forEach(e => {
        content.push(new Paragraph({
            children: [
                new TextRun({ text: e.date + ': ', bold: true }),
                new TextRun({ text: e.description, italics: true })
            ],
            spacing: { after: 100 }
        }));
    });

    // Appointments & Experience
    content.push(h1('Appointments & Experience'));
    expData.forEach(e => {
        content.push(new Paragraph({
            children: [
                new TextRun({ text: e.period + ': ', bold: true }),
                new TextRun({
                    text: `${e.position}, ${e.institution}` + (e.duration ? ` (${e.duration})` : ''),
                    italics: true
                })
            ],
            spacing: { after: 100 }
        }));
    });

    // Thesis Supervision
    content.push(h1('Thesis Supervision'));
    Object.entries(thesesData).forEach(([deg, list]) => {
        content.push(h2(deg.charAt(0).toUpperCase() + deg.slice(1)));
        list.forEach(t => content.push(bullet(`${t.academicYear}: ${t.student} — ${t.thesisTitle}`)));
    });

    // Symposia & Invited Talks
    content.push(h1('Symposia & Invited Talks'));
    content.push(h2('Organized'));
    sympData.organized.forEach(o => content.push(bullet(`${o.date}: ${o.title} (${o.event})`)));
    content.push(h2('Invited'));
    sympData.invited.forEach(i => content.push(bullet(`${i.date}: ${i.title} (${i.event})`)));

    // Teaching & Seminars
    content.push(h1('Teaching & Seminars'));
    teachingData.teaching.forEach(t => {
        const period = t.period || t.date || t.academicYear || '';
        const details = [t.type, t.course, t.teaching, t.hours && `Hours: ${t.hours}`]
            .filter(Boolean).join(' — ');
        content.push(new Paragraph({
            children: [
                new TextRun({ text: period + ': ', bold: true }),
                new TextRun({ text: details })
            ],
            spacing: { after: 100 }
        }));
    });

    // Posters
    content.push(h1('Posters'));
    postersData.posters.forEach(p =>
        content.push(bullet(`${p.date}: ${p.title} — ${p.authors.join(', ')} (${p.event})`))
    );

    // Patents
    content.push(h1('Patents'));
    patentsData.patents.forEach(p =>
        content.push(bullet(`${p.year}: ${p.title} [Ref: ${p.refNumber}; Holder: ${p.holder}]`))
    );

    // Awards & Honors
    content.push(h1('Awards & Honors'));
    awardsData.awards.forEach(a => {
        content.push(new Paragraph({
            children: [
                new TextRun({ text: (a.date || a.year) + ': ', bold: true }),
                new TextRun({ text: a.title || a.award }),
                new TextRun({ text: a.institution ? ` – ${a.institution}` : '', italics: true })
            ],
            spacing: { after: 100 }
        }));
    });

    // Grants
    content.push(h1('Grants'));
    grantsData.grants.forEach(g =>
        content.push(new Paragraph({
            children: [
                new TextRun({ text: (g.date + (g.durationMonths ? ` (${g.durationMonths} mo)` : '')) + ': ', bold: true }),
                new TextRun({ text: g.title }),
                new TextRun({ text: ` – Role: ${g.role}`, italics: true }),
                ...(g.issuer ? [ new TextRun({ text: `; Issuer: ${g.issuer}`, italics: true }) ] : []),
                new TextRun({ text: `; Funding: ${g.funding}` })
            ],
            spacing: { after: 100 }
        }))
    );

    // Technical Skills
    content.push(h1('Technical Skills'));
    Object.entries(skillsData).forEach(([cat, items]) => {
        content.push(h2(cat));
        items.forEach(i => content.push(bullet(i)));
    });

    // Publications
    content.push(h1('Publications'));
    if (Array.isArray(window.allPubs)) {
        window.allPubs
            .sort((a, b) => b.year - a.year)
            .forEach(pub => {
                // parse names with <u> tags
                const nameParts = pub.names.split(',').map(s => s.trim());
                const authorRuns = nameParts.map((part, i) => {
                    const m = part.match(/<u>(.*?)<\/u>/i);
                    const text = m ? m[1] : part;
                    return new TextRun({
                        text: text + (i < nameParts.length - 1 ? ', ' : ''),
                        underline: m ? {} : undefined
                    });
                });
                const dateRun    = new TextRun({ text: String(pub.year), bold: true });
                const titleRun   = new TextRun({ text: pub.title, italics: true });
                const journalRun = new TextRun({ text: pub.journal });
                const roleRun = (pub.roles && pub.roles.length)
                      ? new TextRun({ text: ` [Role: ${pub.roles.join(', ')} author]`, color: '808080' })
                      : null;
                const doiRun     = pub.doi
                    ? new TextRun({ text: pub.doi, link: `https://doi.org/${pub.doi}`, style: 'Hyperlink' })
                    : null;

                const children = [
                    ...authorRuns,
                    new TextRun({ text: ' (' }), dateRun, new TextRun({ text: ') ' }),
                    titleRun, new TextRun({ text: ', ' }), journalRun
                ];
                if (roleRun) children.push(roleRun);
                if (doiRun) {
                    children.push(new TextRun({ text: ', DOI: ' }), doiRun);
                }

                content.push(new Paragraph({ children, spacing: { after: 100 } }));
            });
    }

    // 7) Create & download DOCX
    const doc = new Document({ sections: [{ children: content }] });
    const blob = await Packer.toBlob(doc);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'CV_Mazziotti.docx';
    link.click();
}

async function displayLastUpdated() {
    const url = 'data/last_updated.txt';
    const elementId = 'ci-updated';
    const el = document.getElementById(elementId);
    if (!el) return;
    console.log(url)
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ts = (await res.text()).trim();
        const dt = new Date(ts);

        const dateStr = dt.toLocaleDateString(undefined, {
            year:  'numeric',
            month: 'short',
            day:   'numeric'
        });
        const timeStr = dt.toLocaleTimeString(undefined, {
            hour:   '2-digit',
            minute: '2-digit'
        });

        el.textContent = `Site last updated: ${dateStr} at ${timeStr}`;
    } catch (err) {
        console.error('Could not load last update time:', err);
        el.textContent = 'Site last updated: unavailable';
    }
}



















