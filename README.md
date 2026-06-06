# ❄️ Fagyasztó készletkezelő

Egyszerű webapp a fagyasztóban lévő készlet nyomon követésére: bevételezés és
kivételezés fénykép alapján, beállítható tárhelyekkel és böngészhető katalógussal.

## Funkciók

- **Bevételezés**: termékfotó + címkefotó készítése, név, darabszám és tárhely megadása
- **Kivételezés**: tétel kiválasztása fotó/név alapján, mennyiség csökkentése
- **Beállítások**: a fagyasztóban választható tárhelyek (pl. polcok, fiókok) kezelése
- **Katalógus**: készleten lévő tételek böngészése kép és név alapján
- Egyszerű jelszavas védelem (egy közös jelszó az egész apphoz)

## Technológia

- Node.js + Express, statikus HTML/CSS/JS frontend
- SQLite (Node beépített `node:sqlite` modulja, nincs natív build függőség)
- Multer a fényképfeltöltéshez, helyi fájlrendszeren tárolva

## Helyi futtatás

```bash
npm install
npm run dev
```

Az app a `http://localhost:3000` címen érhető el. Alapértelmezett jelszó: `jegesmedve`
(felülírható a `APP_PASSWORD` környezeti változóval).

## Railway deploy

1. Hozz létre egy GitHub repót, push-old fel ezt a projektet
2. Railway → New Project → Deploy from GitHub repo
3. Állítsd be a környezeti változókat:

   | Változó | Érték |
   |---|---|
   | `APP_PASSWORD` | a belépéshez használt jelszó |
   | `SESSION_SECRET` | egy hosszú, véletlen string |
   | `DATA_DIR` | `/data` (lásd lentebb a volume beállítást) |

4. **Volume hozzáadása** (fontos, különben a feltöltött képek és az adatbázis
   minden újradeploynál elvesznek):
   - Railway service → Settings → Volumes → Add Volume
   - Mount path: `/data`
   - Ez a mappa tárolja az SQLite adatbázist (`stock.db`) és a feltöltött
     fényképeket (`uploads/`)
5. Generate Domain → az app elérhető lesz a kapott URL-en

## Adatszerkezet

- `locations` – a beállításokban felvehető tárhelyek
- `products` – termékek: név, mennyiség, tárhely, termékfotó, címkefotó

Bevételezéskor, ha már létezik azonos nevű tétel ugyanazon a tárhelyen, a
mennyiség hozzáadódik a meglévőhöz; egyébként új tétel jön létre.
