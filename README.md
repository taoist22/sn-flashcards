# Flashcards for Supernote


https://github.com/user-attachments/assets/618ab801-f4fe-4a61-95de-a6d03889f61b


Flashcards is a beta spaced-repetition flashcard plugin for Supernote Nomad and Manta. It lets you create decks, add cards manually, turn lassoed handwriting into question/answer cards with OCR, study with FSRS scheduling, and move basic text cards between the plugin and Anki Desktop.

> **Beta notice:** This plugin is built for Supernote's beta plugin system and beta development OS. Keep backups of important decks, expect occasional rough edges, and test new workflows with a small deck before relying on them heavily.

## Features

- Create, select, and delete decks from the deck list
- Create a needed deck while adding a flashcard
- Link a Supernote note to a default deck
- Optionally add a Supernote keyword when linking a note
- Use linked notes, note keywords, and folder names to suggest the right deck
- Add flashcards manually or from handwritten notes with the lasso toolbar
- Move cards from one deck to another
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

You can create decks before studying or at the moment you are adding a card.

### From the Decks Screen

1. Open **Flashcards** from the plugin menu.
2. On the **Decks** screen, enter a deck name.
3. Tap **Create Deck**.
4. Tap a deck to open it.

Each deck shows total cards, due cards, reviews completed today, and total reviews.

### While Adding a Flashcard

If you are creating a card and the deck you need does not exist yet:

1. Open **Add Flashcard** or use **Add Flashcard** from the lasso toolbar.
2. Enter the new deck name in the **Create Deck** section.
3. If you are inside a note, choose whether to link that note to the new deck or add a Supernote keyword.
4. Tap **Create Deck**.
5. Finish the question and answer.
6. Tap **Add Flashcard**.

This is useful when you are already in a note and discover that the right deck has not been created yet.

## Note Links and Default Decks

Flashcards can make the current note suggest the right deck automatically. This is useful when, for example, Biology notes should usually add cards to the Biology deck.

The plugin checks for a suggested deck in this order:

1. A saved note link created from the **Note Link** section.
2. A native Supernote keyword on the current note that matches a deck name.
3. A folder name that matches a deck name.
4. The last selected deck.

You can always choose a different deck before adding or studying cards. The note link only changes the default suggestion.

### Link a Note to a Deck

1. Open the note you want to connect.
2. Open **Flashcards**.
3. Select the deck you want to use as the default.
4. In **Note Link**, turn on **Link note default**.
5. Optionally turn on **Add Supernote keyword**.
6. Tap **Apply**.

If the keyword already exists on the note, the plugin keeps going and still links the note to the deck.

### Add a Keyword Without Linking

1. Open the note.
2. Select the deck.
3. In **Note Link**, leave **Link note default** off.
4. Turn on **Add Supernote keyword**.
5. Tap **Apply**.

The keyword is placed in one of the available page positions so it does not have to overlap existing writing.

### Change or Remove a Note Link

To change a note's default deck, select a different deck and apply **Link note default** again.

To remove the saved note link, tap **Unlink Note**. A matching Supernote keyword or folder name may still suggest a deck afterward.

## Creating Flashcards

There are two ways to create cards.

### Manual Cards

1. Open a deck.
2. Tap **Add Manually**.
3. Enter the question.
4. Enter the answer.
5. Choose the target deck.
6. Tap **Add Flashcard**.

You can choose the linked default deck, another existing deck, or create a new deck before saving the card.

### Handwritten Cards With Lasso OCR

1. In a Supernote note, write the question on one line.
2. Write the answer on the line below it.
3. Lasso both handwritten lines together.
4. Tap **Add Flashcard** in the lasso toolbar.
5. The plugin OCRs the top line as the question and the lower line as the answer.
6. Edit the recognized text if needed.
7. Choose the target deck.
8. Tap **Add Flashcard**.

If the target deck does not exist yet, create it from the same screen before adding the card. If you are inside a note, you can also link the note to that new deck or add a keyword while creating it.

For best OCR results, keep the question and answer on separate horizontal lines with a little vertical space between them.

You can also add a card from a journal or another note that has no linked deck. In that case, choose any existing deck or create a new one before adding the card.

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
3. Edit the question or answer.
4. Use **Move to Deck** if the card belongs in a different deck.
5. Tap **Save Card**.

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

The plugin reads Anki's `#guid column` and `#deck column` metadata. It creates the deck if needed, adds new cards, updates changed cards with matching GUIDs, and skips unchanged duplicates.

Plugin FSRS scheduling stays independent from Anki. Review timing, ease, stability, difficulty, and other scheduling state do not transfer between Flashcards and Anki in either direction.

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
- No FSRS scheduling sync with Anki
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

If the local Metro watcher hits an open-file limit during packaging, build with:

```bash
CI=true ./buildPlugin.sh
```

The plugin package is written to:

```text
build/outputs/Flashcards.snplg
```

If you rename the package, clear old files from `build/generated/` before rebuilding. The Supernote plugin loader can pick up stale bundles if multiple bundle files are present.

## Development Notes

- The original stable base plugin is tagged as `working-flashcard-plugin-base`.
- The first beta with Anki text import/export is tagged as `v0.1.0-beta`.
- The note links, keyword defaults, in-flow deck creation, and move-card beta is tagged as `v0.2.0-beta`.
- Persistent plugin data is stored locally on the device by a small native storage module.
- FSRS scheduling is handled inside the plugin using `ts-fsrs`.

## License

MIT
