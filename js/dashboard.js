let chart = null;
let chartTopProduk = null;
let chartTopOutlet = null;
let chartOutletStatus = null;
let currentMenu = "penjualan";
let selectedSalesOutlet = "";

const state = {
  produkOptions: [],
  auditOutlets: [],
  outletTransactions: {
    outlets: [],
    detail: [],
    selected_outlet: ""
  },
  persediaan: [],
  forecast: [],
  audit: {
    db_ready: false,
    summary: {},
    outlet_summary: [],
    movements: [],
    flags: [],
    notes: []
  },
  opname: []
};

const pageMeta = {
  penjualan: {
    eyebrow: "Sales Monitor",
    title: "Dashboard Penjualan",
    caption: "Monitoring penjualan warehouse per periode, outlet, dan produk aktif."
  },
  audit: {
    eyebrow: "Outlet Stock Assurance",
    title: "Audit Stok Outlet",
    caption: "Pantau stok masuk outlet, penjualan outlet, penyesuaian, dan flag audit dalam satu periode."
  },
  persediaan: {
    eyebrow: "Inventory Health",
    title: "Persediaan Warehouse",
    caption: "Rolling stock dihitung mengikuti cutoff bulan database agar mutasi masuk dan keluar tetap konsisten."
  },
  forecast: {
    eyebrow: "Demand Planning",
    title: "Forecast Penjualan",
    caption: "Forecast memakai EMA 3 bulan + buffer 10% dan dibulatkan ke atas agar stok tidak seret."
  },
  opname: {
    eyebrow: "Stock Control",
    title: "Stok Opname Gudang",
    caption: "Stok opname mengikuti periode yang sama dengan persediaan agar selisih rolling lebih akurat."
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  initTahun("tahun");
  initTahun("opnameTahun");
  setInitialPeriod();
  bindGlobalFilters();
  selectInput(null, "penjualan");
  selectImport(null, "penjualan");
  selectPersediaanInput(null, "pembelian");
  selectPersediaanImport(null, "pembelian");
  await loadProdukOptions();
  await loadAuditOutletOptions();
  selectMenu(null, "penjualan");
});

function bindGlobalFilters() {
  document.getElementById("bulan")?.addEventListener("change", applyCurrentFilters);
  document.getElementById("tahun")?.addEventListener("change", applyCurrentFilters);
  document.getElementById("filterProduk")?.addEventListener("change", applyCurrentFilters);
  document.getElementById("filterProduk")?.addEventListener("input", debounce(applyCurrentFilters, 200));
  document.getElementById("opnameBulan")?.addEventListener("change", syncOpnamePeriodFromLocal);
  document.getElementById("opnameTahun")?.addEventListener("change", syncOpnamePeriodFromLocal);
}

function debounce(fn, delay = 200) {
  let timeout = null;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), delay);
  };
}

function initTahun(id) {
  const select = document.getElementById(id);
  if (!select) return;

  const now = new Date().getFullYear();
  select.innerHTML = "";
  for (let year = now + 1; year >= now - 5; year -= 1) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    select.appendChild(option);
  }
}

function setInitialPeriod() {
  const now = new Date();
  const bulan = String(now.getMonth() + 1);
  const tahun = String(now.getFullYear());
  setValue("bulan", bulan);
  setValue("tahun", tahun);
  setValue("opnameBulan", bulan);
  setValue("opnameTahun", tahun);
  updateFilterStatus();
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function getBulan() {
  return document.getElementById("bulan")?.value || String(new Date().getMonth() + 1);
}

function getTahun() {
  return document.getElementById("tahun")?.value || String(new Date().getFullYear());
}

function getProdukFilter() {
  return (document.getElementById("filterProduk")?.value || "").trim();
}

function getAuditOutletFilter() {
  return (document.getElementById("auditOutletFilter")?.value || "").trim();
}

function getSelectedSku() {
  const raw = getProdukFilter();
  if (!raw) return "";

  const exact = state.produkOptions.find(item => {
    const label = `${item.sku} - ${item.nama_produk}`;
    return label.toLowerCase() === raw.toLowerCase() || item.sku.toLowerCase() === raw.toLowerCase();
  });

  if (exact) return exact.sku;
  return "";
}

function getBulanLabel(bulan = getBulan()) {
  const names = [
    "",
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember"
  ];
  return names[Number(bulan)] || "-";
}

function updateFilterStatus() {
  const produk = getSelectedSku();
  const outlet = currentMenu === "audit" ? getAuditOutletFilter() : "";
  const text = `Periode aktif: ${getBulanLabel()} ${getTahun()}${produk ? ` | Produk: ${produk}` : " | Produk: Semua"}${outlet ? ` | Outlet: ${outlet}` : ""}`;
  setText("filterStatus", text);
}

function updatePageHeader(menu) {
  const meta = pageMeta[menu] || pageMeta.penjualan;
  setText("pageEyebrow", meta.eyebrow);
  setText("pageTitle", meta.title);
  setText("pageCaption", meta.caption);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? 0;
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString("id-ID");
}

function formatRupiah(value) {
  return `Rp ${Number(value ?? 0).toLocaleString("id-ID")}`;
}

function formatDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("id-ID");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || "Response bukan JSON yang valid" };
  }

  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return data;
}

function toArray(data) {
  return Array.isArray(data) ? data : [];
}

function toObject(data) {
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function showLoader() {
  const loader = document.getElementById("loader");
  if (loader) loader.style.display = "flex";
}

function hideLoader() {
  const loader = document.getElementById("loader");
  if (loader) loader.style.display = "none";
}

function showToast(message, success = true) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.style.background = success ? "#257a56" : "#b14141";
  toast.style.display = "block";
  window.setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target?.result || "");
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function syncOpnamePeriodFromLocal() {
  if (currentMenu !== "opname") return;
  setValue("bulan", document.getElementById("opnameBulan")?.value || getBulan());
  setValue("tahun", document.getElementById("opnameTahun")?.value || getTahun());
  applyCurrentFilters();
}

function syncOpnamePeriodToLocal() {
  setValue("opnameBulan", getBulan());
  setValue("opnameTahun", getTahun());
}

function clearProdukFilter() {
  setValue("filterProduk", "");
  applyCurrentFilters();
}

async function loadProdukOptions() {
  try {
    state.produkOptions = toArray(await fetchJson("/api/produk-list"));
    const list = document.getElementById("produkList");
    if (!list) return;
    list.innerHTML = state.produkOptions
      .map(item => `<option value="${escapeHtml(item.sku)} - ${escapeHtml(item.nama_produk)}"></option>`)
      .join("");
  } catch (error) {
    console.error("Produk list error:", error);
  }
}

async function loadAuditOutletOptions() {
  try {
    state.auditOutlets = toArray(await fetchJson("/api/outlet-list"));
    const select = document.getElementById("auditOutletFilter");
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = `<option value="">Semua Outlet</option>${state.auditOutlets
      .map(item => `<option value="${escapeHtml(item.nama_outlet)}">${escapeHtml(item.nama_outlet)}</option>`)
      .join("")}`;
    select.value = currentValue;
  } catch (error) {
    console.error("Audit outlet list error:", error);
  }
}

