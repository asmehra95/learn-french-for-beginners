# Push Learn French for Beginners to GitHub

Run these commands in your terminal, in order:

## 1. Authenticate the GitHub CLI

```sh
gh auth login
```

Follow the prompts — choose **GitHub.com**, **HTTPS**, and authenticate via browser.

## 2. Create the repo and push (first time)

If the repo `learn-french-for-beginners` does **not** exist yet under your account:

```sh
cd learn-french-for-beginners   # or wherever you placed the repo folder
gh repo create learn-french-for-beginners \
  --public \
  --source=. \
  --remote=origin \
  --push \
  --description "Free, open-source French learning suite for English speakers"
```

## 3. Push to an existing repo (if you already created it)

If the repo already exists at https://github.com/asmehra95/learn-french-for-beginners, run:

```sh
cd learn-french-for-beginners   # or the folder name you used
git remote add origin https://github.com/asmehra95/learn-french-for-beginners.git
# or, if origin already exists:
# git remote set-url origin https://github.com/asmehra95/learn-french-for-beginners.git
git push -u origin main
```

## 4. Enable GitHub Pages

After the push succeeds:

1. Open https://github.com/asmehra95/learn-french-for-beginners
2. Go to **Settings → Pages**
3. Under **Source**, select **GitHub Actions**
4. Save — Pages will deploy within a couple of minutes

Your site will be live at: **https://asmehra95.github.io/learn-french-for-beginners/**
