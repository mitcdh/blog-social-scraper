# Flickr Album Scraper

This Node.js module is designed to fetch album data from Flickr, including album titles (with prefix dates removed), descriptions, timestamps of the last photo taken, album links, and feature image URLs.

## Setup

### Prerequisites

- Node.js installed on your system.
- A Flickr API key and User ID.

### Installation

1. **Clone the Repository** (if you have it in a repository) or create a new Node.js project and include the provided module file (`flickr-album-scraper.js`).

2. Ensure you set the following environment variables:

```sh
FLICKR_API_KEY=your_flickr_api_key
FLICKR_USER_ID=your_flickr_user_id
```

Replace `your_flickr_api_key` and `your_flickr_user_id` with your actual Flickr API key and user ID. You can also define a prefix date format through a regular expression with `DATE_REGEX` if desired.

## Usage

### As a Standalone Script

Run `flickr-album-scraper.js` directly using Node.js to fetch and display album data:

    node flickr-album-scraper.js

### As an Imported Module

Import the `getAlbums` function from `flickr-album-scraper.js` into another Node.js script:

```
const getAlbums = require('./flickr-album-scraper');

getAlbums().then(albumsData => {
  console.log('Album Data:', albumsData);
}).catch(error => {
  console.error('Error:', error);
});
```

## Functionality

The module fetches the following data for each album:

*  Title: Album title with any leading date in the format `yyyy-mm` removed.
*  Description: Album description.
*  Last Photo Timestamp: Timestamp of the last photo taken in the album.
*  Album Link: Direct link to the album on Flickr.
*  Feature Image URL: URL of the album's feature image.

## Notes

* Pagination is not handled.
* The module assumes the last photo in an album has EXIF data for the timestamp, which may not always be the case. You can remedy this by just ensuring the last photo, as organised in organizr is EXIF tagged.
