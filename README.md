# ARUS — Aplikasi Manajemen Keuangan

Aplikasi pencatat keuangan pribadi. Frontend statis (HTML/CSS/JS) yang bisa di-hosting di mana saja (GitHub Pages, dsb), dengan Google Spreadsheet sebagai database dan Google Apps Script sebagai backend/API-nya.

Dokumen ini punya dua bagian:
- **Bagian 1 — Panduan Umum**: untuk siapa saja, tanpa perlu paham coding.
- **Bagian 2 — Dokumentasi Teknis**: untuk developer yang mau memodifikasi, debug, atau memahami arsitekturnya.

---

# BAGIAN 1 — PANDUAN UMUM (Untuk Semua Orang)

## Apa itu ARUS?

ARUS adalah aplikasi pencatat pemasukan dan pengeluaran uang, mirip aplikasi keuangan pada umumnya, tapi datamu **tersimpan di Google Spreadsheet milikmu sendiri** — bukan di server orang lain.

## Fitur Utama

| Fitur | Penjelasan |
|---|---|
| 🏠 Ringkasan | Saldo total, saldo per akun, ringkasan Utang & Piutang, dan rekapan pengeluaran per kategori bulan berjalan |
| 🏷️ Kategori | Kelola kategori pengeluaran/pemasukan, atur anggaran bulanan per kategori |
| ➕ Tambah Transaksi | Catat pemasukan/pengeluaran baru |
| 📋 Transaksi | Riwayat semua transaksi, bisa difilter per akun |
| 📊 Statistik | Grafik tren 6 bulan, pengeluaran per kategori, ekspor ke CSV |
| 👛 Multi-Akun | Pisahkan saldo Dompet, Bank, E-Wallet, dll |
| 🔁 Transaksi Berulang | Cicilan/langganan otomatis tercatat tiap bulan/minggu/hari |
| ⚠️ Anggaran | Kategori yang anggarannya habis akan ditandai dan diblokir dari transaksi baru |
| 🤝 Utang & Piutang | Catat siapa berutang ke siapa, jatuh tempo, dan lunasi (sebagian/penuh) — otomatis tercatat sebagai transaksi |

## Cara Memasang (Sekali Saja)

### Langkah 1: Siapkan Backend
1. Buat Google Spreadsheet baru di Google Drive.
2. Buka menu **Extensions > Apps Script**.
3. Hapus isi editor, tempel seluruh isi file **`Code.gs`**.
4. Jalankan fungsi **`setup`** (klik ▶️ Run) — ini membuat semua sheet + data awal. Izinkan akses saat diminta.
5. Jalankan fungsi **`createDailyTrigger`** sekali (untuk transaksi berulang otomatis).
6. Klik **Deploy > New deployment** → Type: **Web app** → Execute as: **Me** → Who has access: **Anyone** → **Deploy**.
7. Salin URL yang muncul (`https://script.google.com/macros/s/xxxxx/exec`).

> ⚠️ **Versi lama:** dulu `setup()` mengosongkan ulang semua sheet setiap dijalankan — ini sudah **diperbaiki**. Versi terbaru `setup()` **aman dijalankan berkali-kali kapan saja**: hanya membuat sheet yang belum ada, dan tidak pernah menyentuh sheet yang sudah berisi data. Kalau kamu masih pakai `Code.gs` versi lama, update dulu ke versi terbaru sebelum menjalankan `setup()` lagi.

### Langkah 2: Pasang Tampilan (Frontend)
1. Upload file **`index.html`** ke GitHub Pages (atau hosting statis lain).
2. Buka link aplikasinya di HP/browser.

### Langkah 3: Hubungkan
1. Saat pertama dibuka, aplikasi minta URL backend — tempel URL dari Langkah 1.
2. Selesai! Semua transaksi akan otomatis tersimpan ke spreadsheet-mu.

## Update dari Versi Lama (Sudah Punya Data)

Kalau kamu sudah pakai ARUS sebelumnya dan cuma mau update ke versi terbaru (misal ada fitur baru atau perbaikan bug):

1. Timpa isi `Code.gs` di Apps Script dengan versi terbaru.
2. Jalankan fungsi **`setup`** lagi — **aman**, tidak akan menghapus data yang sudah ada. Fungsi ini hanya membuat sheet baru yang dibutuhkan versi terbaru (misalnya sheet `Debts` untuk fitur Utang & Piutang) dan sama sekali tidak menyentuh sheet yang sudah berisi data.
3. Klik **Deploy > Manage deployments** → ikon pensil pada deployment yang sedang aktif → **New version** → **Deploy** (supaya URL Web App yang sama memakai kode terbaru, tidak perlu ganti URL di aplikasi).
4. Upload ulang `index.html` versi terbaru ke hosting frontend kamu.

