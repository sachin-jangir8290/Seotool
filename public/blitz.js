// Blitz tab: live counters + four judgment panels (site mode) or ad teardown (ads mode).
// Uses $, esc and api from dashboard.js.
const vClass = (v) => `v v-${v.replace(/ /g, ".")}`;
const verdict = (v) => `<span class="${vClass(v)}">${esc(v)}</span>`;
const meter = (x) => `<span class="meter"><i style="width:${Math.round(x * 100)}%"></i></span>`;
const dots = (x) => "■".repeat(Math.round(x * 5)).padEnd(5, "·");

const SAMPLE_ADS = `brand,text,days
Glowberry,"Tired of patchy roots? 10-minute colour that lasts 6 weeks. Shop now",161
Glowberry,"New: 12 shades, one price. Free shipping today only",30
Northwind Coffee,"Why does supermarket coffee taste flat? The reason is roast date. Learn more",77
Northwind Coffee,"I stopped paying $6 a cup. 3 bags a month, $29/mo. Start your subscription",149
Peakfit,"5 reasons runners switch to our app — rated 4.8 stars by 20,000 customers",96
Peakfit,"Stop guessing your pace. Try it free for 14 days",58
Brightdesk,"Brightdesk vs spreadsheets: see how teams save 6 hours a week. Book a demo",126
Brightdesk,"The #1 planner for remote teams. Guaranteed results overnight",15
Lumen Skin,"Read the label. Then read ours. 9 ingredients, nothing hidden. Shop now",89
Lumen Skin,"Don't miss our biggest sale: 30% off ends tonight",4
Lumen Skin,"“My skin finally calmed down after 2 weeks” — Priya, verified buyer",112
Northwind Coffee,"Introducing cold brew packs. Bundle of 6, save 20%",21`;

let blitzTimer;
function startClock(stats) {
  const t0 = performance.now();
  clearInterval(blitzTimer);
  blitzTimer = setInterval(() => { stats.elapsed = (performance.now() - t0) / 1000; drawStats(stats); }, 100);
}
function drawStats(s) {
  const rate = s.elapsed ? Math.round(s.judgments / s.elapsed) : 0;
  $("#blitz-stats").hidden = false;
  $("#blitz-stats").innerHTML = s.tiles.map(([label, val]) => `<div><small>${label}</small><b>${val(s, rate)}</b></div>`).join("");
}

$("#blitz-mode").onclick = (e) => {
  const m = e.target.dataset.m;
  if (!m) return;
  document.querySelectorAll("#blitz-mode button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
  $("#blitz-site").hidden = m !== "site";
  $("#blitz-ads").hidden = m !== "ads";
  $("#blitz-out").innerHTML = ""; $("#blitz-stats").hidden = true;
};
$("#ads-sample").onclick = () => { $("#blitz-ads").csv.value = SAMPLE_ADS; };

// ---------- site mode ----------
function panel(id, cls, title, sub, head) {
  return `<section class="panel ${cls}" id="${id}"><header><div><h3>${title}</h3><p>${sub}</p></div><div class="big" data-big>—</div></header>
    <div class="scroll"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody></tbody></table></div></section>`;
}
const addRows = (id, html) => {
  const tb = document.querySelector(`#${id} tbody`);
  tb.insertAdjacentHTML("beforeend", html);
};
const big = (id, v, label) => { document.querySelector(`#${id} [data-big]`).innerHTML = `${v}<small>${label}</small>`; };

$("#blitz-site").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = { url: f.url.value, competitors: f.competitors.value.split(",").map((s) => s.trim()).filter(Boolean), questions: f.questions.value, limit: f.limit.value };
  $("#blitz-out").innerHTML =
    panel("p1", "", "01 · Every SEO element, judged one by one", "Title, meta, H1, intro, images, FAQ, schema, canonical, content", ["Page", "Element", "Now → proposed", "Confidence", "Verdict"]) +
    panel("p4", "c4", "04 · How likely is each page to be cited by AI?", "Answer-first, facts, sources, schema, freshness, FAQ, compare, author", ["Page", "Chance", "Answer", "Facts", "Schema", "Fresh", "Fix this first", "After"]) +
    (body.questions.trim() ? panel("p3", "c3", "03 · Do our pages answer what people ask AI?", "Each question matched against every page", ["Question", "Asked", "Best page", "Match", "Verdict", "Next step"]) : "") +
    (body.competitors.length ? panel("p2", "c2", "02 · Competitor pages worth stealing", "Answer, depth, proof, schema, freshness", ["Competitor", "Page", "Answer", "Depth", "Proof", "Schema", "Fresh", "Verdict"]) : "");
  const stats = { pages: 0, judgments: 0, changes: 0, elapsed: 0, cites: [], tiles: [
    ["Pages read", (s) => s.pages], ["Judgments", (s) => s.judgments.toLocaleString()], ["Judgments / sec", (s, r) => r.toLocaleString()],
    ["To change", (s) => s.changes.toLocaleString()], ["Elapsed", (s) => s.elapsed.toFixed(1) + "s"], ["Cost so far", () => "$0.000"]] };
  startClock(stats);
  f.querySelector("button").disabled = true;
  try {
    const res = await fetch("/api/blitz/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines.filter(Boolean)) handle(JSON.parse(line), stats);
    }
  } catch (err) {
    $("#blitz-out").insertAdjacentHTML("afterbegin", `<p style="color:#d93a3a">${esc(err.message)}</p>`);
  } finally {
    clearInterval(blitzTimer); drawStats(stats); f.querySelector("button").disabled = false;
  }
};

