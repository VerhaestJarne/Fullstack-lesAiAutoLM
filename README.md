# 👁️ WakkerWacht – oogcoach met Teachable Machine

**Track:** D – Eigen idee (verwant aan A – Ergonomiecoach)
**Live:** https://verhaestjarne.github.io/Fullstack-lesAiAutoLM/
**Demo-video:** _(link invullen)_

WakkerWacht herkent via de frontcamera van je smartphone of je **ogen open** of **dicht** zijn:

- ✅ **Punten** zolang je gefocust (ogen open) voor je scherm zit, per interval (10 s demo / 1 min / 5 min) bij een zekerheid ≥ drempel (standaard **90%**).
- 🚫 **Ogen dicht = nooit punten:** focustijd telt enkel als de stabiele toestand én de huidige frame "open" zijn. Zodra je ogen (stabiel) dicht zijn, vervalt het lopende interval. Pauzes en uitdagingen geven geen punten.
- ⏰ **Alarm** (geluid + trillen) als je ogen langer dan 3 s dicht zijn → −5 punten en je reeks wordt gereset.
- ☕ **Pauzemelding (20-20-20-regel):** na 20 min focus moet je 20 s wegkijken of je ogen sluiten.
- 🛡️ **Anti-foppen:** elke 90 s een *knipper-uitdaging* (ogen 1 s dicht, dan weer open binnen 8 s). Een foto kan niet knipperen → bij falen worden punten geblokkeerd.
- 📼 **Sessies terugkijken:** per sessie een tijdlijn (1 sample/seconde: open / dicht / onzeker / geen gezicht) met markeringen voor punten en alarmen, plus een lijst van alle gebeurtenissen.
- 🏆 **Scorebord** opgeslagen in **Supabase** (of lokaal als fallback).
- 🧪 **Testmodus + modelvergelijking:** houd "ogen OPEN/DICHT" ingedrukt; de app telt per frame juist/fout → verwarringsmatrix en nauwkeurigheid per model.

## Hoe starten

### Lokaal
De camera vereist HTTPS of `localhost`:

```powershell
npx serve .
```

Open daarna http://localhost:3000.

### Smartphone (GitHub Pages)
1. Push naar GitHub.
2. Repository → **Settings → Pages** → *Deploy from a branch* → `main` / `(root)`.
3. Open `https://<gebruiker>.github.io/Fullstack-lesAiAutoLM/` op je gsm en geef cameratoegang.

### Backend (Supabase)
1. Maak een gratis project op https://supabase.com.
2. SQL Editor → plak en run [`supabase/schema.sql`](supabase/schema.sql).
3. Project Settings → API → kopieer **Project URL** en **anon public key** naar [`js/config.js`](js/config.js).
   De anon key is publiek bedoeld; Row Level Security laat enkel *insert* en *select* toe (geen update/delete).

Zonder config draait de app in **lokale modus** (localStorage), herkenbaar aan de badge rechtsboven.

## Projectstructuur

| Pad | Inhoud |
|---|---|
| `index.html` | UI |
| `js/app.js` | camera, voorspelling, spelregels, testmodus |
| `js/config.js` | Supabase-sleutels, modellen, drempels en regels |
| `js/storage.js` | Supabase / localStorage |
| `model-image/` | **v2 (standaard)** – Teachable Machine image-model (TF.js, 224 px) |
| `model/` | v1 – Teachable Machine pose-model (TF.js) |
| `supabase/schema.sql` | tabel, RLS-policies en scorebord-view |

## Dataset

Twee modellen, telkens 2 klassen `ogen open` / `ogen dicht`:

- **v1 – Pose** (PoseNet MobileNetV1, 257 px): ziet enkel ~17 keypoints, **geen oogleden**. Herkende in de praktijk vooral hoofdhouding → ogen dicht met recht hoofd gaf "open".
- **v2 – Image** (MobileNet, 224 px) – **standaard**: ziet de pixels van het camerabeeld en dus ook de oogleden.

| Klasse | # voorbeelden | Wanneer / licht | Variatie |
|---|---|---|---|
| ogen open | _…_ | _bv. ochtend daglicht, avond lamp_ | _afstand, hoofdhouding, bril_ |
| ogen dicht | _…_ | _…_ | _…_ |

