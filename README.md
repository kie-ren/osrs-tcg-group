# OSRS TCG Group Collection

A Chrome extension for comparing OSRS TCG cards, duplicates, and foils across a group of players.

## What it does

- Adds players from public album URLs such as `https://osrs-tcg.net/album/tcgoonbigboy`.
- Follows every page of the public API automatically.
- Separates current and migrated beta card variants.
- Imports `RLTCG_v2` and `RLTCG_v3` RuneLite `.save` files locally.
- Uses the full legacy save for beta counts when available, preserving historical copies omitted by migration.
- Highlights normal duplicates and foils in the group table.
- Opens as a full-page dashboard in its own Chrome tab.
- Records normal or foil beta-card movements between players without changing the source imports.
- Keeps reversed movements in an auditable trade history.
- Exports a copyable, comma-separated list of every unique foil card in the group.
- Displays the comparison in paginated sets of 200 cards.
- Exports a formatted `.xlsx` workbook with group and source sheets.
- Exports/imports a small player profile so a friend only needs to share their static beta data once.

No passwords, browser cookies, or OSRS TCG access tokens are read or stored.

## Full-page dashboard

Open the extension popup and click **Open full screen**. The dashboard opens as a normal Chrome tab and can be bookmarked once open.

The full-page comparison table is twice the height of the popup table. Use **Previous** and **Next** to move through 200 cards at a time.

## Copy the group foil list

Click **Export** beside the Foils total. The extension generates one alphabetically sorted, comma-separated list of unique foil card names. Click **Copy list** to place it on the clipboard.

## Record a beta trade

1. Add both players to the group.
2. In **Beta trades**, choose the sender and receiver.
3. Choose a card, normal/foil beta variant, and quantity.
4. Click **Record trade**.

The movement is applied on top of the original save/API snapshots. Syncing a public album or reimporting a save does not delete the movement history. Use **Reverse** to restore the counts while retaining an audit record. Excel exports include a **Trade History** sheet.

## Install in Chrome on Windows

If you downloaded the project ZIP:

1. Right-click the ZIP and select **Extract All**.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted `.output\chrome-mv3` folder.
6. Pin **OSRS TCG Group Collection** to the toolbar.

Do not select the outer project folder or the Chrome ZIP stored inside `.output`; Chrome needs the unpacked `chrome-mv3` directory.

## Update without losing local data

Chrome stores players, imported beta collections, and trade history separately from the project files. However, an unpacked extension should continue loading from the same directory path to retain the same extension identity.

For a downloaded update:

1. Keep the existing extension installed.
2. Make a backup copy of the existing project folder.
3. Extract the new project ZIP somewhere temporary.
4. Copy the new project contents into the existing project folder.
5. Choose **Replace the files in the destination** when Windows asks.
6. Open `chrome://extensions` and click **Reload** on the extension.
7. Confirm the displayed version number has changed.

Do not remove the extension, click **Load unpacked** from a different directory, or rename/move its existing directory before updating.

If the project is managed through Git instead, update it in the same directory:

```bash
git pull
npm install
npm test
npm run build
```

Then click **Reload** in `chrome://extensions`.

## Build from source

```bash
npm install
npm run build
```

The generated extension is written to `.output/chrome-mv3`.

## Use it with friends on different PCs

Each friend does this once:

1. Add their public OSRS TCG album.
2. Click **Import beta save** and select their old `tcg.save` file.
3. Click **Export profile** and send the resulting JSON file to the group organiser.

The organiser clicks **Import profiles**. From then on, **Sync all** refreshes every player's new cards directly from their public album. The shared profile only contains normalised beta card counts and the public album name.

If a player does not have their old save, the public album's migrated beta cards are used as a fallback. The migration retains many beta copies, but it may not preserve every historical copy.

## Future shared trade syncing

Beta movements are stored as independent ledger records containing a trade ID, card name, sender, recipient, variant, quantity, creation time, and optional reversal time. This structure is intentionally separate from imported/API snapshots, making it suitable for later upload to a shared database without changing the collection calculations.

## Commands

```bash
npm run dev       # Start WXT development mode
npm run compile   # Type-check
npm test          # Run unit tests
npm run build     # Build the Chrome extension
npm run zip       # Produce an installable source package
```

## Data merge rule

For each player:

```text
combined collection = current public API cards
                    + full legacy save beta cards (when imported)
```

When a legacy save is not imported, public API beta cards are used instead. Public beta and local beta are never added together, so migrated cards are not double-counted.