function getQueryParams(includeProduct = true) {
  const qs = new URLSearchParams({
    bulan: getBulan(),
    tahun: getTahun()
  });

  const sku = getSelectedSku();
  if (includeProduct && sku) qs.set("sku", sku);
  return qs;
}

function showTab(event, id) {
  document.querySelectorAll("#kpiTab, #chartTab, #outletTransactionTab, #inputTab, #importTab")
    .forEach(tab => { tab.style.display = "none"; });

  document.querySelectorAll("#salesTabMenu button")
    .forEach(button => button.classList.remove("active-tab"));

  const target = document.getElementById(id);
  if (target) target.style.display = "block";
  if (event) event.target.classList.add("active-tab");

  if (id === "chartTab") loadChart();
  if (id === "outletTransactionTab") loadOutletTransactionMonitor();
}

function showModuleTab(event, module, id) {
  document.querySelectorAll(`#${module}Tab .module-content`)
    .forEach(el => { el.style.display = "none"; });

  document.querySelectorAll(`#${module}Menu button`)
    .forEach(button => button.classList.remove("active-tab"));

  const target = document.getElementById(id);
  if (target) target.style.display = "block";
  if (event) event.target.classList.add("active-tab");
}

function showOpnameTab(event, id) {
  document.querySelectorAll(".opname-content")
    .forEach(el => { el.style.display = "none"; });

  document.querySelectorAll(".tab-menu-opname button")
    .forEach(button => button.classList.remove("active-tab"));

  const target = document.getElementById(id);
  if (target) target.style.display = "block";
  if (event) event.target.classList.add("active-tab");

  if (id === "opnameHistory") loadHistory();
}

function selectMenu(event, menu) {
  currentMenu = menu;
  updatePageHeader(menu);
  updateFilterStatus();

  document.querySelectorAll(".sidebar li")
    .forEach(item => item.classList.remove("active"));

  const activeItem = event?.currentTarget
    || [...document.querySelectorAll(".sidebar li")].find(item => item.getAttribute("onclick")?.includes(`'${menu}'`));
  activeItem?.classList.add("active");

  document.querySelectorAll(".tab-content")
    .forEach(tab => { tab.style.display = "none"; });

  document.getElementById("salesTabMenu").style.display = menu === "penjualan" ? "flex" : "none";
  document.querySelectorAll("#salesTabMenu button")
    .forEach(button => button.classList.remove("active-tab"));

  if (menu === "penjualan") {
    document.getElementById("kpiTab").style.display = "block";
    document.querySelector("#salesTabMenu button")?.classList.add("active-tab");
    loadData();
    return;
  }

  if (menu === "persediaan") {
    document.getElementById("persediaanTab").style.display = "block";
    showModuleTab(null, "persediaan", "persediaanOverview");
    document.querySelector("#persediaanMenu button")?.classList.add("active-tab");
    loadPersediaan();
    return;
  }

  if (menu === "audit") {
    document.getElementById("auditTab").style.display = "block";
    showModuleTab(null, "audit", "auditOverview");
    document.querySelector("#auditMenu button")?.classList.add("active-tab");
    loadAudit();
    return;
  }

  if (menu === "forecast") {
    document.getElementById("forecastTab").style.display = "block";
    showModuleTab(null, "forecast", "forecastOverview");
    document.querySelector("#forecastMenu button")?.classList.add("active-tab");
    loadForecast();
    return;
  }

  if (menu === "opname") {
    document.getElementById("opnameTab").style.display = "block";
    showOpnameTab(null, "opnameKPI");
    document.querySelector(".tab-menu-opname button")?.classList.add("active-tab");
    syncOpnamePeriodToLocal();
    loadStokSistem();
  }
}

async function applyCurrentFilters() {
  updateFilterStatus();

  if (currentMenu === "penjualan") {
    await loadData();
    return;
  }

  if (currentMenu === "persediaan") {
    await loadPersediaan();
    return;
  }

  if (currentMenu === "audit") {
    await loadAudit();
    return;
  }

  if (currentMenu === "forecast") {
    await loadForecast();
    return;
  }

  if (currentMenu === "opname") {
    syncOpnamePeriodToLocal();
    await loadStokSistem();
  }
}

async function loadData() {
  showLoader();
  try {
    await Promise.all([
      loadKPI(),
      loadChart(),
      loadTopProduk(),
      loadTopOutlet(),
      loadOutletStatus(),
      loadOutletTransactionMonitor(false)
    ]);
  } catch (error) {
    console.error("Load data error:", error);
    showToast(error.message || "Gagal memuat dashboard penjualan", false);
  } finally {
    hideLoader();
  }
}

async function loadOutletTransactionMonitor(showSpinner = true) {
  if (showSpinner) showLoader();

  try {
    const qs = getQueryParams();
    const status = document.getElementById("outletTransactionStatus")?.value || "";
    if (status) qs.set("status", status);
    if (selectedSalesOutlet) qs.set("outlet", selectedSalesOutlet);

    state.outletTransactions = toObject(await fetchJson(`/api/outlet-transaksi?${qs.toString()}`));
    const outlets = toArray(state.outletTransactions.outlets);
    const detail = toArray(state.outletTransactions.detail);
    const selectedOutlet = state.outletTransactions.selected_outlet || selectedSalesOutlet || "";
    selectedSalesOutlet = selectedOutlet;

    const doneCount = outlets.filter(item => item.status_transaksi === "sudah").length;
    const pendingCount = outlets.filter(item => item.status_transaksi === "belum").length;
    const selectedRow = outlets.find(item => item.nama_outlet === selectedOutlet);
    const selectedStock = detail.reduce((sum, item) => sum + Number(item.stok_akhir || 0), 0);

    setText("sales_outlet_done", formatNumber(doneCount));
    setText("sales_outlet_pending", formatNumber(pendingCount));
    setText("sales_outlet_selected", selectedOutlet || "-");
    setText("sales_outlet_stock", formatNumber(selectedStock));

    renderOutletTransactionTable(outlets, selectedOutlet);
    renderOutletTransactionDetail(detail, selectedRow);
  } catch (error) {
    console.error("Outlet transaction monitor error:", error);
    showToast(error.message || "Gagal memuat transaksi outlet", false);
  } finally {
    if (showSpinner) hideLoader();
  }
}

function renderOutletTransactionTable(outlets, selectedOutlet) {
  const body = document.getElementById("outletTransactionBody");
  if (!body) return;
  body.innerHTML = "";

  if (!outlets.length) {
    body.innerHTML = `<tr><td colspan="5">Tidak ada data outlet untuk periode ini.</td></tr>`;
    return;
  }

  outlets.forEach(item => {
    const statusClass = item.status_transaksi === "sudah" ? "status-safe" : "status-out";
    const isActive = item.nama_outlet === selectedOutlet ? "row-selected" : "";
    body.innerHTML += `
      <tr class="${isActive}" onclick="selectSalesOutlet('${escapeHtml(item.nama_outlet)}')">
        <td>${escapeHtml(item.nama_outlet)}</td>
        <td><span class="status-badge ${statusClass}">${item.status_transaksi === "sudah" ? "Sudah" : "Belum"}</span></td>
        <td>${formatNumber(item.qty_transaksi)}</td>
        <td>${formatNumber(item.stok_akhir)}</td>
        <td>${escapeHtml(item.catatan || "-")}</td>
      </tr>
    `;
  });
}

