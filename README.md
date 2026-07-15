# Blog Social Scraper
## Overview

`blog-social-scraper` is a custom Node.js script specifically developed for how my personal site at [blog.mitcdh.au](https://blog.mitcdh.au) works, but it might help you too. It creates Hugo posts from YouTube videos, Flickr albums, written Letterboxd film reviews, and written Hardcover book reviews.

## Prerequisites

*  Node.js installed on your system.
*  API access set up for YouTube, Flickr, and Hardcover.
*  A public Letterboxd profile with its RSS feed enabled.
*  Optionally, a static site generator is installed (for example, to run `Hugo`).

## Installation and Setup

1.  Clone the repository normally: `git clone https://github.com/mitcdh/blog-social-scraper`. All four scraper modules are included directly in the repository.
2.  Define the required environment variables in the build environment or a local `.env` file:

    ```sh
    FLICKR_API_KEY=...
    FLICKR_USER_ID=...
    YOUTUBE_API_KEY=...
    YOUTUBE_CHANNEL_ID=...
    LETTERBOXD_USERNAME=...
    LETTERBOXD_ARCHIVE_PATH=build/social-data/reviews.csv
    LETTERBOXD_ARCHIVE_CONCURRENCY=4
    HARDCOVER_API_TOKEN=...
    BUILD_COMMAND=hugo
    ```

    `HARDCOVER_API_TOKEN` is a private account credential and must never be exposed to browser-side code or committed to the repository.

## Running the Script

1.  Execute: Run the script with `node blog-social-scraper`.
2.  Build Process: If `BUILD_COMMAND` is set, the script will execute it and include its output and status in the final JSON report.

Each source runs independently. A missing configuration skips only that source, and a failed API does not prevent the remaining sources or the configured build command from running.

## Review Posts

Only written reviews are imported. Letterboxd watch-only diary entries are ignored, and Hardcover is queried with `has_review: true`.

The Letterboxd scraper can merge an account export with the live RSS feed. `LETTERBOXD_ARCHIVE_PATH` points to Letterboxd's `reviews.csv`; in this blog it defaults to `build/social-data/reviews.csv`. RSS versions replace matching archive rows so the latest timestamp, link, and direct poster are used without generating a duplicate post.

Review posts use the review publication timestamp as the Hugo date, download the film poster or book cover into `static/images`, and include `Review` plus either `Film` or `Book` tags. Their filenames include the review date and media type so a later re-review cannot overwrite an earlier post.

Letterboxd's RSS posters are upgraded to 1200×1800 before download. Archive rows discover their poster from the public Letterboxd review page at build time and request the same retina dimensions. If an archive poster cannot be resolved, the review page is still generated without a broken image. Hugo can then generate the responsive title-image variants used by the blog, including 2× display densities.

## Tests

Run the parser and post-generation tests with:

```sh
node --test test/review-scrapers.test.js
```

## Troubleshooting

*  Any albums prefixed with a '#' or '@' will be excepted as it's assumed they are either compiliations or one off transfers of pictures.
*  Confirm the correct setup of the required API keys and usernames.
*  Hardcover tokens expire periodically; create a new token in Hardcover account settings when authentication starts returning HTTP 401.
*  Refer to the console output for detailed error messages if errors occur.
*  Ensure the build command (if utilized) is properly configured and functional.
