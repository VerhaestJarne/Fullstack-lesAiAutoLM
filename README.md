# 👁️ WakkerWacht – oogcoach met Teachable Machine

**Track:** D – Eigen idee (verwant aan A – Ergonomiecoach)
**Live (smartphone):** https://verhaestjarne.github.io/Fullstack-lesAiAutoLM/
**Repository:** https://github.com/VerhaestJarne/Fullstack-lesAiAutoLM
**Demo-video:** _(link invullen)_

WakkerWacht herkent via de frontcamera van je smartphone of je **ogen open** of **dicht** zijn:

- ✅ **Punten** zolang je gefocust (ogen open) voor je scherm zit, per interval (10 s demo / 1 min / 5 min) bij een zekerheid ≥ drempel (standaard **90%**).
- 🚫 **Ogen dicht = nooit punten:** focustijd telt enkel als de stabiele toestand én de huidige frame "open" zijn. Zodra je ogen (stabiel) dicht zijn, vervalt het lopende interval. Pauzes geven geen punten.
- ⏰ **Alarm** (geluid + trillen) als je ogen langer dan 3 s dicht zijn → −5 punten en je reeks wordt gereset.
- ☕ **Pauzemelding (20-20-20-regel):** na 20 min focus moet je 20 s wegkijken of je ogen sluiten.
- 📼 **Sessies terugkijken:** per sessie een tijdlijn (1 sample/seconde: open / dicht / onzeker / geen gezicht) met markeringen voor punten en alarmen.
- 🏆 **Scorebord** opgeslagen in **Supabase** (of lokaal als fallback).
- 🧪 **Testmodus + modelvergelijking:** houd "ogen OPEN/DICHT" ingedrukt; de app telt per frame juist/fout → verwarringsmatrix en nauwkeurigheid per model.

## Hoe starten

### Op je smartphone
Open de live link, geef cameratoegang, vul je naam in en tik op **▶ Start camera**. Zet het volume aan voor het alarm.

### Lokaal
De camera vereist HTTPS of `localhost`:

```powershell
npx serve .
```

Open daarna http://localhost:3000.

### Zelf hosten (GitHub Pages)
1. Push naar GitHub.
2. Repository → **Settings → Pages** → *Deploy from a branch* → `main` / `(root)`.
3. Open `https://<gebruiker>.github.io/Fullstack-lesAiAutoLM/` op je gsm.

### Backend (Supabase, optioneel)
1. Maak een gratis project op https://supabase.com.
2. SQL Editor → plak en run [`supabase/schema.sql`](supabase/schema.sql).
3. Project Settings → API → kopieer **Project URL** en **anon public key** naar [`js/config.js`](js/config.js).
   De anon key is publiek bedoeld; Row Level Security laat enkel *insert* en *select* toe.

Zonder config draait de app in **lokale modus** (localStorage), herkenbaar aan de badge rechtsboven.

## Projectstructuur

| Pad | Inhoud |
|---|---|
| `index.html` | UI |
| `js/app.js` | camera, voorspelling, spelregels, geluid, testmodus |
| `js/config.js` | Supabase-sleutels, modellen, drempels en regels |
| `js/storage.js` | Supabase / localStorage |
| `model-image-v4/` | **v4 (standaard)** – Teachable Machine image-model |
| `model-image-v3/`, `model-image/` | v3 en v2 – eerdere image-modellen (voor vergelijking) |
| `model/` | v1 – Teachable Machine pose-model |
| `supabase/schema.sql` | tabel, RLS-policies en scorebord-view |

## Dataset – hoe ik die maakte

Opgenomen met de webcam in **Google Teachable Machine**, 2 klassen: `ogen open` / `ogen dicht`. Geëxporteerd als TensorFlow.js.

| Versie | Type | Wat veranderde |
|---|---|---|
| v1 | Pose (PoseNet, 257 px) | Eerste poging. Ziet enkel ~17 keypoints, geen oogleden. |
| v2 | Image (MobileNet, 224 px) | Overgestapt naar image-model: ziet de pixels, dus ook de oogleden. |
| v3 | Image | Hertraind: _(wat voegde je toe? bv. meer beelden, ander licht)_ |
| v4 | Image – **standaard** | Hertraind: _(wat voegde je toe?)_ |