_(Vul aan: minstens 30 per klas, verschillende momenten en lichtomstandigheden.)_

## Privacy – beelden blijven op je toestel

- Het model draait volledig **in de browser** (TensorFlow.js); frames worden enkel in het geheugen naar een `<canvas>` getekend.
- Er wordt **niets geüpload**: geen foto's, video of keypoints. Naar Supabase gaan enkel naam + getallen (punten, focustijd, alarmen…).
- Bij het trainen gebruikte ik enkel beelden van mezelf (met toestemming van wie meedeed aan de demo).

## Waar faalde het model? (3 situaties)

| # | Situatie | Wat gebeurde er | Aanpassing |
|---|---|---|---|
| 1 | Ogen dicht met recht hoofd (pose-model v1) | Voorspelde "ogen open": PoseNet ziet geen oogleden, model leerde hoofdhouding | Overgestapt op een image-model (v2) |
| 2 | _bv. donkere kamer / tegenlicht / andere persoon / bril_ | _…_ | _…_ |
| 3 | _bv. foto van een foto op een scherm_ | _…_ | _knipper-uitdaging toegevoegd_ |

Gebruik de **testmodus** in de app om per situatie de nauwkeurigheid te meten (voor/na aanpassing).

## Modelvergelijking

Kies in de app het model (v2 image of v1 pose), start, en gebruik de testmodus met dezelfde situaties. De tabel "Modelvergelijking" toont beide naast elkaar. Extra modellen voeg je toe in `MODELS` in `js/config.js` (`type: "image"` of `"pose"`).

Tip: train een 3e klasse `geen persoon` (lege stoel/kamer) – de app herkent dat label automatisch en geeft dan geen alarm als je wegloopt.

| Model | Frames | Nauwkeurigheid | Open ✓ | Dicht ✓ |
|---|---|---|---|---|
| v1 – pose | _…_ | _…_ | _…_ | _…_ |
| v2 – image | _…_ | _…_ | _…_ | _…_ |

## Reflectie (max. 200 woorden)

_Concept – pas aan naar je eigen ervaring:_

Een pose-model kijkt niet naar pixels van de oogleden maar naar ~17 keypoints (neus, ogen, oren, schouders…). "Ogen dicht" wordt dus waarschijnlijk herkend via afgeleide signalen zoals een licht gekanteld hoofd of een lagere zekerheid op de oog-keypoints. Dat maakt de trigger fopbaar: wie zijn hoofd net zo houdt, krijgt punten met de ogen dicht, en een stilstaande foto geeft een stabiele "open"-voorspelling. Daarom eis ik (1) dat neus en beide ogen zichtbaar zijn, (2) dat een voorspelling 600 ms stabiel blijft boven 90%, en (3) een willekeurige knipper-uitdaging die een foto niet kan uitvoeren. Nog moeilijker te foppen: een image-model op een uitsnede van de ogen, een derde klasse "geen persoon/foto", of de uitdagingen op willekeurige tijdstippen laten vallen.

Bias: de dataset bevat vooral één persoon (ikzelf), één huidskleur, met/zonder bril, in een paar kamers en lichtsituaties. Bij andere gezichten, brillen met reflectie, donkere omgevingen of een andere camerahoek daalt de nauwkeurigheid. Meer deelnemers (met toestemming) en meer lichtvariatie zouden dit verbeteren.

## ⚠️ AI-verantwoording

| Tool | Waarvoor | Wat paste ik aan |
|---|---|---|
| Google Teachable Machine | Modellen trainen (v1 pose, v2 image; 2 klassen) | Eigen dataset opgenomen; na falen van pose overgestapt op image |
| Claude Code (Claude Opus) | Webapp, Supabase-schema, README-opzet gegenereerd | _bv. drempels/intervallen getest en bijgesteld, teksten herschreven, …_ |

Prompt (samengevat): de volledige opdracht "Campus Quest – train je eigen AI-checkpoint" geplakt + mijn geëxporteerd model, met de vraag *"Ik heb al mijn AI-model, maak nu de rest"*.
_Vul aan: welke vervolgprompts, wat werkte niet, wat heb je zelf veranderd en waarom._