> ⚠️ **Jangan pernah** menjalankan fungsi `DANGEROUS_resetAllData` kecuali kamu benar-benar sengaja ingin menghapus semua data dan mulai dari nol. Namanya sengaja dibuat jelas supaya tidak tertekan tidak sengaja.

## Pertanyaan Umum

**Datanya aman tidak?**
Aman — semua tersimpan di Google Spreadsheet milikmu sendiri, bukan di server pihak ketiga.

**Bagaimana kalau saya mau ganti ikon kategori?**
Ikon kategori bisa diubah langsung dari sheet **Categories** di spreadsheet kamu (kolom `icon`) — tinggal ganti emoji-nya, lalu buka ulang aplikasi.

**Kenapa kategori saya tidak bisa dipilih saat tambah transaksi?**
Berarti anggaran kategori itu untuk bulan tersebut sudah habis/lewat. Naikkan anggarannya di halaman Kategori, atau tunggu bulan berikutnya.

**Bagaimana cara pakai fitur Utang & Piutang?**
Di halaman Ringkasan, tekan **+ Tambah** di bagian "Utang & Piutang". Pilih apakah ini "Utang Saya" (kamu yang berutang) atau "Piutang Saya" (orang lain berutang ke kamu), isi nama orang, jumlah, dan jatuh tempo (opsional). Kalau sudah lewat jatuh tempo dan belum lunas, catatannya akan ditandai ⚠️. Untuk melunasi, tekan catatannya, isi jumlah yang dibayar (boleh sebagian) dan pilih akunnya — saldo akun otomatis ikut berubah dan tercatat sebagai transaksi.

**Aplikasi tidak bisa diakses / data tidak muncul?**
Cek koneksi internet, dan pastikan URL backend di Pengaturan (⚙️) masih benar dan deployment Apps Script masih aktif.

---

# BAGIAN 2 — DOKUMENTASI TEKNIS (Untuk Developer)

## Arsitektur

```
[index.html — SPA vanilla JS]  <—fetch (JSON)—>  [Code.gs — Apps Script Web App]  <—>  [Google Sheets]
```

Tidak ada framework/bundler. Semua CSS & JS inline dalam satu file `index.html`. State disimpan di objek global `STATE` (in-memory) dan di-cache ke `localStorage` (`arus_cache`, `arus_backend_url`) untuk mode offline read-only.

## Struktur Data (Google Sheets)

| Sheet | Kolom |
|---|---|
| `Transactions` | `id, date, type, amount, categoryId, accountId, note, createdAt` |
| `Categories` | `id, name, icon, type, color, sortOrder` |
| `Accounts` | `id, name, icon, initialBalance, sortOrder` |
| `Budgets` | `id, categoryId, month, limit` |
| `Recurring` | `id, title, amount, type, categoryId, accountId, frequency, dayOfMonth, dayOfWeek, startDate, lastRun, active, note` |
| `Debts` | `id, type, person, amount, paidAmount, dueDate, note, createdAt` |

- `type` pada `Transactions`/`Recurring` bernilai `"income"` atau `"expense"`; pada `Debts` bernilai `"utang"` atau `"piutang"`.
- `month` di `Budgets` berformat `YYYY-MM`.
- `frequency` di `Recurring`: `daily | weekly | monthly`.
- `Debts.paidAmount` menumpuk tiap kali `payDebt` dipanggil. Status lunas **tidak disimpan sebagai kolom terpisah** — dihitung langsung dari `paidAmount >= amount` (baik di frontend maupun backend) supaya tidak ada risiko data status tidak sinkron dengan angka aslinya.
- ID dibuat dengan `newId(prefix)` → `prefix_` + 8 karakter pertama dari UUID (`Utilities.getUuid()`).

### Kolom rawan konversi otomatis Google Sheets
Kolom-kolom berformat tanggal (`date`, `month`, `startDate`, `lastRun`, `dueDate`) disimpan sebagai **teks**, tapi Google Sheets bisa otomatis mengonversinya jadi objek `Date` kalau kolom belum diformat sebagai teks murni. Ini pernah menyebabkan bug nyata (fitur anggaran gagal cocok bulan, transaksi berulang berpotensi duplikat). Mitigasi ganda yang diterapkan:
1. `forcePlainTextOnDateColumns()` — memaksa format kolom jadi `'@'` (plain text) supaya penulisan berikutnya tidak dikonversi lagi.
2. `normalizeDateLikeValue(header, value)` — dipanggil di dalam `sheetToObjects()`, mengembalikan nilai yang **sudah kadung** jadi `Date` kembali ke string format yang benar setiap kali dibaca, apa pun kondisi sheet-nya.

