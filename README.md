<div align="center">

<img src="assets/banner.svg" alt="Liftrio — antrenamente, nutriție și progres" width="720">

# Liftrio

### Antrenamente. Nutriție. Progres.

Urmărește-ți antrenamentele, mesele și evoluția într-o singură aplicație, optimizată pentru telefon.

[**Deschide Liftrio**](https://open-gym-bay.vercel.app) · [**Vezi codul sursă**](https://github.com/cornaciu/openGym)

<br>

![PWA](https://img.shields.io/badge/PWA-instalabilă-a3e635?style=flat-square)
![React](https://img.shields.io/badge/React-19-38bdf8?style=flat-square&logo=react&logoColor=white)
![Vercel](https://img.shields.io/badge/hosting-Vercel-black?style=flat-square&logo=vercel)
![Supabase](https://img.shields.io/badge/date-Supabase-3ecf8e?style=flat-square&logo=supabase)
![License](https://img.shields.io/badge/licență-AGPL--3.0-blue?style=flat-square)

</div>

---

## Ce poți face

- **Planifica și înregistra antrenamentele**: rutine, exerciții, serii, repetări, greutăți și pauze.
- **Urmări progresul**: istoric, statistici, grupe musculare, recorduri și greutate corporală.
- **Ține evidența nutriției**: calorii, macronutrienți, fibre și sare, cu jurnal alimentar și obiective zilnice.
- **Importa mesele din Eat & Track** și păstra alimentele importate în biblioteca personală.
- **Lucra cu un antrenor**: partajarea datelor și programarea antrenamentelor cu acordul clientului.
- **Continua de pe telefon**: instalează aplicația pe ecranul principal și sincronizează profilul între dispozitive.

Estimările calorice pentru antrenament sunt orientative, nu măsurători medicale.

## Liftrio pe telefon

Deschide aplicația în Safari sau Chrome, apoi alege **Adaugă pe ecranul principal**. Liftrio rulează ca PWA și se deschide într-o fereastră dedicată.

## Dezvoltare și deploy

Interfața este construită cu React și Vite. API-ul folosește Vercel Functions, iar datele conturilor se păstrează în Supabase Postgres.

Pentru configurare și deployment consultă [ghidul Vercel + Supabase](docs/VERCEL.md). Pentru rularea interfeței local:

```bash
npm install --prefix frontend
npm run dev --prefix frontend
```

Build-ul de producție:

```bash
npm run build
```

## Origine și licență

Liftrio este o versiune personalizată, derivată din [openGym de Duarte Santos](https://github.com/DuarteSantos8/openGym). Păstrează licența AGPL-3.0 și atribuirea din [NOTICE.md](NOTICE.md). Codul și contribuțiile din acest repository sunt distribuite conform [LICENSE](LICENSE).

Biblioteca de exerciții folosește [exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset); verifică fișierul NOTICE pentru detalii despre atribuire și licențe.

---

<div align="center">
<sub>Liftrio · construit pentru antrenamente consecvente și progres urmărit clar.</sub>
</div>
