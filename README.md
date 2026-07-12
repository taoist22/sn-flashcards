# Flashcards for Supernote


https://github.com/user-attachments/assets/618ab801-f4fe-4a61-95de-a6d03889f61b


Flashcards is a beta spaced-repetition flashcard plugin for Supernote Nomad and Manta. It lets you create decks, add cards manually, turn lassoed handwriting into question/answer cards with OCR, keep the front and/or back as actual handwriting instead of recognized text, add optional hints and supplementary images, study with FSRS scheduling, and move basic text cards between the plugin and Anki Desktop.

> **Beta notice:** This plugin is built for Supernote's beta plugin system and beta development OS. Keep backups of important decks, expect occasional rough edges, and test new workflows with a small deck before relying on them heavily.

## Features

- Create, select, and delete decks from the deck list
- Create a needed deck while adding a flashcard
- Link a Supernote note to a default deck
- Optionally add a Supernote keyword when linking a note
- Use linked notes, note keywords, and folder names to suggest the right deck
- Add flashcards manually or from handwritten notes with the lasso toolbar
- Keep a card's front and/or back as your actual handwriting (an image) instead of recognized text
- Capture handwriting by default, skipping text recognition entirely — useful for non-Latin scripts, math notation, or diagrams that OCR would otherwise mangle
- Add a context image to a card, sourced from an imported file or lassoed straight from a note
- Add an optional hint, revealed on request during study, as text or an image
- Move cards from one deck to another
- Review cards with a temporary editable guess box
- Schedule reviews with FSRS
- View basic deck stats
- Choose per-card whether an image-based card is included in Anki export
- Import basic Anki Desktop plain text exports
- Export decks back to Anki-compatible plain text
- Card list shows a device-aware tile grid (3 columns on Nomad, 4 on Manta) with image previews

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

### Keeping a Side as Handwriting Instead of Text

The lasso capture always tries to OCR your handwriting, but it also keeps a cropped image of each line. In the **Question** and **Answer** sections of the Add Flashcard screen, a **Keep as handwriting** checkbox appears under any side that has a captured image.

Turn it on to use your actual handwriting as that side's content instead of the recognized text. The recognized text is not lost — it stays attached to the card as a fallback, used for search and for Anki export if you later include the card in an export.