function renderOutletTransactionDetail(detail, selectedRow) {
  const title = document.getElementById("outletDetailTitle");
  const summary = document.getElementById("outletDetailSummary");
  const body = document.getElementById("outletTransactionDetailBody");
  if (!title || !summary || !body) return;

  if (!selectedRow) {
    title.textContent = "Pilih outlet";
    summary.innerHTML = `
      <h4>Belum ada outlet dipilih</h4>
      <p>Klik salah satu outlet untuk melihat detail stok dan alasan kenapa outlet tersebut sudah atau belum transaksi pada periode ini.</p>
    `;
    body.innerHTML = `<tr><td colspan="8">Belum ada detail outlet dipilih.</td></tr>`;
    return;
  }

  title.textContent = selectedRow.nama_outlet;
  summary.innerHTML = `
    <h4>Status ${selectedRow.status_transaksi === "sudah" ? "Sudah Transaksi" : "Belum Transaksi"}</h4>
    <p>${escapeHtml(selectedRow.catatan || "-")}</p>
  `;

  body.innerHTML = "";
  if (!detail.length) {
    body.innerHTML = `<tr><td colspan="8">Belum ada detail stok outlet pada periode ini.</td></tr>`;
    return;
  }

  detail.forEach(item => {
    const stock = Number(item.stok_akhir || 0);
    const stockClass = stock <= 0 ? "status-out" : stock <= 10 ? "status-low" : "status-safe";
    const stockLabel = stock <= 0 ? "Habis" : stock <= 10 ? "Menipis" : "Masih Ada";
    body.innerHTML += `
      <tr>
        <td>${escapeHtml(item.sku)}</td>
        <td>${escapeHtml(item.nama_produk)}</td>
        <td>${formatNumber(item.opening_stok)}</td>
        <td>${formatNumber(item.stok_masuk)}</td>
        <td>${formatNumber(item.stok_keluar)}</td>
        <td>${formatNumber(item.penyesuaian)}</td>
        <td>${formatNumber(stock)}</td>
        <td><span class="status-badge ${stockClass}">${stockLabel}</span></td>
      </tr>
    `;
  });
}

function selectSalesOutlet(outletName) {
  selectedSalesOutlet = outletName;
  loadOutletTransactionMonitor();
}

async function loadKPI() {
  const data = toObject(await fetchJson(`/api/kpi?${getQueryParams().toString()}`));

  setText("kpi_qty", formatNumber(data.total_qty));
  setText("kpi_produk", formatNumber(data.produk_terjual));
  setText("kpi_produk_belum", formatNumber(data.produk_belum));
  setText("kpi_outlet", formatNumber(data.outlet_transaksi));
  setText("kpi_outlet_belum", formatNumber(data.outlet_tidak));
  setText("kpi_nilai", formatRupiah(data.total_nilai));
  setText("kpi_modal", formatRupiah(data.total_modal));

  const profitEl = document.getElementById("kpi_profit");
  if (profitEl) {
    const profit = Number(data.profit || 0);
    profitEl.textContent = `${profit >= 0 ? "▲" : "▼"} ${formatRupiah(Math.abs(profit))}`;
    profitEl.style.color = profit >= 0 ? "#257a56" : "#b14141";
  }
}

async function loadChart() {
  const data = toArray(await fetchJson(`/api/chart?${new URLSearchParams({
    tahun: getTahun(),
    ...(getSelectedSku() ? { sku: getSelectedSku() } : {})
  }).toString()}`));

  const labels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const values = new Array(12).fill(0);
  data.forEach(item => {
    values[Number(item.bulan) - 1] = Number(item.total || 0);
  });

  const ctx = document.getElementById("chart");
  if (!ctx) return;
  if (chart instanceof Chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Penjualan Bulanan",
        data: values,
        borderColor: "#b85c38",
        backgroundColor: "rgba(184, 92, 56, 0.12)",
        tension: 0.35,
        borderWidth: 3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: "#b85c38"
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      }
    }
  });
}

async function loadTopProduk() {
  const data = toArray(await fetchJson(`/api/top-produk?${getQueryParams().toString()}`));
  const ctx = document.getElementById("chartTopProduk");
  if (!ctx) return;
  if (chartTopProduk instanceof Chart) chartTopProduk.destroy();

  chartTopProduk = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map(item => item.nama_produk),
      datasets: [{
        label: "Qty",
        data: data.map(item => Number(item.total || 0)),
        backgroundColor: "#d8a25e"
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

async function loadTopOutlet() {
  const data = toArray(await fetchJson(`/api/top-outlet?${getQueryParams().toString()}`));
  const ctx = document.getElementById("chartTopOutlet");
  if (!ctx) return;
  if (chartTopOutlet instanceof Chart) chartTopOutlet.destroy();

  chartTopOutlet = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map(item => item.nama_outlet),
      datasets: [{
        label: "Qty",
        data: data.map(item => Number(item.total || 0)),
        backgroundColor: "#257a56"
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false } }
    }
  });
}

async function loadOutletStatus() {
  const data = toObject(await fetchJson(`/api/outlet-status?${getQueryParams().toString()}`));
  const ctx = document.getElementById("chartOutletStatus");
  if (!ctx) return;
  if (chartOutletStatus instanceof Chart) chartOutletStatus.destroy();

  chartOutletStatus = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Transaksi", "Tidak Transaksi"],
      datasets: [{
        data: [Number(data.transaksi || 0), Number(data.tidak || 0)],
        backgroundColor: ["#257a56", "#b14141"]
      }]
    },
    options: {
      responsive: true
    }
  });
}

function buildForm(type, prefix) {
  const field = id => `${prefix}_${id}`;
  const forms = {
    penjualan: `
      <h3>Input Penjualan Warehouse</h3>
      <div class="form-grid">
        <input type="date" id="${field("tgl")}" />
        <input type="text" id="${field("outlet")}" placeholder="Outlet" />
        <input type="text" id="${field("sku")}" list="produkList" placeholder="SKU / Produk" />
        <input type="number" id="${field("qty")}" placeholder="Qty" />
      </div>
    `,
    pembelian: `
      <h3>Input Pembelian</h3>
      <div class="form-grid">
        <input type="date" id="${field("tgl")}" />
        <input type="text" id="${field("sku")}" list="produkList" placeholder="SKU / Produk" />
        <input type="number" id="${field("qty")}" placeholder="Qty" />
      </div>
    `,
    stok_awal: `
      <h3>Input Stok Awal</h3>
      <div class="form-grid">
        <input type="text" id="${field("sku")}" list="produkList" placeholder="SKU / Produk" />
        <input type="number" id="${field("qty")}" placeholder="Qty Awal" />
      </div>
    `,
    outlet: `
      <h3>Input Outlet</h3>
      <div class="form-grid">
        <input type="text" id="${field("outlet")}" placeholder="Nama Outlet" />
      </div>
    `
  };

  return forms[type] || "";
}

