// Rewriter tab. Uses $, esc, api and showTab from dashboard.js.
let rwMode = "ai", rwCurrent = null;
const LIMITS = { Title: [30, 60], "Meta description": [70, 155] };

$("#rw-mode").onclick = (e) => {
  if (!e.target.dataset.m) return;
  rwMode = e.target.dataset.m;
  document.querySelectorAll("#rw-mode button").forEach((b) => b.classList.toggle("on", b.dataset.m === rwMode));
};

function lenNote(el, text) {
  const l = LIMITS[el];
  if (!l) return "";
  const n = text.length, ok = n >= l[0] && n <= l[1];
  return `<span class="len" style="color:${ok ? "#16a36a" : "#d93a3a"}">${n} chars (aim ${l[0]}–${l[1]})</span>`;
}

function renderRewrite(r) {
  rwCurrent = r;
  const done = r.items.filter((i) => i.status === "approved").length;
  $("#rw-out").innerHTML = `<section class="sheet">
    <header style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div><h2 style="margin:0">${esc(r.url)}</h2>
      <p class="intro" style="margin:4px 0 0">${r.mode === "ai" ? "AI drafts" : "Rules drafts"} · ${r.items.length} items · <b id="rw-done">${done}</b> approved</p></div>
      <div class="rw-actions"><button class="btn ghost" id="rw-all">Approve all</button><button class="btn" id="rw-export">Copy approved HTML</button></div></header>
    <div style="margin-top:16px">${r.items.map((i) => `<div class="rw-item ${i.status}" data-item="${i.id}">
      <header><h3>${esc(i.element)}</h3><div class="rw-actions"><span class="pill ${i.status === "approved" ? "good" : i.status === "rejected" ? "bad" : "mid"}">${i.status}</span>
        <button class="btn" data-act="approved">Approve</button><button class="btn ghost" data-act="rejected">Reject</button></div></header>
      <div class="why">${esc(i.why)}</div>
      ${i.before ? `<div class="rw-before">${esc(i.before.slice(0, 400))}</div>` : ""}
      <textarea rows="${Math.min(14, Math.max(2, i.after.split("\n").length + 1))}" class="${i.element.includes("JSON-LD") || i.element === "Canonical" ? "code" : ""}">${esc(i.after)}</textarea>
      <div data-len>${lenNote(i.element, i.after)}</div></div>`).join("")}</div>
    <pre class="term rw-export" id="rw-html" hidden></pre></section>`;
}

async function saveItem(itemId, body) {
  const it = await api(`/api/rewrites/${rwCurrent.id}/items/${itemId}`, { method: "PATCH", body });
  Object.assign(rwCurrent.items.find((i) => i.id === it.id), it);
  return it;
}

$("#rw-out").addEventListener("click", async (e) => {
  const box = e.target.closest("[data-item]");
  if (box && e.target.dataset.act) {
    const after = box.querySelector("textarea").value;
    await saveItem(Number(box.dataset.item), { status: e.target.dataset.act, after });
    renderRewrite(rwCurrent); loadRewrites();
  }
  if (e.target.id === "rw-all") {
    for (const box of document.querySelectorAll("#rw-out [data-item]")) {
      const it = rwCurrent.items.find((i) => i.id === Number(box.dataset.item));
      if (it.status !== "rejected") await saveItem(it.id, { status: "approved", after: box.querySelector("textarea").value });
    }
    renderRewrite(rwCurrent); loadRewrites();
  }
  if (e.target.id === "rw-export") {
    const html = await (await fetch(`/api/rewrites/${rwCurrent.id}/export`)).text();
    $("#rw-html").hidden = false; $("#rw-html").textContent = html || "Approve some items first.";
    try { await navigator.clipboard.writeText(html); e.target.textContent = "Copied ✓"; } catch {}
  }
});
$("#rw-out").addEventListener("input", (e) => {
  const box = e.target.closest("[data-item]");
  if (box && e.target.tagName === "TEXTAREA") box.querySelector("[data-len]").innerHTML = lenNote(rwCurrent.items.find((i) => i.id === Number(box.dataset.item)).element, e.target.value);
});

async function runRewrite(url) {
  $("#rw-out").innerHTML = `<section class="sheet"><p>Reading the page and drafting${rwMode === "ai" ? " with Claude — this can take 20–40 seconds" : ""}…</p></section>`;
  try { renderRewrite(await api("/api/rewrites", { method: "POST", body: { url, mode: rwMode } })); loadRewrites(); }
  catch (err) { $("#rw-out").innerHTML = `<section class="sheet"><p style="color:#d93a3a">${esc(err.message)}</p></section>`; }
}
$("#rw-form").onsubmit = (e) => { e.preventDefault(); runRewrite(e.target.url.value); };

async function loadRewrites() {
  const list = await api("/api/rewrites");
  $("#rw-history").innerHTML = list.length ? `<div class="scroll"><table><thead><tr><th>Page</th><th>Mode</th><th>Approved</th><th>Date</th><th></th></tr></thead><tbody>${list.map((r) =>
    `<tr><td>${esc(r.url)}</td><td>${r.mode}</td><td>${r.approved} / ${r.total}</td><td>${esc(r.created_at)}</td><td><button class="btn ghost" data-rw="${r.id}">Open</button></td></tr>`).join("")}</tbody></table></div>` : "<p>No rewrites yet.</p>";
}
$("#rw-history").onclick = async (e) => { if (e.target.dataset.rw) { renderRewrite(await api(`/api/rewrites/${e.target.dataset.rw}`)); $("#rw-out").scrollIntoView({ behavior: "smooth" }); } };

// Entry point from Blitz: "✎ Rewrite" next to a page.
window.openRewrite = (url) => {
  showTab("rewrite");
  $("#rw-form").url.value = url;
  runRewrite(url);
};

(async () => {
  try {
    const { user, aiEnabled } = await api("/api/me");
    if (!user) return;
    if (!aiEnabled) { rwMode = "rules"; const b = document.querySelector('#rw-mode [data-m="ai"]'); b.disabled = true; b.textContent = "AI (needs ANTHROPIC_API_KEY)"; document.querySelector('#rw-mode [data-m="rules"]').classList.add("on"); b.classList.remove("on"); }
    await loadRewrites();
  } catch {}
})();
