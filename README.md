# Blog Social Scraper
## Overview

`blog-social-scraper` is a custom Node.js script specifically developed how my personal site at [blog.mitcdh.au](https://blog.mitcdh.au) works but it might help you too. This tool automates the process of extracting multimedia content from a designated YouTube channel and a Flickr user account, allowing them to be output into markdown files for populating a blog. It is streamline my workflow by automatically generating Hugo-compatible blog posts for deployment on a tool like [Cloudflare Pages](https://pages.cloudflare.com/).

## Prerequisites

*  Node.js installed on your system.
*  API access set up for YouTube and Flickr (API keys required).
*  Optionally a static site generator installed (for example to run `hugo`).

## Installation and Setup

1.  Clone the Repository: Clone this repository to your machine with submodules `git clone --recurse-submodules -j8 https://github.com/mitcdh/blog-social-scraper`.
2.  Set API Keys and Build Command: Define necessary API keys (`FLICKR_API_KEY`, `YOUTUBE_API_KEY`) and `BUILD_COMMAND` in your environment or a `.env` file.

## Running the Script

1.  Execute: Run the script with `node blog-social-scraper`.
2.  Build Process: If `BUILD_COMMAND` is set, the script will execute it post-processing and include its output and status in the final JSON report.

## Troubleshooting

*  Confirm the correct setup of the required API keys.
*  If errors occur, refer to the console output for detailed error messages.
*  Ensure the build command (if utilized) is properly configured and functional.