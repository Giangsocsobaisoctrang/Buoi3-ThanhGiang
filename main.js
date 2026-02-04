// ========= Config =========
const API_BASE = "https://api.escuelajs.co/api/v1/products";

// ========= State =========
let allProducts = [];
let filtered = [];

let searchTerm = "";
let pageSize = 10;
let currentPage = 1;

let sortField = null; // "title" | "price"
let sortDir = "asc";  // "asc" | "desc"

let tooltipInstances = [];

// Detail modal state
let currentDetail = null;
let editMode = false;

// ========= Helpers =========
function escapeCsv(value) {
  const s = String(value ?? "");
  const needs = /[",\n]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needs ? `"${escaped}"` : escaped;
}

function showAlert(el, type, message) {
  el.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
}

function clearAlert(el) {
  el.innerHTML = "";
}

function parseImagesInput(text) {
  return (text || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function compare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function normalizeTitle(s) {
  return String(s || "").toLowerCase().trim();
}

// ========= Data =========
async function fetchProducts() {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error("Không fetch được products: " + res.status);
  const data = await res.json();
  allProducts = Array.isArray(data) ? data : [];
  applyFilterSortPaginate();
}

function applyFilterSortPaginate() {
  // Filter by title (client-side)
  const term = normalizeTitle(searchTerm);
  filtered = allProducts.filter(p => normalizeTitle(p.title).includes(term));

  // Sort
  if (sortField) {
    filtered.sort((p1, p2) => {
      let v1, v2;
      if (sortField === "title") {
        v1 = normalizeTitle(p1.title);
        v2 = normalizeTitle(p2.title);
      } else if (sortField === "price") {
        v1 = Number(p1.price ?? 0);
        v2 = Number(p2.price ?? 0);
      }
      const base = compare(v1, v2);
      return sortDir === "asc" ? base : -base;
    });
  }

  // Clamp current page
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);

  render();
}

function getCurrentViewItems() {
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  return filtered.slice(start, end);
}

// ========= Render =========
function disposeTooltips() {
  tooltipInstances.forEach(t => t?.dispose?.());
  tooltipInstances = [];
}

function initTooltips() {
  const els = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipInstances = [...els].map(el => new bootstrap.Tooltip(el, {
    placement: "top",
    trigger: "hover",
    container: "body"
  }));
}

function render() {
  disposeTooltips();

  const tbody = document.getElementById("tbody");
  const countBadge = document.getElementById("countBadge");
  const pageInfo = document.getElementById("pageInfo");

  countBadge.textContent = `${filtered.length} items`;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;

  const items = getCurrentViewItems();

  tbody.innerHTML = items.map(p => {
    const categoryName = p.category?.name ?? "";
    const images = Array.isArray(p.images) ? p.images : [];

    const thumbs = images.slice(0, 4).map(url => `
      <img class="thumb me-1" src="${url}" alt="img" onerror="this.style.display='none'">
    `).join("");

    // Tooltip shows description
    const desc = (p.description ?? "").replaceAll('"', "&quot;");

    return `
      <tr data-id="${p.id}" data-bs-toggle="tooltip" data-bs-title="${desc}">
        <td class="mono">${p.id}</td>
        <td class="ellipsis">${p.title ?? ""}</td>
        <td class="mono">$${Number(p.price ?? 0).toFixed(2)}</td>
        <td>${categoryName}</td>
        <td>${thumbs || `<span class="text-muted">No image</span>`}</td>
      </tr>
    `;
  }).join("");

  // Row click -> open detail modal
  tbody.querySelectorAll("tr").forEach(tr => {
    tr.addEventListener("click", async () => {
      const id = tr.getAttribute("data-id");
      if (!id) return;
      await openDetailModal(Number(id));
    });
  });

  renderPagination();
  initTooltips();
}

function renderPagination() {
  const pagination = document.getElementById("pagination");
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const mkItem = (label, page, disabled = false, active = false) => `
    <li class="page-item ${disabled ? "disabled" : ""} ${active ? "active" : ""}">
      <button class="page-link" data-page="${page}" ${disabled ? "disabled" : ""}>
        ${label}
      </button>
    </li>
  `;

  const maxButtons = 7;
  let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let end = Math.min(totalPages, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);

  let html = "";
  html += mkItem("«", 1, currentPage === 1);
  html += mkItem("‹", currentPage - 1, currentPage === 1);

  for (let p = start; p <= end; p++) {
    html += mkItem(p, p, false, p === currentPage);
  }

  html += mkItem("›", currentPage + 1, currentPage === totalPages);
  html += mkItem("»", totalPages, currentPage === totalPages);

  pagination.innerHTML = html;

  pagination.querySelectorAll("button[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = Number(btn.getAttribute("data-page"));
      if (!Number.isFinite(p)) return;
      currentPage = p;
      applyFilterSortPaginate();
    });
  });
}

