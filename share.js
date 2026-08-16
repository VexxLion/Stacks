/* Stacks — share.js (handles the incoming Android share intent) */

const $ = sel => document.querySelector(sel);

let pickedCategory = null;
let pickedPlaylists = new Set();
let currentVideoId = null;
let currentUrl = null;

function renderCategoryPicker() {
  const container = $("#catPicker");
  container.innerHTML = "";
  Store.getCategories().forEach(name => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tag-option" + (pickedCategory === name ? " selected" : "");
    b.textContent = name;
    b.onclick = () => { pickedCategory = pickedCategory === name ? null : name; renderCategoryPicker(); };
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

async function init() {
  const params = new URLSearchParams(window.location.search);
  const sharedText = params.get("text") || "";
  const sharedUrl = params.get("url") || "";
  const sharedTitle = params.get("title") || "";

  const found = YT.extractUrl(sharedUrl) || YT.extractUrl(sharedText) || YT.extractUrl(sharedTitle);
  const videoId = YT.extractVideoId(found || sharedUrl);

  $("#loadingRow").style.display = "none";

  if (!videoId) {
    $("#badLink").style.display = "block";
    return;
  }

  currentVideoId = videoId;
  currentUrl = YT.canonicalUrl(videoId);

  $("#formArea").style.display = "block";
  $("#pvThumb").src = YT.thumbUrl(videoId);
  $("#pvTitle").textContent = sharedTitle || "Fetching title…";
  $("#fTitleField").value = sharedTitle || "";
  renderCategoryPicker();
  renderMultiPicker();

  try {
    const meta = await YT.fetchMeta(currentUrl);
    $("#pvTitle").textContent = meta.title;
    $("#pvChannel").textContent = meta.channel || "";
    $("#fTitleField").value = meta.title;
    if (meta.thumbnail) $("#pvThumb").src = meta.thumbnail;
  } catch {
    $("#pvTitle").textContent = sharedTitle || "(couldn't fetch title — edit below)";
  }
}

$("#saveBtn") && ($("#saveBtn").onclick = () => {
  const title = $("#fTitleField").value.trim() || "Untitled video";
  const dupe = Store.findByVideoId(currentVideoId);
  if (dupe) {
    const mergedPlaylists = Array.from(new Set([...(dupe.playlists || []), ...pickedPlaylists]));
    Store.updateLink(dupe.id, {
      category: pickedCategory || dupe.category,
      playlists: mergedPlaylists
    });
  } else {
    Store.addLink({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      url: currentUrl,
      videoId: currentVideoId,
      title,
      channel: $("#pvChannel").textContent || "",
      thumbnail: YT.thumbUrl(currentVideoId),
      category: pickedCategory,
      playlists: Array.from(pickedPlaylists),
      watched: false,
      addedAt: new Date().toISOString()
    });
  }
  window.location.href = "index.html";
});

init();