Kalau menambah kolom tanggal baru di masa depan, tambahkan namanya ke `DATE_LIKE_FIELDS` (di `normalizeDateLikeValue`) dan ke daftar `targets` di `forcePlainTextOnDateColumns()`.

## Backend (`Code.gs`) — API Contract

Satu Web App menangani dua method:

**`GET ?action=getAllData`**
Mengembalikan seluruh data sekaligus (tidak ada pagination — sesuai skala pemakaian personal):
```json
{ "ok": true, "data": { "transactions": [...], "categories": [...], "accounts": [...], "budgets": [...], "recurring": [...], "debts": [...], "serverTime": "ISO8601" } }
```

**`POST`** dengan body `{ "action": "<nama_aksi>", "payload": {...} }`. Aksi yang tersedia:

| Aksi | Payload |
|---|---|
| `addTransaction` / `updateTransaction` / `deleteTransaction` | `{type, amount, date, categoryId, accountId, note}` / `+id` / `{id}` |
| `addCategory` / `updateCategory` / `deleteCategory` | `{name, icon, type}` / `+id` / `{id}` |
| `addAccount` / `updateAccount` / `deleteAccount` | `{name, icon, initialBalance}` / `+id` / `{id}` |
| `setBudget` / `deleteBudget` | `{categoryId, month, limit}` / `{id}` |
| `addRecurring` / `updateRecurring` / `deleteRecurring` | `{title, amount, type, categoryId, accountId, frequency, dayOfMonth, dayOfWeek, startDate}` / `+id` / `{id}` |
| `runRecurringNow` | *(tanpa payload)* — trigger manual, sama seperti trigger harian |
| `addDebt` / `updateDebt` / `deleteDebt` | `{type, person, amount, dueDate, note}` / `+id` / `{id}` |
| `payDebt` | `{id, amount, accountId, date, note?}` — lihat detail di bawah |

Semua response berbentuk `{ok: true, data: ...}` atau `{ok: false, error: "..."}`. Request POST dikirim dengan header `Content-Type: text/plain;charset=utf-8` (bukan `application/json`) supaya browser tidak melakukan CORS preflight ke Apps Script — `doPost` tetap mem-parse `e.postData.contents` sebagai JSON secara manual.

### `payDebt` — mekanisme
1. Ambil sisa (`amount - paidAmount`), pembayaran di-cap ke sisa tsb (`Math.min(payload.amount, remaining)`) supaya tidak overpay.
2. Update `paidAmount` di sheet `Debts` via `updateObject`.
3. Panggil `addTransaction()` secara internal: `type` mengikuti arah uang (`piutang` dibayar → `income`, `utang` dibayar → `expense`), `categoryId` dikosongkan (sengaja, supaya tidak memotong anggaran kategori manapun), `note` otomatis berisi label `"Pelunasan utang/piutang: <nama>"`.
4. Mengembalikan `{debtId, newPaidAmount, transaction}`.

### Recurring engine
`processRecurringTransactions()` dijalankan oleh time-driven trigger (`createDailyTrigger`, jam 00:05 tiap hari). Untuk tiap rule aktif dengan `lastRun !== hariIni`:
- `daily` → selalu jalan.
- `weekly` → jalan jika `today.getDay() === dayOfWeek`.
- `monthly` → jalan jika `today.getDate() === min(dayOfMonth, lastDayOfMonth)` (mengantisipasi bulan pendek, mis. tanggal 31 di bulan Februari akan jalan di tanggal 28/29).

Trigger ini berjalan di sisi server — **tidak bergantung pada frontend dibuka atau tidak**, dan **belum melakukan pengecekan anggaran** (lihat Known Limitations).

## Frontend (`index.html`) — Struktur Kode

Single file, dibagi 3 blok:
1. **`<style>`** — CSS custom properties di `:root` (palet warna, radius). Tema: navy `#0E1420` + gold `#E8B84B` (expense) + teal `#4FD1AE` (income).
2. **HTML** — 5 `<section class="screen">` (routing manual via `showOnly()`/`goTo()`, tanpa router library) + beberapa `.sheet-overlay` sebagai bottom-sheet modal.
3. **`<script>`** — vanilla JS, tidak ada build step.

### State management
Objek `STATE` global menyimpan seluruh data + UI state (filter aktif, ID yang sedang diedit, dll). Tidak ada state management library — render ulang dilakukan manual dengan memanggil fungsi `render*()` yang menimpa `innerHTML` elemen terkait setelah tiap mutasi data (`await apiPost(...); await loadAll();` → `loadAll()` memanggil `renderAll()`).

