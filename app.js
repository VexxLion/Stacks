/* Stacks — app.js (main list page) */

let activeCategory = "All";
let activePlaylist = null;
let searchTerm = "";
let editingId = null;
let pickedCategory = null;
let pickedPlaylists = new Set();

const $ = sel => document.querySelector(sel);
const listEl = $("#list");
const catChips = $("#catChips");
const plChips = $("#plChips");
const countLine = $("#countLine");
const sheetBackdrop = $("#sheetBackdrop");

function render() {
  const links = Store.getLinks();
  const categories = Store.getCategories();
  const playlists = Store.getPlaylists();

  // category chips
  catChips.innerHTML = "";
  ["All", ...categories].forEach(cat => {
    const b = document.createElement("button");
    b.className = "chip" + (activeCategory === cat ? " active" : "");
    b.textContent = cat;
    b.onclick = () => { activeCategory = cat; render(); };
    catChips.appendChild(b);
  });

  // playlist chips (optional secondary filter)
  plChips.innerHTML = "";
  playlists.forEach(pl => {
    const b = document.createElement("button");
    b.className = "chip playlist-chip" + (activePlaylist === pl ? " active" : "");
    b.textContent = "▸ " + pl;
    b.onclick = () => { activePlaylist = activePlaylist === pl ? null : pl; render(); };
    plChips.appendChild(b);
  });

  // filter
  let filtered = links.filter(l => {
    if (activeCategory !== "All" && l.category !== activeCategory) return false;
    if (activePlaylist && !(l.playlists || []).includes(activePlaylist)) return false;
    if (searchTerm) {
      const hay = (l.title + " " + (l.channel || "")).toLowerCase();
      if (!hay.includes(searchTerm.toLowerCase())) return false;
    }
    return true;
  });

  countLine.textContent = `${filtered.length} saved`;

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `
      <div class="glyph">◌</div>
      <h2>${links.length === 0 ? "Nothing on the shelf yet" : "No matches"}</h2>
      <p>${links.length === 0
        ? "Share a video from YouTube, or tap + to paste a link. It'll land here, sorted the way you like."
        : "Try a different search or filter."}</p>`;
    listEl.appendChild(empty);
    return;
  }

  listEl.innerHTML = "";
  filtered.forEach(link => listEl.appendChild(renderStub(link)));
}

function renderStub(link) {
  const el = document.createElement("div");
  el.className = "stub" + (link.watched ? " watched" : "");
  el.innerHTML = `
    <img class="stub-thumb" src="${escapeHtml(link.thumbnail || '')}" alt="" loading="lazy" />
    <div class="stub-body">
      <p class="stub-title">${escapeHtml(link.title)}</p>
      <div class="stub-channel">${escapeHtml(link.channel || "")}</div>
      <div class="stub-perf"></div>
      <div class="stub-meta">
        ${link.category ? `<span class="stamp cat">${escapeHtml(link.category)}</span>` : ""}
        ${(link.playlists || []).map(p => `<span class="stamp pl">${escapeHtml(p)}</span>`).join("")}
        <span class="stub-date">${timeAgo(link.addedAt)}</span>
      </div>
    </div>
    <div class="stub-actions">
      <button class="icon-btn watch-toggle" aria-label="Toggle watched" title="Mark watched">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </button>
      <button class="icon-btn edit-btn" aria-label="Edit" title="Edit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
      </button>
    </div>
  `;
  el.querySelector(".watch-toggle").onclick = (e) => {
    e.stopPropagation();
    Store.updateLink(link.id, { watched: !link.watched });
    render();
  };
  el.querySelector(".edit-btn").onclick = (e) => {
    e.stopPropagation();
    openSheet(link);
  };
  el.onclick = () => window.open(link.url, "_blank", "noopener");
  return el;
}

/* ---------- Add / edit sheet ---------- */

function openSheet(link) {
  editingId = link ? link.id : null;
  pickedCategory = link ? link.category : null;
  pickedPlaylists = new Set(link ? (link.playlists || []) : []);

  $("#sheetTitle").textContent = link ? "Edit link" : "Add a link";
  $("#fUrl").value = link ? link.url : "";
  $("#fUrl").disabled = !!link;
  $("#fTitleField").value = link ? link.title : "";
  $("#deleteRow").style.display = link ? "flex" : "none";

  renderCategoryPicker();
  renderMultiPicker();

  sheetBackdrop.classList.add("open");
}

