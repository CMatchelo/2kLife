# 2kLife

**Your career. Your decisions. Your legacy.**

2kLife turns a Player Lock save in **NBA 2K MyNBA's Modern Era** into a more complete basketball career, where every performance shapes the player you become and every decision follows you beyond the court.

Create your own prospect, take control of an existing player, or rewrite the career of a legend. Chase records, build your reputation, choose who belongs in your inner circle, negotiate your future, and turn great seasons into a lasting legacy.

## Made to complement your NBA 2K save

2kLife is a local, single-player role-playing companion. It does not connect to NBA 2K or read its save files, so you remain in control of what carries between both experiences. Reproduce accepted moves inside NBA 2K, bring the results back to 2kLife, and use a little imagination to make the two worlds feel like one career.

The project is still in development and testing. Bug reports, ideas, forks, and contributions are welcome.

This project began as a personal idea and was built and refined with AI assistance. You are welcome to fork it, modify it, and run your own version.

2kLife is an unofficial, fan-made project. It is not affiliated with, endorsed by, or sponsored by the NBA, NBA 2K, Take-Two Interactive, Visual Concepts, any NBA team, player, sponsor, or brand shown in the app. All names, logos, and trademarks belong to their respective owners.

![2kLife overview](public/prints/2.png)

## Take control of your career

You decide how the story unfolds. Play each game in NBA 2K, then bring the result into 2kLife to continue your journey:

- Save your box score after every match, enter it manually, or import a screenshot and let your AI provider do the work.
- Bring your NBA 2K calendar with you, game by game or from screenshots, and follow the season one day at a time.
- Watch your averages, personal bests, season records, and full career history grow with every performance.
- Play through injuries, rival matchups, the NBA Cup, the Play-In, and the postseason on your way to a championship.

![Career and calendar](public/prints/3.png)

## Build your name on and off the court

Big games create bigger expectations. Your performances can put you in front of the media, grow your following, and attract brands that want to be part of your rise.

- Face post-game interviews shaped by what just happened on the court.
- Choose whether you want to be known as a superstar, a team-first leader, or a fan favorite.
- Gain or lose followers based on how you play and how you spend your time away from basketball.
- Build relationships with players and teammates, strengthen connections with teams, and carry your reputation from season to season.

![Interviews and personality](public/prints/4.png)

## Turn success into a business

Your play gets brands interested. Your choices determine whether those opportunities become long-term partnerships or disappear for good.

- Earn sponsor offers by reaching performance milestones, growing your audience, and building an identity brands believe in.
- Compare payments, bonuses, appearance commitments, and penalties before you sign.
- Balance sponsor obligations with invitations from teammates, players, fans, and charities on your days off.
- Build your earnings through NBA salary, sponsor deals, appearances, and royalties, with every transaction recorded throughout your career.

<table>
  <tr>
    <td width="50%"><img src="public/prints/5.png" alt="Sponsor overview"></td>
    <td width="50%"><img src="public/prints/7.png" alt="Sponsor details"></td>
  </tr>
</table>

## Decide what happens next

Your time is limited, and every invitation is a choice. Show up for a sponsor, spend the day with a teammate, meet another player, give back to the community, connect with fans—or turn everyone down. You cannot be everywhere, and the relationships you prioritize help define your career.

![Off-day events](public/prints/1.png)

## Put your name on the shoe

Earn a footwear deal, unlock your signature line, and launch a shoe of your own design. Give it a name, bring in the model you created in NBA 2K, and profit from every pair sold. Strong performances and a growing following can turn your launch into an empire.

![Signature shoes](public/prints/6.png)

## Choose where your story continues

When your contract nears its end, the future is yours to decide. Commit to an extension or test free agency. Select the teams you would like to play for, compare their offers, expected role, minutes, salary, and contract length, then choose the next chapter of your career.

Make a run from the Play-In to the Finals, close the year with a complete season review, and return for another season with your records, awards, relationships, sponsors, finances, and signature-shoe history still intact. One save can tell the story of an entire career.

## Planned features

These are ideas still to be implemented on this companion. Feel free to help or give more ideas

