# Git pe deploy

Repo already initialized on branch `main` with initial commit.

## 1. GitHub / GitLab / Bitbucket pe naya repo banao

Empty repo create karein (README mat add karo agar pehle push kar rahe ho).

## 2. Remote add + push

```bash
cd forge-coop   # ya aapka project path

# GitHub example
git remote add origin https://github.com/YOUR_USER/forge-coop.git

# OR SSH
# git remote add origin git@github.com:YOUR_USER/forge-coop.git

git push -u origin main
```

## 3. Server pe pull (deploy)

```bash
git clone https://github.com/YOUR_USER/forge-coop.git
cd forge-coop
cp backend/.env.example backend/.env
# edit JWT_SECRET, DB_PASSWORD, CORS_ORIGINS

# Option A — Docker
export JWT_SECRET=$(openssl rand -hex 32)
export DB_PASSWORD=$(openssl rand -hex 16)
docker compose up -d --build
docker compose exec app sh -c "npm run db:init && npm run db:seed-admin -- 'StrongPassword!'"

# Option B — manual
cd backend && npm install
npm run db:init && npm run db:seed-admin -- 'StrongPassword!'
NODE_ENV=production npm start
```

Open: `http://SERVER:4000`

## Important

- `.env` git mein **nahi** jata (gitignore)
- `node_modules` git mein **nahi**
- Secrets kabhi commit mat karo