function selectInput(event, type) {
  if (event) {
    document.querySelectorAll("#inputTab .mini-sidebar div")
      .forEach(item => item.classList.remove("active-mini"));
    event.target.classList.add("active-mini");
  }

  document.getElementById("inputContent").innerHTML = `
    ${buildForm(type, "sales")}
    <div class="top-space">
      <button class="btn-primary" onclick="previewInput('${type}', 'preview', 'sales')">Preview</button>
    </div>
    <div id="preview"></div>
  `;
}

function selectPersediaanInput(event, type) {
  if (event) {
    document.querySelectorAll("#persediaanInputMenu div")
      .forEach(item => item.classList.remove("active-mini"));
    event.target.classList.add("active-mini");
  }

  document.getElementById("persediaanInputContent").innerHTML = `
    ${buildForm(type, "inventory")}
    <div class="top-space">
      <button class="btn-primary" onclick="previewInput('${type}', 'persediaanPreview', 'inventory')">Preview</button>
    </div>
    <div id="persediaanPreview"></div>
  `;
}

function previewInput(type, previewId, prefix) {
  const val = id => document.getElementById(`${prefix}_${id}`)?.value || "-";
  const details = [];

  if (type === "penjualan") details.push(`Tanggal: ${val("tgl")}`, `Outlet: ${val("outlet")}`, `SKU: ${val("sku")}`, `Qty: ${val("qty")}`);
  if (type === "pembelian") details.push(`Tanggal: ${val("tgl")}`, `SKU: ${val("sku")}`, `Qty: ${val("qty")}`);
  if (type === "stok_awal") details.push(`SKU: ${val("sku")}`, `Qty Awal: ${val("qty")}`);
  if (type === "outlet") details.push(`Nama Outlet: ${val("outlet")}`);

  document.getElementById(previewId).innerHTML = `
    <div class="preview-box">
      <strong>Preview data</strong><br>
      ${details.map(item => escapeHtml(item)).join("<br>")}
      <div class="top-space">
        <button class="btn-primary" onclick="submitData('${type}', '${prefix}')">Simpan</button>
      </div>
    </div>
  `;
}

async function submitData(type, prefix) {
  showLoader();
  const val = id => document.getElementById(`${prefix}_${id}`)?.value || "";
  let body = {};

  if (type === "penjualan") body = { tanggal: val("tgl"), nama_outlet: val("outlet"), sku: getSkuFromRaw(val("sku")), qty: val("qty") };
  if (type === "pembelian") body = { tanggal: val("tgl"), sku: getSkuFromRaw(val("sku")), qty: val("qty") };
  if (type === "stok_awal") body = { sku: getSkuFromRaw(val("sku")), qty: val("qty") };
  if (type === "outlet") body = { nama_outlet: val("outlet") };

  try {
    const data = await fetchJson(`/api/add-${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    showToast(data.message || "Data berhasil disimpan");
    await applyCurrentFilters();
  } catch (error) {
    console.error("Submit error:", error);
    showToast(error.message || "Gagal menyimpan data", false);
  } finally {
    hideLoader();
  }
}

function getSkuFromRaw(raw = "") {
  return raw.includes(" - ") ? raw.split(" - ")[0].trim() : raw.trim();
}

function selectImport(event, type) {
  if (event) {
    document.querySelectorAll("#importTab .mini-sidebar div")
      .forEach(item => item.classList.remove("active-mini"));
    event.target.classList.add("active-mini");
  }

  document.getElementById("importContent").innerHTML = buildImportPanel(type, "previewCSV");
}

function selectPersediaanImport(event, type) {
  if (event) {
    document.querySelectorAll("#persediaanImportMenu div")
      .forEach(item => item.classList.remove("active-mini"));
    event.target.classList.add("active-mini");
  }

  document.getElementById("persediaanImportContent").innerHTML = buildImportPanel(type, "persediaanPreviewCSV");
}

function buildImportPanel(type, previewId) {
  return `
    <h3>Import ${escapeHtml(type)}</h3>
    <div class="section-actions">
      <button class="btn-secondary" onclick="downloadTemplate('${type}')">Download Template</button>
    </div>
    <div class="top-space">
      <input type="file" id="${previewId}_file" accept=".csv,text/csv">
      <button class="btn-primary" onclick="previewCSV('${type}','${previewId}')">Preview</button>
    </div>
    <div id="${previewId}" class="top-space"></div>
  `;
}

function downloadTemplate(type = "outlet") {
  const map = {
    outlet: "/api/template-outlet",
    penjualan: "/api/template-penjualan",
    pembelian: "/api/template-pembelian",
    stok_awal: "/api/template-stok_awal"
  };
  window.open(map[type], "_blank");
}

async function previewCSV(type, previewId) {
  const file = document.getElementById(`${previewId}_file`)?.files?.[0];
  if (!file) {
    showToast("Pilih file CSV terlebih dahulu", false);
    return;
  }

  const csv = await readFileAsText(file);
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    showToast("CSV belum berisi data", false);
    return;
  }

  let html = `<div class="table-shell"><table class="table"><thead><tr>`;
  lines[0].split(/[,;]/).forEach(header => {
    html += `<th>${escapeHtml(header.trim())}</th>`;
  });
  html += `</tr></thead><tbody>`;

  for (let index = 1; index < Math.min(lines.length, 6); index += 1) {
    html += "<tr>";
    lines[index].split(/[,;]/).forEach(cell => {
      html += `<td>${escapeHtml(cell.trim())}</td>`;
    });
    html += "</tr>";
  }

  html += `</tbody></table></div>
    <div class="top-space">
      <button class="btn-primary" onclick="importCSV('${type}','${previewId}')">Import Data</button>
    </div>`;

  const previewEl = document.getElementById(previewId);
  previewEl.innerHTML = html;
  previewEl.dataset.csv = csv;
}

async function importCSV(type, previewId) {
  const previewEl = document.getElementById(previewId);
  const csv = previewEl?.dataset.csv;
  if (!csv) {
    showToast("Preview file terlebih dahulu", false);
    return;
  }

  showLoader();
  try {
    const data = await fetchJson(`/api/import-${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv })
    });

    showToast(data.message || "Import selesai");
    await applyCurrentFilters();
  } catch (error) {
    console.error("Import error:", error);
    showToast(error.message || "Import gagal", false);
  } finally {
    hideLoader();
  }
}

