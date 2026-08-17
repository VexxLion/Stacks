/* Stacks — app.js (main list page) */

const ARCHIVE_SENTINEL = "__archived__";
const SORT_LABELS = { newest: "Newest ▾", oldest: "Oldest ▾", title: "Title A–Z ▾" };

let activeCategory = "All";
let activePlaylist = null;
let searchTerm = "";
let sortMode = "newest";

let editingId = null;
let pickedCategory = null;
let pickedPlaylists = new Set();
let pickedPinned = false;

let selectMode = false;
let selectedIds = new Set();
let bulkTagMode = null;   // 'category' | 'playlist'
let bulkTagPicked = null; // string for category, Set for playlist

let lastDeleted = null;   // { links: [...] } for undo
let undoTimer = null;

const $ = sel => document.querySelector(sel);
const listEl = $("#list");
const catChips = $("#catChips");
const plChips = $("#plChips");
const countLine = $("#countLine");
const sheetBackdrop = $("#sheetBackdrop");

function truncateText(s, n) {
  return s && s.length > n ? s.slice(0, n - 1) + "…" : (s || "");
}

/* ================= Render ================= */

function render() {
  const links = Store.getLinks();
  const categories = Store.getCategories();
  const playlists = Store.getPlaylists();

  // category chips (+ archived pseudo-chip)
  catChips.innerHTML = "";
  ["All", ...categories].forEach(cat => {
    const b = document.createElement("button");
    b.className = "chip" + (activeCategory === cat ? " active" : "");
    b.textContent = cat;
    b.onclick = () => { activeCategory = cat; render(); };
    catChips.appendChild(b);
  });
  const archBtn = document.createElement("button");
  archBtn.className = "chip" + (activeCategory === ARCHIVE_SENTINEL ? " active" : "");
  archBtn.textContent = "🗄 Archived";
  archBtn.onclick = () => {
    activeCategory = activeCategory === ARCHIVE_SENTINEL ? "All" : ARCHIVE_SENTINEL;
    render();
  };
  catChips.appendChild(archBtn);

  // playlist chips
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
    const archived = Store.isArchived(l);
    if (activeCategory === ARCHIVE_SENTINEL) {
      if (!archived) return false;
    } else {
      if (archived && !searchTerm) return false; // archived stays out of normal views unless searching
      if (activeCategory !== "All" && l.category !== activeCategory) return false;
    }
    if (activePlaylist && !(l.playlists || []).includes(activePlaylist)) return false;
    if (searchTerm) {
      const hay = (l.title + " " + (l.channel || "") + " " + (l.note || "")).toLowerCase();
      if (!hay.includes(searchTerm.toLowerCase())) return false;
    }
    return true;
  });

  const usePlaylistOrder = !!activePlaylist && activeCategory !== ARCHIVE_SENTINEL;

  if (usePlaylistOrder) {
    filtered = filtered.slice().sort((a, b) =>
      Store.playlistOrderOf(a, activePlaylist) - Store.playlistOrderOf(b, activePlaylist)
    );
    $("#sortBtn").textContent = "Drag ⠿ to reorder";
    $("#sortBtn").disabled = true;
    $("#sortBtn").style.opacity = "0.5";
  } else {
    if (sortMode === "oldest") {
      filtered = filtered.slice().sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));
    } else if (sortMode === "title") {
      filtered = filtered.slice().sort((a, b) => a.title.localeCompare(b.title));
    } else {
      filtered = filtered.slice().sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
    }
    filtered = [...filtered.filter(l => l.pinned), ...filtered.filter(l => !l.pinned)];
    $("#sortBtn").textContent = SORT_LABELS[sortMode];
    $("#sortBtn").disabled = false;
    $("#sortBtn").style.opacity = "1";
  }

  countLine.textContent = activeCategory === ARCHIVE_SENTINEL
    ? `${filtered.length} archived`
    : `${filtered.length} saved`;

  $("#selectModeBtn").textContent = selectMode ? "Cancel" : "Select";
  $("#bulkBar").classList.toggle("show", selectMode && selectedIds.size > 0);
  $("#bulkCount").textContent = `${selectedIds.size} selected`;

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
  const showDragHandle = usePlaylistOrder && !selectMode;
  filtered.forEach(link => listEl.appendChild(renderStubWrap(link, { showDragHandle })));

  if (showDragHandle) {
    setupDragReorder(listEl, activePlaylist, filtered.map(l => l.id));
  }
}