// ========= CSV Export =========
function exportCurrentViewToCsv() {
  const items = getCurrentViewItems();
  const headers = ["id", "title", "price", "category", "images"];
  const rows = items.map(p => {
    const category = p.category?.name ?? "";
    const images = Array.isArray(p.images) ? p.images.join(" | ") : "";
    return [
      p.id,
      p.title ?? "",
      p.price ?? "",
      category,
      images
    ].map(escapeCsv).join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `products_page${currentPage}_size${pageSize}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ========= Detail / Edit =========
const detailModalEl = document.getElementById("detailModal");
const detailModal = new bootstrap.Modal(detailModalEl);

function setEditMode(isEdit) {
  editMode = isEdit;
  document.getElementById("d_title").disabled = !isEdit;
  document.getElementById("d_price").disabled = !isEdit;
  document.getElementById("d_categoryId").disabled = !isEdit;
  document.getElementById("d_images").disabled = !isEdit;
  document.getElementById("d_description").disabled = !isEdit;
  document.getElementById("btnSaveEdit").disabled = !isEdit;
  document.getElementById("btnEditToggle").textContent = isEdit ? "Hủy Edit" : "Edit";
}

async function openDetailModal(id) {
  const alertBox = document.getElementById("detailAlert");
  clearAlert(alertBox);
  setEditMode(false);

  const res = await fetch(`${API_BASE}/${id}`);
  if (!res.ok) {
    showAlert(alertBox, "danger", `Không lấy được detail (id=${id}). HTTP ${res.status}`);
    detailModal.show();
    return;
  }

  currentDetail = await res.json();

  document.getElementById("d_id").value = currentDetail.id ?? "";
  document.getElementById("d_title").value = currentDetail.title ?? "";
  document.getElementById("d_price").value = currentDetail.price ?? "";
  document.getElementById("d_categoryId").value = currentDetail.category?.id ?? "";
  document.getElementById("d_description").value = currentDetail.description ?? "";
  document.getElementById("d_images").value = (currentDetail.images || []).join(", ");

  const preview = document.getElementById("d_preview");
  const imgs = Array.isArray(currentDetail.images) ? currentDetail.images : [];
  preview.innerHTML = imgs.map(u => `
    <img class="thumb" src="${u}" alt="img" onerror="this.style.display='none'">
  `).join("");

  detailModal.show();
}

async function saveEdit() {
  if (!currentDetail?.id) return;

  const alertBox = document.getElementById("detailAlert");
  clearAlert(alertBox);

  const payload = {
    title: document.getElementById("d_title").value.trim(),
    price: Number(document.getElementById("d_price").value),
    description: document.getElementById("d_description").value.trim(),
    categoryId: Number(document.getElementById("d_categoryId").value),
    images: parseImagesInput(document.getElementById("d_images").value)
  };

  const res = await fetch(`${API_BASE}/${currentDetail.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    showAlert(alertBox, "danger", `Update thất bại. HTTP ${res.status}<br><small class="text-muted">${t}</small>`);
    return;
  }

  showAlert(alertBox, "success", "Update thành công! (Đang reload dữ liệu...)");
  setEditMode(false);

  await fetchProducts();
  await openDetailModal(currentDetail.id);
}

// ========= Create =========
const createModalEl = document.getElementById("createModal");
const createModal = new bootstrap.Modal(createModalEl);

function resetCreateForm() {
  document.getElementById("c_title").value = "";
  document.getElementById("c_price").value = "";
  document.getElementById("c_categoryId").value = "";
  document.getElementById("c_images").value = "";
  document.getElementById("c_description").value = "";
  clearAlert(document.getElementById("createAlert"));
}

async function createItem() {
  const alertBox = document.getElementById("createAlert");
  clearAlert(alertBox);

  const payload = {
    title: document.getElementById("c_title").value.trim(),
    price: Number(document.getElementById("c_price").value),
    description: document.getElementById("c_description").value.trim(),
    categoryId: Number(document.getElementById("c_categoryId").value),
    images: parseImagesInput(document.getElementById("c_images").value)
  };

  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    showAlert(alertBox, "danger", `Tạo thất bại. HTTP ${res.status}<br><small class="text-muted">${t}</small>`);
    return;
  }

  showAlert(alertBox, "success", "Tạo thành công! (Đang reload dữ liệu...)");
  await fetchProducts();

  setTimeout(() => createModal.hide(), 400);
}

// ========= Events =========
document.getElementById("searchInput").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  currentPage = 1;
  applyFilterSortPaginate();
});

document.getElementById("pageSizeSelect").addEventListener("change", (e) => {
  pageSize = Number(e.target.value) || 10;
  currentPage = 1;
  applyFilterSortPaginate();
});

document.getElementById("sortTitleBtn").addEventListener("click", () => {
  if (sortField === "title") {
    sortDir = (sortDir === "asc") ? "desc" : "asc";
  } else {
    sortField = "title";
    sortDir = "asc";
  }
  applyFilterSortPaginate();
});

document.getElementById("sortPriceBtn").addEventListener("click", () => {
  if (sortField === "price") {
    sortDir = (sortDir === "asc") ? "desc" : "asc";
  } else {
    sortField = "price";
    sortDir = "asc";
  }
  applyFilterSortPaginate();
});

document.getElementById("btnExportCsv").addEventListener("click", exportCurrentViewToCsv);

document.getElementById("btnOpenCreate").addEventListener("click", () => {
  resetCreateForm();
  createModal.show();
});

document.getElementById("btnCreate").addEventListener("click", createItem);

document.getElementById("btnEditToggle").addEventListener("click", () => {
  setEditMode(!editMode);
});

document.getElementById("btnSaveEdit").addEventListener("click", saveEdit);

// ========= Init =========
(async function init() {
  try {
    await fetchProducts();
  } catch (err) {
    console.error(err);
    alert("Lỗi load dữ liệu. Mở Console để xem chi tiết.");
  }
})();
