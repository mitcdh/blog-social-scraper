# Hardcover Review Scraper

Fetches every written review belonging to the authenticated Hardcover account through Hardcover's GraphQL API. Results include the review timestamp, rating, book link, and the book's cover image.

## Setup

Create an API token from Hardcover's account settings, keep it private, and expose it only to the build environment:

```sh
HARDCOVER_API_TOKEN=your_private_token
```

The token may be supplied with or without the `Bearer` prefix. Hardcover tokens expire periodically, so replace the build secret when Hardcover rotates it.

Optional pagination settings:

```sh
HARDCOVER_PAGE_SIZE=50
HARDCOVER_MAX_PAGES=100
```

## Usage

Run it directly:

```sh
node hardcover-review-scraper.js
```

Or import it:

```js
const getHardcoverReviews = require('./hardcover-review-scraper');

const reviews = await getHardcoverReviews();
```

The module identifies the authenticated account first, then pages through that account's `user_books` records with `has_review: true`. It uses `reviewed_at` as the review date and falls back to `date_added` only when the API does not provide a review timestamp.