function renderCategoryPicker() {
  const container = $("#catPicker");
  container.innerHTML = "";
  Store.getCategories().forEach(name => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tag-option" + (pickedCategory === name ? " selected" : "");
    b.textContent = name;
    b.onclick = () => {
      pickedCategory = pickedCategory === name ? null : name;
      renderCategoryPicker();
    };
    container.appendChild(b);
  });
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "tag-option new-tag";
  addBtn.textContent = "+ new";
  addBtn.onclick = () => {
    const name = prompt("New category name:");
    if (name && name.trim()) {
      pickedCategory = name.trim();
      Store.addCategory(pickedCategory);
      renderCategoryPicker();
    }
  };
  container.appendChild(addBtn);
}

function renderMultiPicker() {
  const container = $("#plPicker");
  container.innerHTML = "";
  Store.getPlaylists().forEach(name => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tag-option" + (pickedPlaylists.has(name) ? " selected" : "");
    b.textContent = name;
    b.onclick = () => {
      pickedPlaylists.has(name) ? pickedPlaylists.delete(name) : pickedPlaylists.add(name);
      renderMultiPicker();
    };
    container.appendChild(b);
  });
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "tag-option new-tag";
  addBtn.textContent = "+ new";
  addBtn.onclick = () => {
    const name = prompt("New playlist name:");
    if (name && name.trim()) {
      pickedPlaylists.add(name.trim());
      Store.addPlaylist(name.trim());
      renderMultiPicker();
    }
  };
  container.appendChild(addBtn);
}

function closeSheet() {
  sheetBackdrop.classList.remove("open");
  editingId = null;
}

$("#fabAdd").onclick = () => openSheet(null);
$("#cancelBtn").onclick = closeSheet;
sheetBackdrop.onclick = (e) => { if (e.target === sheetBackdrop) closeSheet(); };

$("#fUrl").addEventListener("change", async () => {
  const raw = $("#fUrl").value.trim();
  const url = YT.extractUrl(raw) || raw;
  const videoId = YT.extractVideoId(url);
  if (!videoId) return;
  try {
    const meta = await YT.fetchMeta(YT.canonicalUrl(videoId));
    if (!$("#fTitleField").value) $("#fTitleField").value = meta.title;
  } catch { /* offline or blocked — user can type title manually */ }
});

$("#saveBtn").onclick = () => {
  const raw = $("#fUrl").value.trim();
  const url = YT.extractUrl(raw) || raw;
  const videoId = YT.extractVideoId(url);
  const title = $("#fTitleField").value.trim();

  if (!editingId && !videoId) {
    alert("That doesn't look like a YouTube link yet.");
    return;
  }
  if (!title) {
    alert("Give it a title (or wait a beat for it to auto-fill).");
    return;
  }

  if (editingId) {
    Store.updateLink(editingId, {
      title,
      category: pickedCategory,
      playlists: Array.from(pickedPlaylists)
    });
  } else {
    Store.addLink({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      url: YT.canonicalUrl(videoId),
      videoId,
      title,
      channel: "",
      thumbnail: YT.thumbUrl(videoId),
      category: pickedCategory,
      playlists: Array.from(pickedPlaylists),
      watched: false,
      addedAt: new Date().toISOString()
    });
  }
  closeSheet();
  render();
};

$("#deleteBtn").onclick = () => {
  if (editingId && confirm("Remove this link from your shelf?")) {
    Store.deleteLink(editingId);
    closeSheet();
    render();
  }
};

$("#search").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  render();
});

/* ---------- Backup / restore ---------- */

$("#exportBtn").onclick = () => {
  const payload = {
    links: Store.getLinks(),
    categories: Store.getCategories(),
    playlists: Store.getPlaylists(),
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `stacks-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

$("#importBtn").onclick = () => $("#importFile").click();

$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const existing = Store.getLinks();
    const existingIds = new Set(existing.map(l => l.id));
    const merged = existing.concat((data.links || []).filter(l => !existingIds.has(l.id)));
    Store.saveLinks(merged);
    (data.categories || []).forEach(Store.addCategory);
    (data.playlists || []).forEach(Store.addPlaylist);
    render();
    alert("Backup imported.");
  } catch {
    alert("That file didn't look like a Stacks backup.");
  } finally {
    e.target.value = "";
  }
});

render();
