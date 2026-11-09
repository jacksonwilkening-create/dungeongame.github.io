PIXEL DUNGEON - GITHUB PAGES SETUP

This is the source code exported from Figma Make, with a GitHub Actions workflow added to build and publish it.

IMPORTANT ABOUT THE WEBSITE ADDRESS:
The GitHub account shown in your screenshot is jacksonwilkening-create, while the repository is named dungeongame.github.io. With this account/repository combination, the Pages address will be:
https://jacksonwilkening-create.github.io/dungeongame.github.io/
It will NOT be https://dungeongame.github.io unless the GitHub account or organization is named dungeongame and owns a repository named dungeongame.github.io.

UPLOAD:
1. Extract this ZIP on your computer.
2. Open the extracted folder.
3. Upload the CONTENTS of this folder to the root of your existing GitHub repository (not the outer folder itself).
4. Include the .github folder and its workflows/deploy.yml file. This workflow is what builds the React/Vite source and publishes the finished site.
5. Commit the upload to the main branch.
6. In GitHub, open Settings > Pages. Under Build and deployment, choose GitHub Actions if it is not already selected.
7. Open the Actions tab and wait for "Deploy Pixel Dungeon to GitHub Pages" to finish successfully.

Do not upload the ZIP itself. GitHub Pages cannot run the React/TypeScript source directly; the included workflow builds it first.
