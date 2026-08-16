/* Stacks — core.js
   Shared storage model + YouTube helpers + shared render bits. */

const DB_LINKS = "stacks:links";
const DB_CATEGORIES = "stacks:categories";
const DB_PLAYLISTS = "stacks:playlists";

const Store = {
  getLinks() {
    try { return JSON.parse(localStorage.getItem(DB_LINKS)) || []; }
    catch { return []; }
  },
  saveLinks(links) {
    localStorage.setItem(DB_LINKS, JSON.stringify(links));
  },
  addLink(link) {
    const links = Store.getLinks();
    links.unshift(link);
    Store.saveLinks(links);
    if (link.category) Store.addCategory(link.category);
    (link.playlists || []).forEach(Store.addPlaylist);
    return link;
  },
  updateLink(id, patch) {
    const links = Store.getLinks();
    const i = links.findIndex(l => l.id === id);
    if (i === -1) return null;
    links[i] = { ...links[i], ...patch };
    Store.saveLinks(links);
    if (patch.category) Store.addCategory(patch.category);
    (patch.playlists || []).forEach(Store.addPlaylist);
    return links[i];
  },
  deleteLink(id) {
    Store.saveLinks(Store.getLinks().filter(l => l.id !== id));
  },
  getCategories() {
    try { return JSON.parse(localStorage.getItem(DB_CATEGORIES)) || []; }
    catch { return []; }
  },
  addCategory(name) {
    if (!name) return;
    const list = Store.getCategories();
    if (!list.includes(name)) {
      list.push(name);
      localStorage.setItem(DB_CATEGORIES, JSON.stringify(list));
    }
  },
  getPlaylists() {
    try { return JSON.parse(localStorage.getItem(DB_PLAYLISTS)) || []; }
    catch { return []; }
  },
  addPlaylist(name) {
    if (!name) return;
    const list = Store.getPlaylists();
    if (!list.includes(name)) {
      list.push(name);
      localStorage.setItem(DB_PLAYLISTS, JSON.stringify(list));
    }
  }
};

const YT = {
  // Pull a YouTube URL out of arbitrary shared text (YouTube app share intents
  // often send a sentence plus the link, or a youtu.be short link).
  extractUrl(text) {
    if (!text) return null;
    const match = text.match(/https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\/[^\s]+/i);
    return match ? match[0] : null;
  },
  extractVideoId(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        return u.pathname.slice(1).split("/")[0] || null;
      }
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
      if (u.pathname.startsWith("/live/")) return u.pathname.split("/")[2] || null;
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      return null;
    } catch {
      return null;
    }
  },
  canonicalUrl(videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  },
  thumbUrl(videoId) {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  },
  async fetchMeta(url) {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error("oEmbed failed");
    const data = await res.json();
    return { title: data.title, channel: data.author_name, thumbnail: data.thumbnail_url };
  }
};

function timeAgo(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 86400 * 30) return Math.floor(diff / 86400) + "d ago";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