async function loadPersediaan() {
  showLoader();
  try {
    state.persediaan = toArray(await fetchJson(`/api/persediaan?${getQueryParams().toString()}`));

    const body = document.getElementById("persediaanBody");
    const restockBody = document.getElementById("persediaanRestockBody");
    body.innerHTML = "";
    restockBody.innerHTML = "";

    let totalStok = 0;
    let lowStock = 0;
    let outStock = 0;

    state.persediaan.forEach(item => {
      const stokAkhir = Number(item.stok_akhir || 0);
      totalStok += stokAkhir;
      if (stokAkhir <= 0) outStock += 1;
      if (stokAkhir > 0 && stokAkhir <= 10) lowStock += 1;

      body.innerHTML += `
        <tr>
          <td>${escapeHtml(item.sku)}</td>
          <td>${escapeHtml(item.nama_produk)}</td>
          <td>${formatNumber(item.stok_awal)}</td>
          <td>${formatNumber(item.pembelian)}</td>
          <td>${formatNumber(item.penjualan)}</td>
          <td>${formatNumber(item.penyesuaian)}</td>
          <td>${formatNumber(stokAkhir)}</td>
        </tr>
      `;

      if (stokAkhir <= 10) {
        const statusClass = stokAkhir <= 0 ? "status-out" : "status-low";
        const label = stokAkhir <= 0 ? "Minus / Habis" : "Prioritas Restock";
        restockBody.innerHTML += `
          <tr>
            <td>${escapeHtml(item.sku)}</td>
            <td>${escapeHtml(item.nama_produk)}</td>
            <td>${formatNumber(stokAkhir)}</td>
            <td><span class="status-badge ${statusClass}">${label}</span></td>
          </tr>
        `;
      }
    });

    setText("persediaan_total_sku", formatNumber(state.persediaan.length));
    setText("persediaan_total_stok", formatNumber(totalStok));
    setText("persediaan_low_stock", formatNumber(lowStock));
    setText("persediaan_out_stock", formatNumber(outStock));
  } catch (error) {
    console.error("Persediaan error:", error);
    showToast(error.message || "Gagal memuat persediaan", false);
  } finally {
    hideLoader();
  }
}

async function loadAudit() {
  showLoader();
  try {
    const qs = getQueryParams();
    const outlet = getAuditOutletFilter();
    if (outlet) qs.set("outlet", outlet);
    state.audit = toObject(await fetchJson(`/api/audit?${qs.toString()}`));
    const summary = toObject(state.audit.summary);
    const movements = toArray(state.audit.movements);
    const outletSummary = toArray(state.audit.outlet_summary);
    const flags = toArray(state.audit.flags);
    const notes = toArray(state.audit.notes);

    setText("audit_total_log", formatNumber(summary.total_mutasi));
    setText("audit_penjualan_total", formatNumber(summary.stok_masuk_outlet));
    setText("audit_pembelian_total", formatNumber(summary.penjualan_outlet));
    setText("audit_qty_total", formatNumber(summary.qty_bergerak));

    const insightCards = document.getElementById("auditInsightCards");
    const outletBody = document.getElementById("auditOutletBody");
    const movementBody = document.getElementById("auditBody");
    const flagBody = document.getElementById("auditFlagBody");
    const dbStatus = document.getElementById("auditDbStatus");
    const notePanel = document.getElementById("auditIntegrationNotes");

    insightCards.innerHTML = "";
    outletBody.innerHTML = "";
    movementBody.innerHTML = "";
    flagBody.innerHTML = "";

    const insightItems = [
      {
        title: "Status Database Audit",
        detail: state.audit.db_ready
          ? "Tabel outlet audit sudah tersedia. Penjualan outlet, penyesuaian, dan stok akhir bisa direkonsiliasi penuh."
          : "Tabel audit outlet belum lengkap. Saat ini stok outlet masih dibaca dari transfer warehouse saja, sehingga kontrol kecurangan belum final."
      },
      {
        title: "Outlet Terpantau",
        detail: `${formatNumber(summary.total_outlet || 0)} outlet tercakup pada periode ${getBulanLabel()} ${getTahun()}.`
      },
      {
        title: "Flag Audit",
        detail: `${formatNumber(flags.length)} indikator risiko terdeteksi dan perlu ditindaklanjuti.`
      }
    ];

    insightItems.forEach(item => {
      insightCards.innerHTML += `
        <div class="insight-card">
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.detail)}</p>
        </div>
      `;
    });

    outletSummary.forEach(item => {
      outletBody.innerHTML += `
        <tr>
          <td>${escapeHtml(item.nama_outlet || "-")}</td>
          <td>${escapeHtml(item.sku || "-")}</td>
          <td>${escapeHtml(item.nama_produk || "-")}</td>
          <td>${formatNumber(item.opening_stok)}</td>
          <td>${formatNumber(item.stok_masuk)}</td>
          <td>${formatNumber(item.stok_keluar)}</td>
          <td>${formatNumber(item.penyesuaian)}</td>
          <td>${formatNumber(item.stok_akhir)}</td>
        </tr>
      `;
    });

    movements.forEach(item => {
      movementBody.innerHTML += `
        <tr>
          <td>${formatDate(item.tanggal)}</td>
          <td>${escapeHtml(item.sumber || "-")}</td>
          <td>${escapeHtml(item.jenis || "-")}</td>
          <td>${escapeHtml(item.nama_outlet || "-")}</td>
          <td>${escapeHtml(item.sku || "-")}</td>
          <td>${formatNumber(item.qty)}</td>
          <td>${escapeHtml(item.referensi || "-")}</td>
          <td>${escapeHtml(item.keterangan || "-")}</td>
        </tr>
      `;
    });

    if (!movements.length) {
      movementBody.innerHTML = `<tr><td colspan="8">Belum ada mutasi pada periode ini.</td></tr>`;
    }

    flags.forEach(item => {
      flagBody.innerHTML += `
        <tr>
          <td>${escapeHtml(item.nama_outlet || "-")}</td>
          <td>${escapeHtml(item.sku || "-")}</td>
          <td>${escapeHtml(item.flag || "-")}</td>
          <td>${escapeHtml(item.detail || "-")}</td>
        </tr>
      `;
    });

    if (!flags.length) {
      flagBody.innerHTML = `<tr><td colspan="4">Belum ada flag audit pada periode ini.</td></tr>`;
    }

    dbStatus.textContent = state.audit.db_ready
      ? "Siap dipakai. Modul audit outlet sudah bisa membaca tabel khusus outlet."
      : "Belum lengkap. Tambahkan tabel outlet audit agar stok keluar outlet, penyesuaian, dan opname outlet bisa diawasi penuh.";

    notePanel.innerHTML = `
      <h4>Instruksi Sinkron API & DB</h4>
      <ul>
        ${notes.map(note => `<li>${escapeHtml(note)}</li>`).join("")}
      </ul>
    `;
  } catch (error) {
    console.error("Audit error:", error);
    showToast(error.message || "Gagal memuat audit", false);
  } finally {
    hideLoader();
  }
}

