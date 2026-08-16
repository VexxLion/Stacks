/* Stacks — app.js (main list page) */

let activeCategory = "All";
let activePlaylist = null;
let searchTerm = "";
let editingId = null;
let pickedCategory = null;
let pickedPlaylists = new Set();
let pickedPinned = false;
let sortMode = "newest"; // newest | oldest | title
const SORT_LABELS = { newest: "Newest ▾", oldest: "Oldest ▾", title: "Title A–Z ▾" };

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

  if (sortMode === "oldest") {
    filtered = filtered.slice().sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));
  } else if (sortMode === "title") {
    filtered = filtered.slice().sort((a, b) => a.title.localeCompare(b.title));
  } else {
    filtered = filtered.slice().sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  }

  // Pinned links always bubble to the top, keeping the chosen sort within each group.
  filtered = [...filtered.filter(l => l.pinned), ...filtered.filter(l => !l.pinned)];

  countLine.textContent = `${filtered.length} saved`;
  $("#sortBtn").textContent = SORT_LABELS[sortMode];

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
  el.className = "stub" + (link.watched ? " watched" : "") + (link.pinned ? " pinned" : "");
  el.innerHTML = `
    ${link.pinned ? '<div class="pin-badge">★</div>' : ""}
    <img class="stub-thumb" src="${escapeHtml(link.thumbnail || '')}" alt="" loading="lazy" onerror="this.classList.add('broken')" />
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

  // Single tap opens the video; a second tap within the window toggles pin
  // instead, so double-tap never also opens a link.
  let tapTimer = null;
  el.onclick = () => {
    if (tapTimer) {
      clearTimeout(tapTimer);
      tapTimer = null;
      Store.updateLink(link.id, { pinned: !link.pinned });
      render();
    } else {
      tapTimer = setTimeout(() => {
        tapTimer = null;
        window.open(link.url, "_blank", "noopener");
      }, 280);
    }
  };
  return el;
}

/* ---------- Add / edit sheet ---------- */

function openSheet(link) {
  editingId = link ? link.id : null;
  pickedCategory = link ? link.category : null;
  pickedPlaylists = new Set(link ? (link.playlists || []) : []);
  pickedPinned = link ? !!link.pinned : false;

  $("#sheetTitle").textContent = link ? "Edit link" : "Add a link";
  $("#fUrl").value = link ? link.url : "";
  $("#fUrl").disabled = !!link;
  $("#fTitleField").value = link ? link.title : "";
  $("#deleteRow").style.display = link ? "flex" : "none";
  $("#pinToggle").classList.toggle("selected", pickedPinned);

  renderCategoryPicker();
  renderMultiPicker();

  sheetBackdrop.classList.add("open");
}

$("#pinToggle").onclick = () => {
  pickedPinned = !pickedPinned;
  $("#pinToggle").classList.toggle("selected", pickedPinned);
};

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
      playlists: Array.from(pickedPlaylists),
      pinned: pickedPinned
    });
  } else {
    const dupe = Store.findByVideoId(videoId);
    if (dupe) {
      const mergedPlaylists = Array.from(new Set([...(dupe.playlists || []), ...pickedPlaylists]));
      Store.updateLink(dupe.id, {
        category: pickedCategory || dupe.category,
        playlists: mergedPlaylists,
        pinned: pickedPinned || dupe.pinned
      });
      alert("Already on your shelf — updated its category/playlists instead of adding a duplicate.");
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
        pinned: pickedPinned,
        addedAt: new Date().toISOString()
      });
    }
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

$("#sortBtn").onclick = () => {
  sortMode = sortMode === "newest" ? "oldest" : sortMode === "oldest" ? "title" : "newest";
  render();
};

/* ---------- Manage categories & playlists ---------- */

const manageBackdrop = $("#manageBackdrop");

function renderManageSheet() {
  const catList = $("#manageCats");
  const plList = $("#managePls");

  const cats = Store.getCategories();
  catList.innerHTML = cats.length ? "" : `<div class="manage-empty">No categories yet.</div>`;
  cats.forEach(name => {
    const row = document.createElement("div");
    row.className = "manage-item";
    row.innerHTML = `<span class="name">${escapeHtml(name)}</span>
      <button class="rename">Rename</button>
      <button class="del">Delete</button>`;
    row.querySelector(".rename").onclick = () => {
      const next = prompt("Rename category:", name);
      if (next && next.trim() && next.trim() !== name) {
        Store.renameCategory(name, next.trim());
        if (activeCategory === name) activeCategory = next.trim();
        renderManageSheet();
        render();
      }
    };
    row.querySelector(".del").onclick = () => {
      if (confirm(`Delete category "${name}"? Links keep their titles and playlists — they just lose this category.`)) {
        Store.deleteCategory(name);
        if (activeCategory === name) activeCategory = "All";
        renderManageSheet();
        render();
      }
    };
    catList.appendChild(row);
  });

  const pls = Store.getPlaylists();
  plList.innerHTML = pls.length ? "" : `<div class="manage-empty">No playlists yet.</div>`;
  pls.forEach(name => {
    const row = document.createElement("div");
    row.className = "manage-item";
    row.innerHTML = `<span class="name">${escapeHtml(name)}</span>
      <button class="rename">Rename</button>
      <button class="del">Delete</button>`;
    row.querySelector(".rename").onclick = () => {
      const next = prompt("Rename playlist:", name);
      if (next && next.trim() && next.trim() !== name) {
        Store.renamePlaylist(name, next.trim());
        if (activePlaylist === name) activePlaylist = next.trim();
        renderManageSheet();
        render();
      }
    };
    row.querySelector(".del").onclick = () => {
      if (confirm(`Delete playlist "${name}"? Links stay, they just come out of this playlist.`)) {
        Store.deletePlaylist(name);
        if (activePlaylist === name) activePlaylist = null;
        renderManageSheet();
        render();
      }
    };
    plList.appendChild(row);
  });
}

$("#manageTagsBtn").onclick = () => {
  renderManageSheet();
  manageBackdrop.classList.add("open");
};
$("#manageCloseBtn").onclick = () => manageBackdrop.classList.remove("open");
manageBackdrop.onclick = (e) => { if (e.target === manageBackdrop) manageBackdrop.classList.remove("open"); };

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