- Make player relationships and team affinity affect future career events.
- Use your network to arrange the creation of a super team.
- Add trade discussions and network influence.
- Manage finances, with houses, cars, and luxury items to spend money on.
- Give AI-generated interviews richer previous-season context, including past averages, awards, playoff results, and team history.
- Package the app so anyone can run it without cloning a repository or installing development tools.

## Technology

- React 19
- TypeScript
- Vite 8
- Tailwind CSS 4
- Node.js local HTTP backend
- Built-in `node:sqlite` with a local SQLite database
- Native Node test runner
- oxlint
- Optional Codex CLI or Claude integration for AI-generated content and screenshot extraction

The frontend and backend both run on local machine.

## Requirements

- [Node.js](https://nodejs.org/) 22.18 or newer
- [pnpm](https://pnpm.io/)
- Git, if cloning the repository
- Optional: Codex CLI, Claude Code CLI, or an Anthropic API key for AI features

You can enable pnpm through Corepack if it is not already installed:

```sh
corepack enable
corepack prepare pnpm@latest --activate
```

## Install and run locally

Clone the repository and enter its directory:

```sh
git clone https://github.com/CMatchelo/2kLife.git
cd 2kLife
```

Install the dependencies:

```sh
pnpm install
```

Start the frontend and local backend together:

```sh
pnpm dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173) in a browser.

To run the same development application in its Electron desktop shell:

```sh
pnpm dev:desktop
```

The desktop command starts Vite, starts the existing local backend inside
Electron, and opens the application window. This development milestone still
uses the repository's `.2klife` directory, so existing local careers remain
available in both browser and desktop development modes.

To test the self-contained production runtime without Vite:

```sh
pnpm build
pnpm start:desktop
```

The production runtime serves the compiled frontend and API from one private,
dynamically selected loopback port. It does not require either Vite or the
fixed development ports after the build is complete.

Stop the app with `Ctrl+C`.

Both of these ports must be available for development mode:

- Frontend: `127.0.0.1:5173`
- Backend: `127.0.0.1:4319`

## Local data

The browser development backend creates a `.2klife` directory in the repository.
The Electron desktop app stores the same files in its per-user application-data
directory under `2kLife/data`. On its first desktop launch, it safely copies any
existing repository `.2klife` database, settings, and signature-shoe images when
the corresponding desktop files do not already exist. The original files are
left untouched.

Each active data directory has this layout:

```text
data-directory/
  careers.sqlite
  settings.json
  signature-shoes/
  logs/
```

- Career data is stored in `careers.sqlite`.
- AI-provider selection and test dates are stored in `settings.json`.
- Uploaded signature-shoe images are stored under `signature-shoes/`.
- Electron diagnostic logs are stored under `logs/`.
- AI credentials are not stored in the career database.

Do not commit or share either data directory unless you intentionally want to
share your personal career data.

## AI connection

AI is used for presentation and extraction tasks such as:

- Calendar screenshot import
- Box-score screenshot import
- Postgame interview writing
- Sponsor approach messages
- Sponsor-event descriptions
- Non-sponsor event descriptions
- NBA contract-offer messages

Career rules, rewards, calculations, eligibility, and progression remain controlled by application code. AI output is validated before use, and supported text-generation features provide deterministic fallback copy.

Contract offers do not require a recent AI connection test. If no provider is selected, the provider fails, times out, or returns an invalid structure, the offer remains available with deterministic default team copy.

AI features may consume subscription allowance or separately billed API usage, depending on the selected provider and authentication method.

The Electron app uses an existing Codex or Claude CLI installation and its
saved authentication. On Windows it prefers the provider's native executable,
then falls back to the installed npm package entry using Electron's Node mode.
Provider credentials remain managed by the provider CLI and are not copied into
2kLife's desktop data directory.

### Codex CLI

Install the official Codex CLI and sign in:

```sh
npm install -g @openai/codex
codex login
```

Restart `pnpm dev` after installing the CLI so the backend can find it. Codex must be available in the same operating environment that runs 2kLife. If 2kLife runs in WSL, install and authenticate Codex inside WSL as well.

2kLife invokes `codex exec` locally. Subscription authentication uses the available Codex allowance; API-key authentication uses separate API billing. Credentials remain managed by the Codex CLI and should never be copied into 2kLife.

### Claude Code CLI

Install the official Claude Code CLI and sign in:

```sh
npm install -g @anthropic-ai/claude-code
claude
```

Complete browser sign-in, exit the interactive session, and restart `pnpm dev`. Leave `ANTHROPIC_API_KEY` unset to use Claude Code subscription authentication.

Claude must be available in the same operating environment that runs the backend. Credentials remain managed by Claude Code and should never be pasted into 2kLife.

### Anthropic API key

A Claude subscription does not include Anthropic API usage. This option requires separate API billing.

Copy the example environment file:

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS or Linux:

```sh
cp .env.example .env
```

Edit `.env`:

```dotenv
ANTHROPIC_API_KEY=your_api_key_here
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

Restart the app after changing `.env`. Never prefix backend secrets with `VITE_`, because Vite variables can be exposed to the browser.

When `ANTHROPIC_API_KEY` is present, it takes precedence over Claude Code CLI authentication.

### Select and test a provider

In 2kLife:

1. Open **Connect AI**.
2. Select Codex or Claude.
3. Choose **Check configuration**.
4. Choose **Test connection**.
5. Save the provider you want to use.

Selection does not automatically verify connectivity. Connection tests consume provider allowance or API usage. There is no automatic fallback from one provider to another.

## Production build and preview

Create a production build:

```sh
pnpm build
```

Run the backend and preview server in separate terminals:

```sh
pnpm backend
```

```sh
pnpm preview
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

A static frontend by itself cannot access the local SQLite database or local AI providers.

## Project checks

```sh
pnpm lint
pnpm test
pnpm build
```

Automated tests use temporary or in-memory data and mocked providers. They do not require real AI credentials or consume AI usage.

### Windows and OneDrive troubleshooting

If `pnpm test`, `pnpm lint`, or `pnpm build` fails with `EPERM: operation not permitted` while reading a file under `node_modules/.pnpm`, Windows is denying access to an installed dependency. This is not an application or career-database error.

First close running 2kLife, Node, editor, and terminal processes that may be using `node_modules`, then rebuild the dependencies from the lockfile:

```powershell
pnpm install --force --frozen-lockfile
```

If that cannot repair the disposable dependency directory, remove `node_modules` and run `pnpm install --frozen-lockfile`. If the project is stored in a OneDrive-synced folder and access errors continue, mark the project folder **Always keep on this device** or clone/move the repository to a local, non-synced development folder, reinstall dependencies there, and rerun the checks. Keep `.2klife` backed up before moving an existing working copy because it contains the local career database.

## Project structure

```text
src/                 React frontend
src/career/          Career screens, dialogs, and API client
src/domain/          Shared business rules
src/types/           Shared TypeScript types
src/data/            Static sponsor catalog
server/              Local Node.js backend and SQLite services
server/providers/    Codex and Claude provider adapters
scripts/             Development scripts
spec/                Historical planning documents
.2klife/             Local runtime data, excluded from Git
```

## Security and privacy

- The frontend and backend bind to loopback addresses only.
- The backend validates the request host, origin, client header, and mutation identifiers.
- Career data and uploaded shoe images remain local unless explicitly included in an AI request.
- Calendar screenshots and selected career context are sent to the configured AI provider only when the related feature is used.
- Provider output is validated before it can affect the interface.
- The backend is intended for a trusted, single-user local machine. Do not expose it through a public tunnel.

## License

The original 2kLife source code is available under the [MIT License](LICENSE). You may use, copy, modify, distribute, and fork the code under its terms. Contributions to this repository remain subject to the repository owner's review and approval before they are merged.

The MIT License applies only to the original source code of 2kLife. NBA, NBA 2K, Take-Two Interactive, Visual Concepts, team and player names, logos, sponsor and brand names, trademarks, screenshots, game artwork, and all other third-party materials remain the property of their respective owners and are not licensed under the MIT License.

## Official AI references

- [Codex CLI authentication](https://developers.openai.com/codex/cli/reference)
- [Codex non-interactive execution](https://developers.openai.com/codex/noninteractive)
- [Anthropic API overview](https://platform.claude.com/docs/en/api/overview)
- [Claude models](https://platform.claude.com/docs/en/models/overview)