/* ================= Card rendering ================= */

function renderStubWrap(link, opts) {
  const wrap = document.createElement("div");
  wrap.className = "stub-wrap";
  wrap.dataset.id = link.id;

  const bgWatch = document.createElement("div");
  bgWatch.className = "swipe-bg watch-bg";
  bgWatch.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Watched`;

  const bgDel = document.createElement("div");
  bgDel.className = "swipe-bg del-bg";
  bgDel.innerHTML = `Delete <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>`;

  const selected = selectedIds.has(link.id);
  const stub = document.createElement("div");
  stub.className = "stub"
    + (link.watched ? " watched" : "")
    + (link.pinned ? " pinned" : "")
    + (selected ? " selected" : "");

  stub.innerHTML = `
    ${selectMode
      ? `<div class="select-check">${selected ? "✓" : ""}</div>`
      : (link.pinned ? '<div class="pin-badge">★</div>' : "")}
    ${opts.showDragHandle ? '<div class="drag-handle">⠿</div>' : ""}
    <img class="stub-thumb" src="${escapeHtml(link.thumbnail || '')}" alt="" loading="lazy" onerror="this.classList.add('broken')" />
    <div class="stub-body">
      <p class="stub-title">${escapeHtml(link.title)}</p>
      <div class="stub-channel">${escapeHtml(link.channel || "")}</div>
      ${link.note ? `<div class="stub-note">${escapeHtml(link.note)}</div>` : ""}
      <div class="stub-perf"></div>
      <div class="stub-meta">
        ${link.category ? `<span class="stamp cat">${escapeHtml(link.category)}</span>` : ""}
        ${(link.playlists || []).map(p => `<span class="stamp pl">${escapeHtml(p)}</span>`).join("")}
        <span class="stub-date">${timeAgo(link.addedAt)}</span>
      </div>
    </div>
    ${selectMode ? "" : `
    <div class="stub-actions">
      <button class="icon-btn watch-toggle" aria-label="Toggle watched" title="Mark watched">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </button>
      <button class="icon-btn edit-btn" aria-label="Edit" title="Edit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
      </button>
    </div>`}
  `;

  wrap.appendChild(bgWatch);
  wrap.appendChild(bgDel);
  wrap.appendChild(stub);

  if (selectMode) {
    stub.addEventListener("click", () => {
      selectedIds.has(link.id) ? selectedIds.delete(link.id) : selectedIds.add(link.id);
      render();
    });
  } else {
    stub.querySelector(".watch-toggle").onclick = (e) => {
      e.stopPropagation();
      Store.setWatched(link.id, !link.watched);
      render();
    };
    stub.querySelector(".edit-btn").onclick = (e) => {
      e.stopPropagation();
      openSheet(link);
    };
    attachSwipeAndTap(stub, link);
  }

  return wrap;
}

/* ---- Swipe-to-act + tap / double-tap-to-pin, all on pointer events ---- */

function attachSwipeAndTap(stub, link) {
  let startX = 0, startY = 0, dx = 0, dy = 0;
  let isSwiping = false, tracking = false, pointerId = null, tapTimer = null;

  stub.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".stub-actions") || e.target.closest(".drag-handle")) return;
    tracking = true; isSwiping = false; dx = 0; dy = 0;
    startX = e.clientX; startY = e.clientY; pointerId = e.pointerId;
    stub.style.transition = "none";
  });

  stub.addEventListener("pointermove", (e) => {
    if (!tracking || e.pointerId !== pointerId) return;
    dx = e.clientX - startX; dy = e.clientY - startY;
    if (!isSwiping) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        isSwiping = true;
        try { stub.setPointerCapture(pointerId); } catch { /* ignore */ }
      } else if (Math.abs(dy) > 12) {
        tracking = false; // vertical intent — let the page scroll
        return;
      }
    }
    if (isSwiping) {
      const clamped = Math.max(-140, Math.min(140, dx));
      stub.style.transform = `translateX(${clamped}px)`;
    }
  });

  function finish() {
    if (!tracking) return;
    stub.style.transition = "transform 0.2s ease";
    if (isSwiping) {
      if (dx > 90) {
        stub.style.transform = "translateX(560px)";
        stub.style.opacity = "0";
        setTimeout(() => { Store.setWatched(link.id, true); render(); }, 160);
      } else if (dx < -90) {
        stub.style.transform = "translateX(-560px)";
        stub.style.opacity = "0";
        setTimeout(() => deleteWithUndo(link), 160);
      } else {
        stub.style.transform = "translateX(0)";
      }
    } else {
      if (tapTimer) {
        clearTimeout(tapTimer); tapTimer = null;
        Store.updateLink(link.id, { pinned: !link.pinned });
        render();
      } else {
        tapTimer = setTimeout(() => {
          tapTimer = null;
          window.open(link.url, "_blank", "noopener");
        }, 280);
      }
    }
    tracking = false; isSwiping = false;
  }

  stub.addEventListener("pointerup", finish);
  stub.addEventListener("pointercancel", () => {
    stub.style.transform = "translateX(0)";
    tracking = false; isSwiping = false;
  });
}

/* ---- Drag-to-reorder within a playlist ---- */

function setupDragReorder(container, playlistName, currentIds) {
  const rows = Array.from(container.querySelectorAll(".stub-wrap"));
  if (!rows.length) return;
  const rowHeight = rows[0].getBoundingClientRect().height + 12; // + list gap

  rows.forEach((row, idx) => {
    const handle = row.querySelector(".drag-handle");
    if (!handle) return;

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      let targetIdx = idx;
      const startY = e.clientY;
      row.classList.add("dragging");
      row.style.position = "relative";
      row.style.zIndex = "10";
      row.style.transition = "none";
      try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }

      function onMove(ev) {
        const dy = ev.clientY - startY;
        row.style.transform = `translateY(${dy}px)`;
        const newTarget = Math.max(0, Math.min(rows.length - 1, idx + Math.round(dy / rowHeight)));
        if (newTarget !== targetIdx) {
          rows.forEach((r, i) => {
            if (r === row) return;
            r.style.transition = "transform 0.15s ease";
            if (newTarget > idx && i > idx && i <= newTarget) {
              r.style.transform = `translateY(-${rowHeight}px)`;
            } else if (newTarget < idx && i >= newTarget && i < idx) {
              r.style.transform = `translateY(${rowHeight}px)`;
            } else {
              r.style.transform = "";
            }
          });
          targetIdx = newTarget;
        }
      }

      function onUp() {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        row.classList.remove("dragging");
        row.style.transform = "";
        row.style.position = "";
        row.style.zIndex = "";
        rows.forEach(r => { if (r !== row) { r.style.transform = ""; } });

        if (targetIdx !== idx) {
          const ids = currentIds.slice();
          const [moved] = ids.splice(idx, 1);
          ids.splice(targetIdx, 0, moved);
          Store.reorderWithinPlaylist(playlistName, ids);
        }
        render();
      }

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  });
}

/* ================= Undo toast ================= */

function showUndoToast(message, onUndo) {
  clearTimeout(undoTimer);
  $("#undoMsg").textContent = message;
  $("#undoToast").classList.add("show");
  $("#undoBtn").onclick = () => {
    onUndo();
    $("#undoToast").classList.remove("show");
    clearTimeout(undoTimer);
  };
  undoTimer = setTimeout(() => $("#undoToast").classList.remove("show"), 5000);
}

function deleteWithUndo(link) {
  Store.deleteLink(link.id);
  lastDeleted = { links: [link] };
  render();
  showUndoToast(`Deleted "${truncateText(link.title, 44)}"`, () => {
    if (lastDeleted) {
      lastDeleted.links.forEach(l => Store.addLink(l));
      lastDeleted = null;
      render();
    }
  });
}

/* ================= Add / edit sheet ================= */

function openSheet(link) {
  editingId = link ? link.id : null;
  pickedCategory = link ? link.category : null;
  pickedPlaylists = new Set(link ? (link.playlists || []) : []);
  pickedPinned = link ? !!link.pinned : false;

  $("#sheetTitle").textContent = link ? "Edit link" : "Add a link";
  $("#fUrl").value = link ? link.url : "";
  $("#fUrl").disabled = !!link;
  $("#fTitleField").value = link ? link.title : "";
  $("#fNote").value = link ? (link.note || "") : "";
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

$("#fabAdd").onclick = () => {
  openSheet(null);
  // Best-effort: if the clipboard already holds a YouTube link, prefill it.
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(text => {
      if ($("#fUrl").value) return; // user already typed something
      const found = YT.extractUrl(text) || text;
      if (YT.extractVideoId(found)) {
        $("#fUrl").value = found.trim();
        $("#fUrl").dispatchEvent(new Event("change"));
      }
    }).catch(() => { /* clipboard permission denied or unavailable — ignore */ });
  }
};
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
  const note = $("#fNote").value.trim();

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
      note,
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
        pinned: pickedPinned || dupe.pinned,
        note: note || dupe.note
      });
      alert("Already on your shelf — updated its category/playlists instead of adding a duplicate.");
    } else {
      Store.addLink({
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
        url: YT.canonicalUrl(videoId),
        videoId,
        title,
        note,
        channel: "",
        thumbnail: YT.thumbUrl(videoId),
        category: pickedCategory,
        playlists: Array.from(pickedPlaylists),
        watched: false,
        watchedAt: null,
        pinned: pickedPinned,
        addedAt: new Date().toISOString()
      });
    }
  }
  closeSheet();
  render();
};

$("#deleteBtn").onclick = () => {
  if (!editingId) return;
  const link = Store.getLinks().find(l => l.id === editingId);
  closeSheet();
  if (link) deleteWithUndo(link);
};

$("#search").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  render();
});

$("#sortBtn").onclick = () => {
  if ($("#sortBtn").disabled) return;
  sortMode = sortMode === "newest" ? "oldest" : sortMode === "oldest" ? "title" : "newest";
  render();
};

/* ================= Select mode + bulk actions ================= */

$("#selectModeBtn").onclick = () => {
  selectMode = !selectMode;
  selectedIds.clear();
  render();
};

function renderBulkPicker() {
  const picker = $("#bulkTagPicker");
  picker.innerHTML = "";
  const options = bulkTagMode === "category" ? Store.getCategories() : Store.getPlaylists();
  options.forEach(name => {
    const isSel = bulkTagMode === "category" ? bulkTagPicked === name : bulkTagPicked.has(name);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tag-option" + (isSel ? " selected" : "");
    b.textContent = name;
    b.onclick = () => {
      if (bulkTagMode === "category") {
        bulkTagPicked = bulkTagPicked === name ? null : name;
      } else {
        bulkTagPicked.has(name) ? bulkTagPicked.delete(name) : bulkTagPicked.add(name);
      }
      renderBulkPicker();
    };
    picker.appendChild(b);
  });
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "tag-option new-tag";
  addBtn.textContent = "+ new";
  addBtn.onclick = () => {
    const name = prompt(bulkTagMode === "category" ? "New category name:" : "New playlist name:");
    if (name && name.trim()) {
      const val = name.trim();
      if (bulkTagMode === "category") { bulkTagPicked = val; Store.addCategory(val); }
      else { bulkTagPicked.add(val); Store.addPlaylist(val); }
      renderBulkPicker();
    }
  };
  picker.appendChild(addBtn);
}

function openBulkTagSheet(mode) {
  bulkTagMode = mode;
  bulkTagPicked = mode === "category" ? null : new Set();
  $("#bulkTagTitle").textContent = mode === "category" ? "Set category" : "Add to playlist(s)";
  renderBulkPicker();
  $("#bulkTagBackdrop").classList.add("open");
}

$("#bulkCategoryBtn").onclick = () => openBulkTagSheet("category");
$("#bulkPlaylistBtn").onclick = () => openBulkTagSheet("playlist");
$("#bulkTagCancel").onclick = () => $("#bulkTagBackdrop").classList.remove("open");
$("#bulkTagBackdrop").onclick = (e) => { if (e.target === $("#bulkTagBackdrop")) $("#bulkTagBackdrop").classList.remove("open"); };

$("#bulkTagApply").onclick = () => {
  selectedIds.forEach(id => {
    if (bulkTagMode === "category") {
      Store.updateLink(id, { category: bulkTagPicked });
    } else {
      const link = Store.getLinks().find(l => l.id === id);
      if (!link) return;
      const merged = Array.from(new Set([...(link.playlists || []), ...bulkTagPicked]));
      Store.updateLink(id, { playlists: merged });
    }
  });
  $("#bulkTagBackdrop").classList.remove("open");
  selectMode = false;
  selectedIds.clear();
  render();
};

$("#bulkDeleteBtn").onclick = () => {
  const ids = Array.from(selectedIds);
  if (!ids.length) return;
  const linksToDelete = Store.getLinks().filter(l => ids.includes(l.id));
  Store.deleteLinks(ids);
  lastDeleted = { links: linksToDelete };
  selectMode = false;
  selectedIds.clear();
  render();
  showUndoToast(`Deleted ${linksToDelete.length} link${linksToDelete.length === 1 ? "" : "s"}`, () => {
    if (lastDeleted) {
      lastDeleted.links.forEach(l => Store.addLink(l));
      lastDeleted = null;
      render();
    }
  });
};

/* ================= Manage categories & playlists ================= */

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

/* ================= Stats ================= */

$("#statsBtn").onclick = () => {
  const links = Store.getLinks();
  const total = links.length;
  const watched = links.filter(l => l.watched).length;
  const weekAgo = Date.now() - 7 * 86400000;
  const savedThisWeek = links.filter(l => new Date(l.addedAt).getTime() >= weekAgo).length;
  const archived = links.filter(Store.isArchived).length;

  const catCounts = {};
  links.forEach(l => { if (l.category) catCounts[l.category] = (catCounts[l.category] || 0) + 1; });
  let topCat = "—", topCatCount = 0;
  Object.entries(catCounts).forEach(([k, v]) => { if (v > topCatCount) { topCat = k; topCatCount = v; } });

  $("#statsGrid").innerHTML = `
    <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-label">Total saved</div></div>
    <div class="stat-box"><div class="stat-num">${watched}</div><div class="stat-label">Watched</div></div>
    <div class="stat-box"><div class="stat-num">${savedThisWeek}</div><div class="stat-label">Saved this week</div></div>
    <div class="stat-box"><div class="stat-num">${archived}</div><div class="stat-label">Archived</div></div>
    <div class="stat-box" style="grid-column:1/-1;">
      <div class="stat-num" style="font-size:19px;">${escapeHtml(topCat)}</div>
      <div class="stat-label">Top category${topCatCount ? " · " + topCatCount + " saved" : ""}</div>
    </div>
  `;
  $("#statsBackdrop").classList.add("open");
};
$("#statsCloseBtn").onclick = () => $("#statsBackdrop").classList.remove("open");
$("#statsBackdrop").onclick = (e) => { if (e.target === $("#statsBackdrop")) $("#statsBackdrop").classList.remove("open"); };

/* ================= Theme ================= */

$("#themeBtn").textContent = Theme.get() === "dark" ? "☾" : "☀";
$("#themeBtn").onclick = () => {
  const next = Theme.toggle();
  $("#themeBtn").textContent = next === "dark" ? "☾" : "☀";
};

/* ================= Backup / restore ================= */

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