function handle(m, s) {
  if (m.type === "stat" || m.type === "done") { s.pages = m.pages; s.judgments = m.judgments; if (m.type === "done") s.elapsed = m.elapsed; }
  if (m.type === "error" || m.type === "warn") $("#blitz-out").insertAdjacentHTML("afterbegin", `<p style="color:#d93a3a">${esc(m.message)}</p>`);
  if (m.type === "elements") {
    s.changes += m.rows.filter((r) => r.verdict === "Change").length;
    big("p1", s.changes.toLocaleString(), "to change");
    addRows("p1", m.rows.map((r) => `<tr class="new"><td>${esc(r.page)}</td><td>${esc(r.element)}</td>
      <td>${r.verdict === "Change" ? `<span class="strike">${esc(String(r.now).slice(0, 40))}</span> → <b>${esc(String(r.proposed).slice(0, 70))}</b>` : esc(String(r.now).slice(0, 60))}</td>
      <td>${r.confidence.toFixed(2)}</td><td>${verdict(r.verdict)}</td></tr>`).join(""));
  }
  if (m.type === "cite") {
    const r = m.row, f = r.factors;
    s.cites.push(r.chance);
    big("p4", Math.round(s.cites.filter((c) => c >= 50).length / s.cites.length * 100) + "%", "likely cited now");
    addRows("p4", `<tr class="new"><td>${esc(r.page)}</td><td>${meter(r.chance / 80)} ${r.chance}%</td><td class="dots">${dots(f.answer)}</td><td class="dots">${dots(f.facts)}</td>
      <td class="dots">${dots(f.schema)}</td><td class="dots">${dots(f.fresh)}</td><td>${esc(r.fixFirst)}</td><td><b>${r.after}%</b></td></tr>`);
  }
  if (m.type === "coverage") {
    const missing = m.rows.filter((r) => r.verdict !== "Answered").length;
    big("p3", Math.round((missing / m.rows.length) * 100) + "%", "with no good page");
    addRows("p3", m.rows.map((r) => `<tr class="new"><td>${esc(r.question)}</td><td>${r.asked ?? "—"}</td><td>${esc(r.page)}</td>
      <td>${meter(r.match / 100)} ${r.match}%</td><td>${verdict(r.verdict)}</td><td>${esc(r.next)}</td></tr>`).join(""));
  }
  if (m.type === "competitor") {
    const tb = document.querySelector("#p2 tbody");
    addRows("p2", m.rows.sort((a, b) => b.total - a.total).map((r) => `<tr class="new"><td>${esc(r.competitor)}</td><td title="${esc(r.title)}">${esc(r.page)}</td>
      ${["answer", "depth", "proof", "schema", "fresh"].map((k) => `<td class="dots">${dots(r.scores[k])}</td>`).join("")}<td>${verdict(r.verdict)}</td></tr>`).join(""));
    big("p2", tb.querySelectorAll(".v-Steal").length, "to build");
  }
}

