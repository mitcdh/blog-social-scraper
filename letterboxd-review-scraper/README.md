# Letterboxd Review Scraper

Fetches a member's public Letterboxd RSS feed and returns only entries that contain written reviews. Watch-only diary entries and ratings without reviews are ignored.

## Setup

Set the Letterboxd username:

```sh
LETTERBOXD_USERNAME=mitcdh
```

No Letterboxd API key is required because the module uses the member's public RSS feed.

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

Each result includes the film title and year, rating, written review, publication timestamp, Letterboxd link, and poster URL. Poster URLs are upgraded from the RSS feed's 600×900 version to a verified 1200×1800 version for retina output.