### Penanganan tanggal — SELALU pakai komponen lokal
`new Date().toISOString()` dan `input.valueAsDate` sama-sama berbasis **UTC**, bukan zona waktu lokal perangkat. Ini pernah menyebabkan bug nyata: navigasi bulan di halaman Ringkasan bisa lompat 1 bulan ekstra di zona waktu WIB (UTC+7). Semua kebutuhan tanggal/bulan "hari ini" di kode ini **wajib** memakai dua helper berikut, jangan `toISOString()`/`valueAsDate` lagi:
- `todayLocalStr()` → `"YYYY-MM-DD"` dari komponen lokal (`getFullYear/getMonth/getDate`).
- `localYearMonth(dateObj)` → `"YYYY-MM"` dari komponen lokal.

### Fungsi kunci
- `loadAll()` — fetch `getAllData`, fallback ke `localStorage.arus_cache` jika gagal (mode offline read-only).
- `apiGet()` / `apiPost(action, payload)` — wrapper fetch ke backend.
- `accountBalance(accId)` — `initialBalance + Σ(income) - Σ(expense)` dari seluruh transaksi (bukan hanya bulan berjalan).
- `categorySpent(categoryId, month, excludeTxId)` / `categoryBudgetLimit(...)` / `isCategoryBlocked(...)` — logika inti fitur anggaran; dipakai baik untuk badge visual (`renderCategories`) maupun validasi hard-block (`refreshTxCategoryOptions`, `saveTx`).
- `renderHomeRecap()` — agregasi transaksi expense bulan berjalan per `categoryId`, sort descending by total, render sebagai accordion (`toggleRecap`).
- `renderStats()` — 2 chart via Chart.js (`chart-trend` = line 6 bulan, `chart-cat` = horizontal bar per kategori bulan berjalan), di-`destroy()` dan dibuat ulang tiap render untuk menghindari canvas menumpuk.
- `debtRemaining(d)` / `isDebtPaid(d)` / `isDebtOverdue(d)` — logika inti Utang & Piutang; `isDebtOverdue` membandingkan `dueDate` dengan `todayLocalStr()` (bukan `Date` object) supaya konsisten dengan format string yang disimpan.
- `renderDebts()` — hitung total piutang/utang aktif, sort daftar (yang overdue naik ke atas), render kartu dengan progress bar pelunasan.

### Blokir Anggaran
Threshold blokir: `spent >= limit` (bukan `>`, supaya begitu limit tercapai persis, transaksi baru langsung diblokir juga). Pengecualian transaksi yang sedang diedit (`excludeTxId = STATE.editingTxId`) supaya user tetap bisa mengoreksi transaksi lama di kategori yang sudah over tanpa terkunci oleh perhitungannya sendiri. Dropdown kategori (`refreshTxCategoryOptions`) re-evaluasi berdasarkan `tx-date` yang aktif (bukan `STATE.currentMonth`), jadi hasilnya konsisten walau user menambah transaksi untuk tanggal di bulan lain.

## Known Limitations / TODO Potensial
- Recurring engine di backend **tidak** mengecek status anggaran sebelum membuat transaksi otomatis.
- Pembayaran utang/piutang (`payDebt`) juga **tidak** melewati pengecekan anggaran kategori (memang sengaja `categoryId` dikosongkan, jadi tidak relevan — tapi perlu diingat kalau nanti mau dikaitkan ke kategori tertentu).
- Tidak ada autentikasi user — siapa pun yang punya URL Web App bisa membaca/menulis data (mitigasi: jangan sebarkan URL-nya, atau tambahkan secret token check di `doGet`/`doPost` jika perlu).
- `getAllData` mengirim seluruh histori data tanpa pagination — cukup untuk skala personal, tapi perlu diubah (filter by date range di query param) jika volume data sudah sangat besar.
- Tidak ada validasi race condition jika dua device menulis bersamaan (Apps Script + Sheets API pada dasarnya sekuensial per-request, jadi risiko kecil tapi tidak nol).
- Tidak ada reminder/notifikasi push untuk jatuh tempo utang-piutang — status overdue hanya terlihat kalau user membuka aplikasi.

## Cara Modifikasi Kategori Default
Edit array `DEFAULT_CATEGORIES` / `DEFAULT_ACCOUNTS` di `Code.gs` sebelum menjalankan `setup()` — atau edit langsung sheet `Categories`/`Accounts` di spreadsheet kapan saja (kolom `icon` bisa diisi emoji apa pun, tidak dibatasi pilihan di UI).
