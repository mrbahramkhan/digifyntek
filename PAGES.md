# GitHub Pages setup

## Enable (one time on GitHub)

1. Open https://github.com/mrbahramkhan/digifyntek/settings/pages  
2. **Build and deployment → Source** = **GitHub Actions**  
3. Save

## After push

Workflow **Deploy GitHub Pages** runs on every `main` push.

Site URL:

**https://mrbahramkhan.github.io/digifyntek/**

## Important

| Works on Pages | Does not work on Pages |
|----------------|------------------------|
| Login UI, layout, static flows | MySQL, Node API, real login data |
| Logo, navigation, design demo | JWT auth against live DB |

For full app, run API on a server and:

```js
localStorage.setItem('DIGIFYNTEK_API_BASE', 'https://api.yourdomain.com')
```

Then refresh the Pages site.
