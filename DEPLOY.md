# ============================================================
# DEPLOY AMARIS CATERING KE CLOUDFLARE PAGES
# ============================================================
# 1) Login Cloudflare (klik Allow di browser):
npx wrangler login

# 2) Deploy website (URL publik: https://amaris-catering.pages.dev):
npx wrangler pages deploy . --project-name=amaris-catering

# 3) (Opsional) Cek status project:
npx wrangler pages project list
