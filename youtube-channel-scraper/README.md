# YouTube Channel Scraper

## Overview

`youtube-channel-scraper.js` is a Node.js module designed to scrape all videos from a specified YouTube channel. It retrieves comprehensive details for each video, including the title, an embed link, the timestamp of publication, and a detailed breakdown of the video description.

## Prerequisites

*  Node.js installed on your system.
*  An active YouTube Data API key.
*  The Channel ID of the YouTube channel you wish to scrape.

## Installation

1.  Clone or download `youtube-channel-scraper.js` into your Node.js project.
2.  Ensure you set the following environment variables:

```sh
YOUTUBE_API_KEY=your_youtube_api_key
YOUTUBE_CHANNEL_ID=your_channel_id
```

3.  Replace `your_youtube_api_key` and `your_channel_id` with your actual API key and YouTube channel ID.

## Usage

### As a Standalone Script

To run the script independently, use Node.js:

    node youtube-channel-scraper.js

This command lists all videos from the specified YouTube channel and outputs the details to the console.

### As an Importable Module

To use `youtube-channel-scraper` in your Node.js project, import the `listAllVideos` function:

```js
const listAllVideos = require('./path/to/youtube-channel-scraper');

listAllVideos()
  .then(videos => console.log(videos))
  .catch(error => console.error(error));
```

This function returns a promise that resolves to an array of video details.

## Features

The module retrieves the following details for each video in the specified YouTube channel:

*  Video Title: The title of the video.
*  Embed Link: A direct link to embed the video.
*  Timestamp of Publication: The publication date and time of the video.
*  Video Description: The whole video description.

## Limitations

*  Be mindful of the quota limits associated with your YouTube Data API key.
*  Pagination for channels with a very large number of videos is not specifically handled.