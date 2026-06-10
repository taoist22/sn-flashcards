# Flashcards for Supernote

Flashcards is a beta spaced-repetition flashcard plugin for Supernote Nomad and Manta. It lets you create decks, add cards manually, turn lassoed handwriting into question/answer cards with OCR, study with FSRS scheduling, and move basic text cards between the plugin and Anki Desktop.

> **Beta notice:** This plugin is built for Supernote's beta plugin system and beta development OS. Keep backups of important decks, expect occasional rough edges, and test new workflows with a small deck before relying on them heavily.

## Features

- Create, select, and delete decks
- Add flashcards manually
- Add flashcards from handwritten notes with the lasso toolbar
- Review cards with a temporary editable guess box
- Schedule reviews with FSRS
- View basic deck stats
- Import basic Anki Desktop plain text exports
- Export decks back to Anki-compatible plain text

## Installation

1. Download `Flashcards.snplg` from the latest GitHub release.
2. Copy `Flashcards.snplg` into the `MyStyle` folder on your Supernote.
3. On the Supernote, open **Manage Plugins**.
4. Add/install the plugin from `MyStyle`.
5. Open a note and tap the plugin icon to launch **Flashcards**.

## Creating Decks

1. Open **Flashcards** from the plugin menu.
2. On the **Decks** screen, enter a deck name.
3. Tap **Create Deck**.
4. Tap a deck to open it.

Each deck shows total cards, due cards, reviews completed today, and total reviews.

## Creating Flashcards

There are two ways to create cards.

### Manual Cards

1. Open a deck.
2. Tap **Add Manually**.
3. Enter the question.
4. Enter the answer.
5. Choose the target deck.
6. Tap **Add Flashcard**.

### Handwritten Cards With Lasso OCR

1. In a Supernote note, write the question on one line.
2. Write the answer on the line below it.
3. Lasso both handwritten lines together.
4. Tap **Add Flashcard** in the lasso toolbar.
5. The plugin OCRs the top line as the question and the lower line as the answer.
6. Edit the recognized text if needed.
7. Choose the target deck.
8. Tap **Add Flashcard**.

For best OCR results, keep the question and answer on separate horizontal lines with a little vertical space between them.

## Studying Cards

1. Open a deck.
2. Tap **Study Due** or **Study**.
3. Read the question.
4. Use the editable **Guess** box to type or handwrite your answer.
5. Tap **Show Answer**.
6. Rate your recall:
   - **Again**
   - **Hard**
   - **Good**
   - **Easy**

The guess is temporary. It is cleared when you reveal the answer or move to the next card, and it is never saved.

## Editing Cards

1. Open a deck.
2. Tap a card in the card list.
3. Edit the question, answer, or deck.
4. Tap **Save Changes**.

Deleting a card removes it from the plugin and also removes its local review history.

## Anki Import

The plugin supports basic text cards from Anki Desktop. It does not import `.apkg`, `.colpkg`, media, tags, note types, cloze behavior, or Anki scheduling.

### Export From Anki Desktop

In Anki Desktop:

1. Select the deck.
2. Choose **Export**.
3. Select **Notes in Plain Text (.txt)**.
4. Recommended options:
   - **Include deck name:** enabled
   - **Include unique identifier:** enabled
   - **Include HTML and media references:** disabled
   - **Include tags:** disabled
   - **Include note type name:** disabled
5. Save the `.txt` file.

### Put the File on Supernote

Copy the Anki `.txt` export into this folder on the Supernote:

```text
EXPORT/sn-flashcards
```

If the folder does not exist yet, open **Flashcards**, tap **Import Anki Text**, and the plugin will create/show the folder path.

### Import Into Flashcards

1. Open **Flashcards**.
2. Open any deck.
3. Tap **Import Anki Text**.
4. Confirm the displayed import folder.
5. Put the Anki `.txt` file there if it is not already present.
6. Tap **Refresh**.
7. Tap the file name.

The plugin reads Anki's `#guid column` and `#deck column` metadata. It creates the deck if needed, adds new cards, updates changed cards with matching GUIDs, and skips unchanged duplicates. Plugin FSRS scheduling stays independent from Anki.

## Anki Export

1. Open the deck in **Flashcards**.
2. Tap **Export Deck**.
3. The plugin writes an Anki-compatible text file to Supernote's `EXPORT` folder.

The export uses Anki-style metadata:

```text
#separator:tab
#html:false
#guid column:1
#deck column:2
```

When importing the exported file into Anki Desktop, map the two card fields as front/back. If Anki offers an option to update existing notes, choose it so the GUID column can prevent duplicates.

## Current Limitations

- Basic question/answer text cards only
- No direct `.apkg` or `.colpkg` import
- No media/audio/image import
- No cloze support yet
- No Anki scheduling or stats import
- Large decks may be slow because the plugin currently stores cards in a JSON database

Recommended deck size for this beta is under about 1,000 simple text cards. Larger decks may work, but should be tested carefully.

## Building From Source

### Prerequisites

- Node.js 18+
- npm
- Android/JDK setup compatible with the Supernote plugin template

### Build

```bash
npm install
./buildPlugin.sh
```

The plugin package is written to:

```text
build/outputs/Flashcards.snplg
```

If you rename the package, clear old files from `build/generated/` before rebuilding. The Supernote plugin loader can pick up stale bundles if multiple bundle files are present.

## Development Notes

- The original stable base plugin is tagged as `working-flashcard-plugin-base`.
- The first beta with Anki text import/export is tagged as `v0.1.0-beta`.
- Persistent plugin data is stored locally on the device by a small native storage module.
- FSRS scheduling is handled inside the plugin using `ts-fsrs`.

## License

MIT