Handwriting kept this way is a flat image, not editable ink. To change what it says, use **Replace Handwriting** from the Edit screen (see [Editing Cards](#editing-cards)) rather than trying to edit the picture.

### Capturing Handwriting by Default

If you write mostly in a script, notation, or drawing style that OCR doesn't recognize well — Mandarin, math notation, diagrams — text recognition just produces something to clean up on every card. Turn on **Capture handwriting by default (skip text recognition)** at the bottom of the Add Flashcard screen to skip OCR entirely: new lasso captures arrive with both sides already set to handwriting, and nothing is sent through recognition. This is a standing setting — set it once and it stays on for future cards until you turn it off.

## Context Images and Hints

Every card can also carry two optional extras, independent of whether the question and answer are text or handwriting:

- **Context Image** — a supplementary image attached to either the front or the answer. Useful for a diagram or picture that belongs alongside the question or the reveal.
- **Hint** — text or an image, hidden by default and revealed on request while studying.

Both are added from the **Add Image** section, which appears on the Add Flashcard and Edit Card screens.

### Adding an Image

There are two sources:

- **Add Image** opens a file picker so you can choose any existing image on the device — including a clip saved by the separate FrameClip plugin, if you use it.
- **Go to Note** closes the plugin so you can lasso an image directly from a note. Lasso either handwritten ink or an inserted picture, then tap **Add Image to Flashcard** in the lasso toolbar. The plugin reopens automatically on the same card.

Either way, once an image arrives you'll see an **"Image added — attach it to"** prompt with three buttons: **Front**, **Answer**, and **Hint**. Tap the one you want; the image is discarded if you tap **Discard** instead.

By default, tapping **Front** or **Answer** attaches the image as a context image next to the existing question/answer content — it doesn't replace anything. Tapping **Hint** always sets the hint directly.

### Replacing Content Instead of Adding to It

If you'd rather the image *become* the front or answer content — for example, building a card where the front, hint, and answer are each an independently sourced image or handwritten line — turn on **Replace front/answer content with image (instead of adding as context)**, the checkbox at the top of the Add Image section. With it on, tapping **Front** or **Answer** sets that side's actual content to the new image (existing text is kept as a fallback, not deleted). This is a standing setting, remembered across cards until you turn it off.

With this on, you can build a card with three independently sourced images — say, an image as the front, one handwritten line as the hint, and a second handwritten line as the answer — by doing three separate "Go to Note → lasso → Add Image to Flashcard → pick a destination" round trips in any order, starting from **Add Manually** rather than the two-line lasso capture (which is specifically for lassoing a question and answer together).

### Managing Context Images and Hints

In the Add Image section, once a context image is attached, you can switch which side it's attached to, move it to the hint instead, or remove it. A hint's image can be removed the same way; hint text is edited directly like the question or answer.

## Studying Cards

1. Open a deck.
2. Tap **Study Due** or **Study**.
3. Read the question.
4. If the card has a hint, tap **Show Hint** to reveal it before guessing.
5. Use the editable **Guess** box to type or handwrite your answer.
6. Tap **Show Answer**.
7. Rate your recall:
   - **Again**
   - **Hard**
   - **Good**
   - **Easy**

The guess is temporary. It is cleared when you reveal the answer or move to the next card, and it is never saved.

## Editing Cards

1. Open a deck.
2. Tap a card tile in the card list.
3. Edit the question or answer.
4. Use **Move to Deck** if the card belongs in a different deck.
5. Tap **Save Card**.

Deleting a card removes it from the plugin and also removes its local review history.

### Editing a Handwritten Side

A side that's set to handwriting shows the captured image instead of a text box, plus two actions:

- **Convert to Text** clears the image and falls back to whatever recognized text exists for that side, letting you type a replacement. This is one-way — there's no button to turn text back into the original image.
- **Replace Handwriting** sends you to the note to lasso corrected writing, which swaps directly into that same side once you tap **Add Image to Flashcard**. Use this to fix a mistake without losing the card's deck placement or review history. It only appears once a side is already in handwriting mode — a brand new text card doesn't have this option, since there's no original ink to fix.

### Include in Anki Export

Every card has an **Include in Anki export** checkbox on the Edit and Add Flashcard screens. It defaults to on for a fully text card, and off the moment any side, context image, or hint is image-based (see [Anki Export](#anki-export)). You can flip it either way, per card, regardless of content.

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

### Handwriting, Images, and Anki

Anki's plain-text export only has room for two text fields per card — there's no way to embed a handwriting image or a hint into it. Rather than exporting something broken, a card is skipped from export entirely when its **Include in Anki export** checkbox is off, which happens automatically the moment any side, context image, or hint becomes image-based. Skipped cards simply don't appear in the exported file — nothing is written for them, so there's nothing to collide with on a later import.

If you flip a card back to included despite having image content, its recognized-text fallback (if any) is what gets exported for that side; the hint and any context image are never exported regardless of this setting, since Anki's format has no field for them.

## Current Limitations

- No direct `.apkg` or `.colpkg` import
- No cloze support yet
- No Anki scheduling or stats import
- No FSRS scheduling sync with Anki
- Large decks may be slow because the plugin currently stores cards in a JSON database
- Handwriting kept as an image is a flat picture, not editable ink — there is no way to touch up individual strokes; use **Replace Handwriting** to redo it from fresh lasso input instead
- Image-based cards are excluded from Anki export by default, and even when included, an image side exports as its recognized-text fallback (or blank) rather than the image itself — hints and context images never export at all

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
- The lasso toolbar registers two custom buttons. **Add Flashcard** (stroke-only) is the entry point for the two-line OCR/handwriting capture and can launch the plugin fresh from a note. **Add Image to Flashcard** (strokes or inserted pictures) drives the Context Image/Hint capture flow and is meant to be used mid-session, via **Go to Note** on an already-open Capture or Edit screen, which closes the plugin and lets the same button reopen it on that same card once you've lassoed.
- The card list's tile-grid column count is device-aware via `useWindowDimensions`, the same technique the sibling FrameClip plugin uses to distinguish Nomad from Manta screens.

## License

MIT
