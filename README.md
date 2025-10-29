<div align="center">
  <picture>
    <img src="./resources/logo-light.svg" alt="Fevela Logo" width="400" />
  </picture>
</div>

---

Fevela is a [Nostr](https://njump.me) social client that gives you back full control of your attention and time with a newsreader-like interface; it promotes exploring of interesting content, over doomscrolling.

Experience Fevela at [https://fevela.me](https://fevela.me)

[![](resources/screenshot.jpg)](https://fevela.me)

## Features

Fevela implements a "grouped notes" design in the feed, typical of the RSS clients, where content is grouped by author, and only the last post is displayed. This prevents very active users from taking up all the space, reducing visibility for others.

You have many other tools to explore your network in a healthy way:

- Pin (fix at the top) and bury (move to bottom) contacts, to not miss any important updates and slow down noisy profiles.

- Filter out notes with specific words, useful to temporarily clean up your feed from uninteresting/excessive content.

- Filter out too short notes, that contain only one word, emoji or are shorter than 10 characters to clean up fast and useless replies.

- Limit replies to first level ones, to increase the signal.

- Hide users that post more than X in the set timeframe.

You can choose the compact mode (default), or an "expanded" one, more similar to the usual social feeds.

## Run Locally

```bash
# Clone this repository
git clone https://github.com/dtonon/fevela.git

# Go into the repository
cd fevela

# Install dependencies
npm install

# Run the app
npm run dev
```

## Run Docker

```bash
# Clone this repository
git clone https://github.com/dtonon/fevela.git

# Go into the repository
cd fevela

# Run the docker compose
docker compose up --build -d
```

After finishing, access: http://localhost:8089

## Credits

Fevela is a fork of the great [Jumble](https://github.com/CodyTseng/jumble)

## Donate

If you like this project, you can buy me a coffee :)

- **Lightning:** ⚡️ tips@dtonon.com ⚡️
- **Bitcoin:** bc1qm6ttjjlq7zqwqmtzq3lqzujr3c9cr53l6097pt

## License

MIT