// ---------- ads mode ----------
$("#blitz-ads").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const r = await api("/api/blitz/ads", { method: "POST", body: { csv: e.target.csv.value } });
    const s = { ...r.stats, elapsed: r.stats.ms / 1000, tiles: [
      ["Ads read", (x) => x.ads], ["Typed judgments", (x) => x.judgments], ["Advertisers", (x) => x.brands],
      ["Judgments / sec", (x, rate) => rate.toLocaleString()], ["Elapsed", (x) => `${x.ms.toFixed(1)} ms`], ["Cost so far", () => "$0.000"]] };
    drawStats(s);
    const bars = (title, list) => {
      const max = Math.max(...list.map(([, n]) => n));
      return `<div class="bars"><h4>${title}</h4>${list.slice(0, 6).map(([k, n]) => `<div><span>${esc(k)}</span><span>${n}</span><i style="width:${(n / max) * 100}%"></i></div>`).join("")}</div>`;
    };
    $("#blitz-out").innerHTML =
      `<section class="panel"><header><div><h3>01 · Teardown</h3><p>Every ad typed on 9 dimensions</p></div><div class="big">${r.rows.length}<small>ads</small></div></header>
        <div class="scroll"><table><thead><tr><th>Brand</th><th>Ad</th><th>Days</th><th>Hook</th><th>Format</th><th>Offer</th><th>Awareness</th><th>Driver</th><th>CTA</th><th>Specificity</th><th>Claim risk</th></tr></thead><tbody>${r.rows.map((a) =>
          `<tr class="new"><td>${esc(a.brand)}</td><td>${esc(a.text.slice(0, 70))}</td><td>${a.days}d</td><td>${esc(a.hook)}</td><td>${esc(a.format)}</td><td>${esc(a.offer)}</td><td>${esc(a.awareness)}</td><td>${esc(a.driver)}</td><td>${esc(a.cta)}</td><td>${a.specificity} / 3</td><td>${a.claimRisk === "YES" ? '<b style="color:#d93a3a">YES</b>' : "no"}</td></tr>`).join("")}</tbody></table></div></section>
      <section class="panel c2"><header><div><h3>02 · The category</h3><p>What everyone is running</p></div></header>
        <div class="cat">${bars("Hook archetype", r.category.hook)}${bars("Format", r.category.format)}${bars("Awareness stage", r.category.awareness)}${bars("Offer", r.category.offer)}</div></section>
      <section class="panel c3"><header><div><h3>03 · Patterns that survive</h3><p>Avg days live vs category average (${r.category.avgDays}d)</p></div></header>
        <div class="scroll"><table><thead><tr><th>Pattern</th><th>Ads</th><th>Survives vs avg</th><th>Avg days</th></tr></thead><tbody>${r.category.patterns.map((p) =>
          `<tr><td>${esc(p.pattern)}</td><td>${p.ads}</td><td>${meter(Math.min(1, p.survival / 2))} <b>${p.survival}×</b></td><td>${p.avgDays}d</td></tr>`).join("")}</tbody></table></div></section>
      <section class="panel c4"><header><div><h3>04 · Briefs for your next ads</h3><p>Modelled on the longest-running patterns</p></div><div class="big">${r.briefs.length}<small>briefs</small></div></header>
        ${r.briefs.map((b) => `<div class="brief"><div><small>Brief ${String(b.n).padStart(2, "0")} · ${esc(b.pattern)}</small><b>${esc(b.angle)}</b><small>modelled on: “${esc(b.modelledOn)}”</small>
          <small>Hook ${meter(b.hook)} Fit ${meter(b.fit)} Survival ${meter(b.survival)}</small></div><b class="s">${b.score}</b></div>`).join("")}</section>`;
  } catch (err) { $("#blitz-out").innerHTML = `<p style="color:#d93a3a">${esc(err.message)}</p>`; }
};
