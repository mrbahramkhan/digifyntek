# GitHub Pages — fix 404

## Recommended (works without Actions permissions)

1. Open: https://github.com/mrbahramkhan/digifyntek/settings/pages  
2. **Build and deployment → Source** = **Deploy from a branch**  
3. Branch: **main**  
4. Folder: **/docs**  
5. Save  

Wait 1–2 minutes, then open:

**https://mrbahramkhan.github.io/digifyntek/**

## Optional: GitHub Actions source

1. Same Pages settings page  
2. Source = **GitHub Actions**  
3. Re-run failed workflow under Actions tab  

If Actions deploy fails with “Get Pages site” / 404, use **branch /docs** method above first.
