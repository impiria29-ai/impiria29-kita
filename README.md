# Impiria29 Kita

Static, mobile-first community app for Taman Anggerik Permai 1. GitHub Pages deployment uses the workflow in `.github/workflows/pages.yml` and publishes only `site/`.

## Deploy

1. Create a GitHub repository. GitHub Free requires a public repository for Pages. The site itself is public, while resident access is controlled by Supabase Auth and database policies.
2. Push this folder to the repository's `main` branch.
3. In **Settings → Pages**, choose **GitHub Actions** as the source.
4. Wait for the **Deploy to GitHub Pages** workflow to finish. The Pages URL appears in the workflow deployment output.
5. In Supabase **Authentication → URL Configuration**, set **Site URL** to the Pages URL and add it under allowed redirect URLs.

No build step is required. The Supabase publishable key in `site/supabase-config.js` is browser-facing by design; never add a secret/service-role key. Do not put resident records in the repository. The database starts empty and contains no live household list.

See `supabase/SETUP.md` to create the first admin and approve resident accounts.

