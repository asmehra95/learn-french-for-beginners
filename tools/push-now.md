# Push Say it in French to GitHub

Run these commands in your terminal, in order:

## 1. Authenticate the GitHub CLI

```sh
gh auth login
```

Follow the prompts — choose **GitHub.com**, **HTTPS**, and authenticate via browser.

## 2. Create the repo and push (first time)

If the repo `say-it-in-french` does **not** exist yet under your account:

```sh
cd say-it-in-french   # or wherever you placed the repo folder
gh repo create say-it-in-french \
  --public \
  --source=. \
  --remote=origin \
  --push \
  --description "Free, open-source French learning suite for English speakers"
```

## 3. Push to an existing repo (if you already created it)

If the repo already exists at https://github.com/asmehra95/say-it-in-french, run:

```sh
cd say-it-in-french   # or the folder name you used
git remote add origin https://github.com/asmehra95/say-it-in-french.git
# or, if origin already exists:
# git remote set-url origin https://github.com/asmehra95/say-it-in-french.git
git push -u origin main
```

## 4. Enable GitHub Pages

After the push succeeds:

1. Open https://github.com/asmehra95/say-it-in-french
2. Go to **Settings → Pages**
3. Under **Source**, select **GitHub Actions**
4. Save — Pages will deploy within a couple of minutes

Your site will be live at: **https://asmehra95.github.io/say-it-in-french/**
