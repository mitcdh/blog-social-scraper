# Letterboxd Review Scraper

Combines a member's Letterboxd review export with their public RSS feed and returns written reviews. Watch-only diary entries and ratings without reviews are ignored.

## Setup

Set the Letterboxd username and, when required, the review archive path:

```sh
LETTERBOXD_USERNAME=mitcdh
LETTERBOXD_ARCHIVE_PATH=build/social-data/reviews.csv
LETTERBOXD_ARCHIVE_CONCURRENCY=4
```

No Letterboxd API key is required. Either the username or an existing archive is sufficient; using both provides complete history plus new reviews. `LETTERBOXD_ARCHIVE_CONCURRENCY` limits simultaneous historical poster lookups and defaults to four.

## Usage

Run it directly:

```sh
node letterboxd-review-scraper.js
```

Or import it:

```js
const getLetterboxdReviews = require('./letterboxd-review-scraper');

const reviews = await getLetterboxdReviews();
```

Each result includes the film title and year, rating, written review, publication timestamp, Letterboxd link, and poster URL.

The archive parser supports quoted commas, embedded newlines, and escaped quotes in Letterboxd's CSV format. Archive and RSS rows are matched using film, year, and review date, with normalized review text as a fallback. The RSS record wins a match because it has the precise publication timestamp and a direct poster URL.

RSS posters are upgraded from 600×900 to 1200×1800. For archive-only rows, the scraper follows the exported Letterboxd URI, selects portrait artwork from the public page, and requests the same retina dimensions.