async function loadForecast() {
  showLoader();
  try {
    state.forecast = toArray(await fetchJson(`/api/forecast?${getQueryParams().toString()}`));
    const body = document.getElementById("forecastBody");
    const recommendationCards = document.getElementById("forecastRecommendationCards");
    body.innerHTML = "";
    recommendationCards.innerHTML = "";

    let totalForecast = 0;
    let totalActual = 0;
    let totalGap = 0;
    let produkAktif = 0;
    let accuracyTotal = 0;
    let accuracyCount = 0;

    state.forecast.forEach(item => {
      const forecast = Number(item.forecast_bulan_depan || 0);
      const actual = Number(item.bulan_3 || 0);
      const gap = forecast - actual;
      totalForecast += forecast;
      totalActual += actual;
      totalGap += gap;
      if (forecast > 0) produkAktif += 1;

      const accuracy = getForecastAccuracy(forecast, actual);
      if (accuracy !== null) {
        accuracyTotal += accuracy;
        accuracyCount += 1;
      }

      body.innerHTML += `
        <tr>
          <td>${escapeHtml(item.sku)}</td>
          <td>${escapeHtml(item.nama_produk)}</td>
          <td>${formatNumber(item.bulan_1)}</td>
          <td>${formatNumber(item.bulan_2)}</td>
          <td>${formatNumber(item.bulan_3)}</td>
          <td>${formatNumber(item.ema_3_bulan)}</td>
          <td>${formatNumber(item.forecast_bulan_depan)}</td>
        </tr>
      `;
    });

    const sorted = [...state.forecast].sort((a, b) => Number(b.forecast_bulan_depan || 0) - Number(a.forecast_bulan_depan || 0));
    const topDemand = sorted[0];

    setText("forecast_total_produk", formatNumber(state.forecast.length));
    setText("forecast_total_value", formatNumber(totalForecast));
    setText("forecast_actual_value", formatNumber(totalActual));
    setText("forecast_gap_value", formatNumber(totalGap));
    setText("forecast_accuracy", `${formatForecastPercentage(accuracyCount ? accuracyTotal / accuracyCount : 0)}%`);
    setText("forecast_avg_tahunan", formatNumber(state.forecast.length ? Math.ceil(totalForecast / state.forecast.length) : 0));
    setText("forecast_top_demand", topDemand ? topDemand.nama_produk : "-");
    setText("forecast_produk_aktif", formatNumber(produkAktif));

    sorted.filter(item => Number(item.forecast_bulan_depan || 0) > 0).slice(0, 3).forEach((item, index) => {
      recommendationCards.innerHTML += `
        <div class="insight-card">
          <h4>Prioritas ${index + 1}</h4>
          <p>${escapeHtml(item.nama_produk)} diproyeksikan membutuhkan ${formatNumber(item.forecast_bulan_depan)} unit bulan depan. Siapkan stok minimal di atas angka ini.</p>
        </div>
      `;
    });

    if (!recommendationCards.innerHTML) {
      recommendationCards.innerHTML = `
        <div class="insight-card">
          <h4>Belum ada rekomendasi</h4>
          <p>Histori penjualan 3 bulan masih belum cukup untuk memberi prioritas forecast.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error("Forecast error:", error);
    showToast(error.message || "Gagal memuat forecast", false);
  } finally {
    hideLoader();
  }
}

function getForecastAccuracy(forecast, actual) {
  const safeForecast = Number(forecast || 0);
  const safeActual = Number(actual || 0);

  if (safeForecast === 0 && safeActual === 0) return 100;
  if (safeActual === 0) return 0;

  const accuracy = 100 - (Math.abs(safeForecast - safeActual) / safeActual) * 100;
  return Math.max(0, Math.min(100, accuracy));
}

function formatForecastPercentage(value) {
  return Number(value || 0).toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function getOpnameCategory(namaProduk = "") {
  const nama = namaProduk.toLowerCase().trim();
  if (nama.startsWith("modul")) return "modul";
  if (nama.startsWith("poster") || nama.startsWith("flash")) return "poster";
  if (nama.includes("merah") || nama.includes("kuning") || nama.includes("biru") || nama.includes(" my")) return "seragam";
  return "lain-lain";
}

function getOpnameCategoryLabel(category) {
  const labels = {
    modul: "Modul",
    seragam: "Seragam",
    poster: "Poster",
    "lain-lain": "Lain-lain"
  };
  return labels[category] || "Lain-lain";
}

async function loadStokSistem() {
  showLoader();
  try {
    const qs = new URLSearchParams({
      bulan: document.getElementById("opnameBulan")?.value || getBulan(),
      tahun: document.getElementById("opnameTahun")?.value || getTahun()
    });

    const sku = getSelectedSku();
    if (sku) qs.set("sku", sku);

    state.opname = toArray(await fetchJson(`/api/stok-sistem?${qs.toString()}`));
    const body = document.getElementById("opnameBody");
    body.innerHTML = "";

    state.opname.forEach((item, index) => {
      const category = getOpnameCategory(item.nama_produk);
      body.innerHTML += `
        <tr id="row-${escapeHtml(item.sku)}" data-category="${category}">
          <td>${escapeHtml(item.sku)}</td>
          <td>${escapeHtml(item.nama_produk)}</td>
          <td><span class="status-badge status-safe">${getOpnameCategoryLabel(category)}</span></td>
          <td id="sys-${escapeHtml(item.sku)}">${formatNumber(item.stok)}</td>
          <td>
            <input
              type="number"
              class="input-opname"
              id="fisik-${escapeHtml(item.sku)}"
              oninput="hitungSelisih('${escapeHtml(item.sku)}')"
              onkeydown="nextInput(event, ${index})"
            />
          </td>
          <td id="selisih-${escapeHtml(item.sku)}">0</td>
        </tr>
      `;
    });

    setText("sum_total", formatNumber(state.opname.length));
    updateSummary();
  } catch (error) {
    console.error("Stok sistem error:", error);
    showToast(error.message || "Gagal memuat stok sistem", false);
  } finally {
    hideLoader();
  }
}

function nextInput(event, index) {
  if (event.key !== "Enter") return;
  const inputs = document.querySelectorAll(".input-opname");
  inputs[index + 1]?.focus();
}

function hitungSelisih(sku) {
  const sistem = Number((document.getElementById(`sys-${sku}`)?.textContent || "0").replace(/\./g, "").replace(/,/g, ""));
  const input = document.getElementById(`fisik-${sku}`);
  const fisik = input?.value === "" ? sistem : Number(input?.value || 0);
  const selisih = fisik - sistem;

  const selisihEl = document.getElementById(`selisih-${sku}`);
  const row = document.getElementById(`row-${sku}`);

  if (selisihEl) {
    selisihEl.textContent = formatNumber(selisih);
    selisihEl.classList.remove("selisih-plus", "selisih-minus");
    if (selisih > 0) selisihEl.classList.add("selisih-plus");
    if (selisih < 0) selisihEl.classList.add("selisih-minus");
  }

  row?.classList.toggle("row-problem", selisih !== 0);
  updateSummary();
}

function updateSummary() {
  let totalSistem = 0;
  let totalFisik = 0;
  let totalSelisih = 0;
  let problem = 0;

  document.querySelectorAll("#opnameBody tr").forEach(row => {
    const sku = row.id.replace("row-", "");
    const sistem = Number((document.getElementById(`sys-${sku}`)?.textContent || "0").replace(/\./g, "").replace(/,/g, ""));
    const input = document.getElementById(`fisik-${sku}`);
    const fisik = input?.value === "" ? sistem : Number(input?.value || 0);
    const selisih = fisik - sistem;

    totalSistem += sistem;
    totalFisik += fisik;
    totalSelisih += selisih;
    if (selisih !== 0) problem += 1;
  });

  setText("kpi_opname_total", formatNumber(document.querySelectorAll("#opnameBody tr").length));
  setText("kpi_opname_sistem", formatNumber(totalSistem));
  setText("kpi_opname_fisik", formatNumber(totalFisik));
  setText("kpi_opname_selisih", formatNumber(totalSelisih));
  setText("kpi_opname_problem", formatNumber(problem));
  setText("sum_selisih", formatNumber(totalSelisih));
  setText("sum_problem", formatNumber(problem));
}

function filterOpname() {
  const keyword = (document.getElementById("searchOpname")?.value || "").toLowerCase();
  const category = document.getElementById("opnameCategoryFilter")?.value || "all";

  document.querySelectorAll("#opnameBody tr").forEach(row => {
    const matchText = row.textContent.toLowerCase().includes(keyword);
    const matchCategory = category === "all" || row.dataset.category === category;
    row.style.display = matchText && matchCategory ? "" : "none";
  });
}

async function loadHistory() {
  try {
    const qs = new URLSearchParams({
      bulan: document.getElementById("opnameBulan")?.value || getBulan(),
      tahun: document.getElementById("opnameTahun")?.value || getTahun()
    });
    const data = toArray(await fetchJson(`/api/opname-history?${qs.toString()}`));
    const body = document.getElementById("historyBody");
    body.innerHTML = "";

    data.forEach(item => {
      body.innerHTML += `
        <tr>
          <td>${formatDate(item.tanggal)}</td>
          <td>${formatNumber(item.total_item)}</td>
          <td>${formatNumber(item.total_selisih)}</td>
        </tr>
      `;
    });

    if (!data.length) {
      body.innerHTML = `<tr><td colspan="3">Belum ada history opname pada periode ini.</td></tr>`;
    }
  } catch (error) {
    console.error("History opname error:", error);
    showToast(error.message || "Gagal memuat history opname", false);
  }
}

async function simpanOpname() {
  const bulan = document.getElementById("opnameBulan")?.value || getBulan();
  const tahun = document.getElementById("opnameTahun")?.value || getTahun();
  const tanggal = `${tahun}-${String(bulan).padStart(2, "0")}-01`;

  const items = [...document.querySelectorAll("#opnameBody tr")].map(row => {
    const sku = row.children[0].textContent.trim();
    const sistem = Number((document.getElementById(`sys-${sku}`)?.textContent || "0").replace(/\./g, "").replace(/,/g, ""));
    const input = document.getElementById(`fisik-${sku}`);
    const fisik = input?.value === "" ? sistem : Number(input?.value || 0);
    return { sku, sistem, fisik };
  });

  showLoader();
  try {
    const data = await fetchJson("/api/simpan-opname", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tanggal, items })
    });

    showToast(data.message || "Opname berhasil disimpan");
    await loadStokSistem();
    await loadHistory();
  } catch (error) {
    console.error("Simpan opname error:", error);
    showToast(error.message || "Gagal menyimpan opname", false);
  } finally {
    hideLoader();
  }
}

function exportOpname() {
  const rows = [...document.querySelectorAll("#opnameBody tr")].map(row => {
    const sku = row.children[0].textContent.trim();
    const sistem = row.children[3].textContent.trim();
    const input = document.getElementById(`fisik-${sku}`);
    const fisik = input?.value === "" ? sistem : input?.value || "0";
    const selisih = Number(String(fisik).replace(/\./g, "").replace(/,/g, "")) - Number(String(sistem).replace(/\./g, "").replace(/,/g, ""));
    return [sku, row.children[1].textContent.trim(), row.children[2].textContent.trim(), sistem, fisik, selisih];
  });

  downloadCsv(`opname_${getTahun()}_${getBulan()}.csv`, ["sku", "nama_produk", "kategori", "stok_sistem", "stok_fisik", "selisih"], rows);
}

function downloadOpnameTemplate() {
  const csv = "sku,stok_fisik\nSKU001,10\nSKU002,5";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "template_opname.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function previewOpnameImport() {
  const file = document.getElementById("opnameImportFile")?.files?.[0];
  if (!file) {
    showToast("Pilih file CSV opname terlebih dahulu", false);
    return;
  }

  const csv = await readFileAsText(file);
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const previewEl = document.getElementById("opnameImportPreview");

  let html = `<div class="table-shell"><table class="table"><thead><tr>`;
  lines[0].split(",").forEach(header => {
    html += `<th>${escapeHtml(header.trim())}</th>`;
  });
  html += `</tr></thead><tbody>`;

  for (let index = 1; index < Math.min(lines.length, 6); index += 1) {
    html += "<tr>";
    lines[index].split(",").forEach(cell => {
      html += `<td>${escapeHtml(cell.trim())}</td>`;
    });
    html += "</tr>";
  }

  html += `</tbody></table></div>
    <div class="top-space">
      <button class="btn-primary" onclick="importOpnameCSV()">Import ke Tabel Opname</button>
    </div>`;

  previewEl.innerHTML = html;
  previewEl.dataset.csv = csv;
}

async function importOpnameCSV() {
  const previewEl = document.getElementById("opnameImportPreview");
  const csv = previewEl?.dataset.csv;
  if (!csv) {
    showToast("Preview file opname dulu sebelum import", false);
    return;
  }

  if (!document.querySelectorAll("#opnameBody tr").length) {
    await loadStokSistem();
  }

  let applied = 0;
  let skipped = 0;

  csv.split(/\r?\n/).slice(1).filter(Boolean).forEach(line => {
    const [skuRaw, stokFisikRaw] = line.split(",").map(item => item.trim());
    const input = document.getElementById(`fisik-${skuRaw}`);
    if (!skuRaw || !stokFisikRaw || !input) {
      skipped += 1;
      return;
    }

    input.value = String(Number(stokFisikRaw));
    hitungSelisih(skuRaw);
    applied += 1;
  });

  showToast(`Import opname selesai (${applied} diterapkan, ${skipped} dilewati)`, applied > 0);
  showOpnameTab(null, "opnameInput");
  document.querySelector(".tab-menu-opname button:nth-child(2)")?.classList.add("active-tab");
}

function printOpname() {
  const checker = document.getElementById("opnameChecker")?.value?.trim() || "................................";
  const gudang = document.getElementById("opnameGudang")?.value?.trim() || "................................";
  const category = document.getElementById("opnamePrintCategory")?.value || "all";
  const rows = [...document.querySelectorAll("#opnameBody tr")].filter(row => category === "all" || row.dataset.category === category);

  if (!rows.length) {
    showToast("Tidak ada data opname untuk kategori yang dipilih", false);
    return;
  }

  const tableRows = rows.map((row, index) => {
    const sku = row.children[0].textContent.trim();
    const sistem = row.children[3].textContent.trim();

    return [
      index + 1,
      sku,
      row.children[1].textContent.trim(),
      row.children[2].textContent.trim(),
      sistem,
      "",
      ""
    ];
  });

  const title = `Form Stok Opname Gudang - ${getBulanLabel(document.getElementById("opnameBulan")?.value)} ${document.getElementById("opnameTahun")?.value}`;
  const summary = [
    ["Checker", checker],
    ["Gudang / Lokasi", gudang],
    ["Tanggal Cetak", formatDate(new Date())]
  ];

  openPrintWindow({
    title,
    subtitle: `Periode ${getBulanLabel(document.getElementById("opnameBulan")?.value)} ${document.getElementById("opnameTahun")?.value}`,
    summary,
    headers: ["No", "SKU", "Nama Produk", "Kategori", "Stok Sistem", "Stok Fisik", "Selisih"],
    rows: tableRows
  });
}

function exportCurrentModule() {
  if (currentMenu === "persediaan") {
    downloadCsv(
      `persediaan_${getTahun()}_${getBulan()}.csv`,
      ["sku", "nama_produk", "opening", "pembelian", "keluar_gudang", "penyesuaian", "stok_akhir"],
      state.persediaan.map(item => [item.sku, item.nama_produk, item.stok_awal, item.pembelian, item.penjualan, item.penyesuaian, item.stok_akhir])
    );
    return;
  }

  if (currentMenu === "audit") {
    const outletVisible = document.getElementById("auditOutletStock")?.style.display !== "none";
    if (outletVisible) {
      downloadCsv(
        `audit_stok_outlet_${getTahun()}_${getBulan()}.csv`,
        ["outlet", "sku", "nama_produk", "opening", "stok_masuk", "stok_keluar", "penyesuaian", "stok_akhir"],
        state.audit.outlet_summary.map(item => [item.nama_outlet, item.sku, item.nama_produk, item.opening_stok, item.stok_masuk, item.stok_keluar, item.penyesuaian, item.stok_akhir])
      );
    } else {
      downloadCsv(
        `audit_mutasi_${getTahun()}_${getBulan()}.csv`,
        ["tanggal", "sumber", "jenis", "outlet", "sku", "qty", "referensi", "keterangan"],
        state.audit.movements.map(item => [item.tanggal, item.sumber, item.jenis, item.nama_outlet, item.sku, item.qty, item.referensi, item.keterangan])
      );
    }
    return;
  }

  if (currentMenu === "forecast") {
    downloadCsv(
      `forecast_${getTahun()}_${getBulan()}.csv`,
      ["sku", "nama_produk", "bulan_1", "bulan_2", "bulan_3", "ema_3_bulan", "forecast_bulan_depan"],
      state.forecast.map(item => [item.sku, item.nama_produk, item.bulan_1, item.bulan_2, item.bulan_3, item.ema_3_bulan, item.forecast_bulan_depan])
    );
  }
}

function downloadCsv(filename, headers, rows) {
  const content = [
    headers.join(","),
    ...rows.map(row => row.map(cell => csvEscape(cell)).join(","))
  ].join("\n");

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function printCurrentView() {
  if (currentMenu === "penjualan") {
    openPrintWindow({
      title: "Ringkasan Penjualan Warehouse",
      subtitle: `Periode ${getBulanLabel()} ${getTahun()}${getSelectedSku() ? ` | SKU ${getSelectedSku()}` : ""}`,
      summary: [
        ["Total Qty", document.getElementById("kpi_qty")?.textContent || "0"],
        ["Total Penjualan", document.getElementById("kpi_nilai")?.textContent || "Rp 0"],
        ["Total Modal", document.getElementById("kpi_modal")?.textContent || "Rp 0"],
        ["Profit", document.getElementById("kpi_profit")?.textContent || "Rp 0"]
      ]
    });
    return;
  }

  if (currentMenu === "persediaan") {
    openPrintWindow({
      title: "Laporan Persediaan Warehouse",
      subtitle: `Periode ${getBulanLabel()} ${getTahun()}`,
      headers: ["SKU", "Nama Produk", "Opening", "Pembelian", "Keluar Gudang", "Penyesuaian", "Stok Akhir"],
      rows: state.persediaan.map(item => [item.sku, item.nama_produk, item.stok_awal, item.pembelian, item.penjualan, item.penyesuaian, item.stok_akhir])
    });
    return;
  }

  if (currentMenu === "audit") {
    openPrintWindow({
      title: "Laporan Audit Stok Outlet",
      subtitle: `Periode ${getBulanLabel()} ${getTahun()}`,
      summary: [
        ["Status DB Audit", state.audit.db_ready ? "Siap" : "Perlu tabel tambahan"],
        ["Total Mutasi", formatNumber(state.audit.summary?.total_mutasi)],
        ["Stok Masuk Outlet", formatNumber(state.audit.summary?.stok_masuk_outlet)],
        ["Penjualan Outlet", formatNumber(state.audit.summary?.penjualan_outlet)]
      ],
      headers: ["Outlet", "SKU", "Nama Produk", "Opening", "Masuk", "Keluar", "Penyesuaian", "Stok Akhir"],
      rows: state.audit.outlet_summary.map(item => [item.nama_outlet, item.sku, item.nama_produk, item.opening_stok, item.stok_masuk, item.stok_keluar, item.penyesuaian, item.stok_akhir])
    });
    return;
  }

  if (currentMenu === "forecast") {
    openPrintWindow({
      title: "Laporan Forecast Penjualan",
      subtitle: `Periode ${getBulanLabel()} ${getTahun()}`,
      headers: ["SKU", "Nama Produk", "Bulan -2", "Bulan -1", "Bulan Aktif", "EMA 3 Bulan", "Forecast +10%"],
      rows: state.forecast.map(item => [item.sku, item.nama_produk, item.bulan_1, item.bulan_2, item.bulan_3, item.ema_3_bulan, item.forecast_bulan_depan])
    });
    return;
  }

  if (currentMenu === "opname") {
    printOpname();
  }
}

function openPrintWindow({ title, subtitle = "", summary = [], headers = [], rows = [] }) {
  const printWindow = window.open("", "_blank", "width=1280,height=900");
  if (!printWindow) {
    showToast("Popup print diblokir browser", false);
    return;
  }

  const summaryHtml = summary.length
    ? `
      <table class="summary">
        <tbody>
          ${summary.map(item => `<tr><td>${escapeHtml(item[0])}</td><td>${escapeHtml(item[1])}</td></tr>`).join("")}
        </tbody>
      </table>
    `
    : "";

  const tableHtml = headers.length
    ? `
      <table class="main">
        <thead>
          <tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.length
            ? rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
            : `<tr><td colspan="${headers.length}">Tidak ada data untuk dicetak.</td></tr>`}
        </tbody>
      </table>
    `
    : "";

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1f2933; padding: 30px; }
          .brand { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
          .brand img { width: 68px; height: 68px; object-fit: contain; }
          .brand h1 { margin: 0; font-size: 28px; }
          .brand p { margin: 4px 0 0; color: #677788; }
          .summary, .main { width: 100%; border-collapse: collapse; margin-top: 18px; }
          .summary td, .main td, .main th { border: 1px solid #d9dee7; padding: 10px 12px; font-size: 13px; }
          .main th { background: #f8f2e7; text-transform: uppercase; font-size: 11px; letter-spacing: 0.08em; }
          .footer { margin-top: 18px; color: #677788; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="brand">
          <img src="/assets/logo.png" alt="CV EPIC Warehouse">
          <div>
            <h1>CV EPIC Warehouse</h1>
            <p>${escapeHtml(title)}</p>
            <p>${escapeHtml(subtitle)}</p>
          </div>
        </div>
        ${summaryHtml}
        ${tableHtml}
        <div class="footer">Dicetak pada ${new Date().toLocaleDateString("id-ID")} ${new Date().toLocaleTimeString("id-ID")}</div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
