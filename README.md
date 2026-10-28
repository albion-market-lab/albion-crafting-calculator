# Albion Crafting Calculator

> Mesin perhitungan multi-item crafting **Albion Market Lab**. Status: **fondasi material dan estimasi buy order dari snapshot harga pribadi tersedia**.

Library ini berisi **logika murni**, tidak bergantung langsung pada UI, Google Sheets, API, atau database. Data katalog dan snapshot harga diberikan sebagai input.

## Implementasi tahap pertama

Fondasi TypeScript saat ini menyediakan:

- resolver item serta resep crafting/refining dari katalog yang disuntikkan;
- kalkulasi multi-target, agregasi material, recursive refining, dan pembulatan berdasarkan `outputQuantity`;
- crafting output, refining plan, shopping list terminal, dan warning terminal material;
- error terstruktur untuk input/katalog invalid, ID item hilang, resep hilang, dan circular dependency.

Calculator menerima kontrak `CatalogData` v3 dengan `terminalStatus: terminal | requires_recipe | unknown | unsupported` dan metadata tambahan dari importer. Hanya `terminal` dengan `purchasable: true` yang masuk shopping list. Status yang bertentangan dengan flag tersebut atau keberadaan recipe ditolak sebagai `INVALID_CATALOG`.

```ts
import { assertCatalogDataV3, assertCatalogManifestV3, calculateMaterials } from "@albion-market-lab/crafting-calculator";

assertCatalogDataV3(catalogJson);
assertCatalogManifestV3(manifestJson, catalogJson); // manifest.json tetap artefak terpisah

const result = calculateMaterials({
  targets: [{ itemId: "VALID_CATALOG_ITEM_ID", quantity: 10 }],
  catalog: catalogJson,
});
```

Policy material tanpa refining recipe:

- `terminal` → shopping list;
- `requires_recipe` → `REFINING_RECIPE_NOT_FOUND`;
- `unknown` → `UNKNOWN_MATERIAL`;
- `unsupported` → `UNSUPPORTED_MATERIAL`.

Error material menyertakan `itemId`, `terminalStatus`, dan `reason` untuk UI. Calculator tidak mengubah item ID/quantity dan tidak mengimplementasikan ulang importer.

Fixture unit test memakai ID dan rasio sintetis untuk menguji aritmetika. Fixture tersebut bukan data atau resep Albion.

## Estimasi buy order

`estimateBuyOrders` adalah pure function terpisah dari kalkulasi material. Fungsi ini hanya menerima shopping list dan snapshot harga sebagai argumen; tidak melakukan HTTP atau membaca Sheets.

```ts
import { estimateBuyOrders } from "@albion-market-lab/crafting-calculator";

const estimate = estimateBuyOrders({
  shoppingList: [{ itemId: "T4_ORE", quantity: 10 }],
  prices,
  asOf: "2026-10-28T06:00:00Z",
  staleAfterHours: 6,
  bidIncrement: 1,
});
```

Hanya snapshot `server: "East/Asia"`, quality yang sama (default `1`), item ID persis termasuk suffix enchantment, dan lima Royal City yang dipakai. Harga BUY nol/kosong atau timestamp invalid menjadi `missing`. Data stale tetap ditampilkan, tetapi coverage menjadi `partial` dan kota saran tidak diklaim definitif termurah. Contoh kontrak lengkap tersedia di [`examples/buy-order-estimate.json`](examples/buy-order-estimate.json).