| Klasse | # voorbeelden | Wanneer / licht | Variatie |
|---|---|---|---|
| ogen open | _…_ | _bv. daglicht, tl-lamp lokaal_ | _afstand, hoofdhouding, bril_ |
| ogen dicht | _…_ | _…_ | _…_ |

## Privacy – beelden blijven op je toestel

- Het model draait volledig **in de browser** (TensorFlow.js); frames worden enkel in het geheugen naar een `<canvas>` getekend.
- Er wordt **niets geüpload**: geen foto's of video. Naar Supabase gaan enkel naam + getallen (punten, focustijd, alarmen, tijdlijn).

## Waar faalde het model? (3 situaties)

| # | Situatie | Wat gebeurde er | Aanpassing |
|---|---|---|---|
| 1 | Ogen dicht met recht hoofd (pose-model v1) | Voorspelde "ogen open": PoseNet ziet geen oogleden, het model leerde hoofdhouding | Overgestapt op een image-model (v2) |
| 2 | persoon met licht andere huidskleu en ander ligt | bleef twijfelen tussen open en dicht|model meer images met open en dicht gegeven |
| 3 | opnieuw zelf gestest in het gewoon licht | bleef twijfelen tussen open en dicht|model meer images met open en dicht gegeven |

Gemeten met de **testmodus** in de app (nauwkeurigheid voor/na aanpassing).

## Modelvergelijking

| Model  | Nauwkeurigheid | Open ✓ | Dicht ✓ |
|---|---|---|---|
| v1 – pose  | 45 | ja | ja maar in bepaalde omstandigheden |
| v2 – image  | 55 | ja | ja maar in bepaalde omstandigheden, twijfelt sterk |
| v4 – image  | 59 | ja | ja maar in bepaalde omstandigheden, twijfelt sterk |


## Reflectie (max. 200 woorden)
Mijn trigger is "ogen open = punten". De app eist nu al dat een voorspelling 600 ms stabiel blijft boven 90%, maar dat houdt een foto niet tegen. Moeilijker te foppen wordt het met  een derde klasse "foto/scherm" getraind op foto's van foto's,  een controle op natuurlijk knipperen: een echt mens knippert om de paar seconden, een foto nooit,  een model op een uitsnede van enkel de ogen, zodat achtergrond en hoofdhouding minder meetellen.

Bias: de dataset bevat vooral mezelf: één gezicht, één huidskleur, in een paar ruimtes en lichtsituaties, met één camerahoek. Bij andere personen, brillen met reflectie, donkere kamers of een andere hoek daalt de nauwkeurigheid. Meer deelnemers (met toestemming) en meer variatie in licht en camerapositie zouden dit verbeteren.

## ⚠️ AI-verantwoording

| Tool | Waarvoor | Wat paste ik aan |
|---|---|---|
| Google Teachable Machine | Modellen trainen (v1 pose, v2–v4 image) | Eigen dataset opgenomen; na falen van pose overgestapt op image; twee keer hertraind |
| Claude Code (Claude) | Webapp, Supabase-schema, README-opzet, bugfixes | _bv. drempels/intervallen getest en bijgesteld, teksten herschreven, …_ |

**Prompts (samengevat):**
1. De volledige opdracht geplakt + mijn geëxporteerd model + "Ik heb reeds de model gemaakt kun je nu zoals in de opdracht een goed project maken"
2. er mogen geen punten bij ogen dicht, ik wil ook sessies terugkijken.
3. Geluid/alarm werkte niet op iPhone → overgestapt van Web Audio naar `<audio>`-elementen.
4. Screenshot van de foutmelding *"Offset is outside the bounds of the DataView"* op een andere gsm → bug in de aanmaak van de geluiden (afrondingsfout in de buffergrootte) opgelost + cache-busting zodat gsm's de nieuwe versie laden.
5. *"Haal de uitdagingen uit de flow"* → de anti-fop knipper-uitdaging verwijderd, omdat die twijfelt of niet ziet als het open of toe is.