### Menjalankan validasi

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Kebutuhan utama
Pengguna dapat membuat **satu crafting plan berisi banyak target sekaligus**: misalnya 100 unit cloth armor T6, 20 unit plate shoes T5, dan item lain dengan tier/quantity berbeda. Setiap target dipilih menggunakan **ID item nyata** dari [catalog](https://github.com/albion-market-lab/albion-item-catalog).

## Alur kalkulasi
1. Terima daftar `{ itemId, quantity }` (quantity > 0).
2. Ambil resep crafting untuk setiap target.
3. Telusuri resep refining secara **rekursif** sampai bahan terminal/purchasable.
4. Gabungkan bahan yang sama lintas semua target **sebelum** membuat shopping list.
5. Terapkan aturan kuantitas dan pembulatan tiap resep sesuai output per proses; jangan membulatkan total di tempat yang salah.
6. Cocokkan bahan yang harus dibeli dengan snapshot harga lokal dari [receiver](https://github.com/albion-market-lab/albion-market-receiver).
7. Untuk setiap material, rekomendasikan kota BO dari **Bridgewatch, Martlock, Lymhurst, Fort Sterling, Thetford** berdasarkan harga yang tersedia.
8. Kembalikan shopping list per kota, rencana refining, target output crafting, estimasi modal, dan status kelengkapan data.

## Kontrak input/output (rancangan)

```ts
type CraftTarget = { itemId: string; quantity: number };

type MarketPrice = {
  itemId: string;
  city: string;
  quality?: number;
  highestBuyPrice?: number | null;
  highestBuyObservedAt?: string | null;
  lowestSellPrice?: number | null;
  lowestSellObservedAt?: string | null;
};

type CalculationInput = {
  targets: CraftTarget[];
  catalog: CatalogData;          // dari albion-item-catalog
  prices: MarketPrice[];         // snapshot hasil scan pribadi
  staleAfterHours: number;       // konfigurasi, contoh 6
  asOf: string;                  // waktu evaluasi status harga
};
```

Output minimal:
- `craftOutputs`: target equipment dan kuantitas.
- `refiningPlan`: jenis refined material, tier, dan kuantitas yang harus diproses.
- `shoppingList`: material mentah/terminal, quantity, kota usulan, dan dasar harga BO.
- `priceWarnings`: harga **segar / lama / kosong** per item-kota sesuai timestamp.
- `estimatedCapital`: total hanya bila seluruh komponen harga relevan tersedia; jika tidak, tandai **parsial/tidak lengkap**.
- `recipeWarnings`: resep tidak tersedia, material khusus, atau dependensi tidak valid.

## Aturan harga & buy order
- Data harga **hanya hasil collector pribadi**; tidak memanggil AODP Community API.
- Harga lama **tetap boleh ditampilkan** dengan usia dan peringatan.
- Harga kosong **jangan diisi 0**, jangan menghasilkan kepastian kota termurah bila datanya belum lengkap.
- Kandidat harga penawaran BO: `highest_buy_price + 1` silver **sebagai strategi default yang bisa dikonfigurasi**, bukan jaminan order terisi.
- Kandidat kota diurutkan berdasar estimasi harga penawaran valid; ingat bahwa harga antar-kota dengan timestamp berbeda tidak sepenuhnya setara.
- Tidak menebak harga material yang belum pernah discan.

## Yang sengaja tidak dihitung pada MVP
**Resource Return Rate (RRR), Focus, cashback, biaya station, fee/tax, risiko caravan, serta realisasi penjualan Black Market.** Keuntungan pengembalian resource diperlakukan sebagai bonus di luar estimasi dasar. Pemilihan item BM dan eksekusi BO/refine/craft/sell order tetap manual di game.

## Kriteria selesai / unit test wajib
- Multi-target yang berbagi bahan menghasilkan **jumlah gabungan** yang benar.
- Resep refining multi-tier dirunut hingga bahan terminal sesuai resep nyata.
- Output quantity per proses dan pembulatan diuji.
- Harga lama tetap terlihat, harga kosong menghasilkan status *incomplete*, bukan modal salah.
- Saat tak ada kandidat harga lengkap, rekomendasi **tidak mengarang kota**.
- Siklus resep, referensi item hilang, dan resep tidak lengkap menghasilkan error terstruktur.

## Data master yang sudah siap (28 Oktober 2026)

Seed data kini tersedia di Google Sheets proyek:
- `Items`: 11.223 item ID dengan `tier`, `enchantment`, kategori, dan flags resep.
- `Craft Recipes`: 15.325 ingredient rows untuk 6.847 recipe ID equipment.
- `Refining Recipes`: 225 ingredient rows untuk 115 recipe ID standar.
- `Market Prices`: **kosong** sampai hasil scan pribadi masuk lewat receiver.

**Penting untuk implementasi:** `recipe_id` **berulang** untuk setiap bahan dalam satu resep. Kelompokkan baris berdasarkan `recipe_id`; jangan menghitung setiap baris sebagai satu resep/output terpisah. Untuk raw kebutuhan, telusuri `Craft Recipes` → `Refining Recipes` secara rekursif, lalu agregasikan hasil lintas banyak target.

Cakupan master belum 100% dari seluruh game. Jika ID item tidak punya resep, resep tidak tersedia, atau material bertipe khusus (artifact, token, enchanted rock/stone alternatif), **hasilkan warning eksplisit** dan jangan menyamakan unknown dengan 0. Resep yang tercakup berasal dari ekstraksi sekunder, dan perlu validasi patch sebelum dianggap final.

**Sumber harga tetap private-only:** tidak mengambil harga dari API komunitas dan tidak mengunggah hasil scan pribadi ke komunitas. Sheet harga masih kosong hingga receiver diimplementasikan.

## Ekosistem repositori

| Repositori | Tanggung jawab |
| --- | --- |
| [albion-item-catalog](https://github.com/albion-market-lab/albion-item-catalog) | Master data item dan resep crafting/refining |
| [albion-market-receiver](https://github.com/albion-market-lab/albion-market-receiver) | Menerima scan market pribadi dan menyimpan harga ke Google Sheets |
| [albion-crafting-calculator](https://github.com/albion-market-lab/albion-crafting-calculator) | Menghitung kebutuhan bahan, estimasi modal, dan rekomendasi kota BO |
| [albion-crafting-web](https://github.com/albion-market-lab/albion-crafting-web) | Antarmuka untuk merencanakan banyak target crafting |

**Alur:** Albion Online → collector lokal → receiver → Google Sheets → web UI + calculator. Katalog resep berasal dari data game, **bukan** dari Google Sheets.

## Di luar scope
Packet collection, menulis Google Sheets, UI, dan otomasi transaksi di Albion.
